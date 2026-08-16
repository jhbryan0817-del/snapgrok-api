(() => {
  "use strict";

  const VALID_OPTIONS = Object.freeze(["A", "B", "C", "D", "E"]);
  const VALID_SET = new Set(VALID_OPTIONS);
  const PRIORITY_KEYS = Object.freeze([
    "text",
    "output_text",
    "content",
    "answer",
    "answers",
    "result",
    "response",
    "output",
    "message",
    "data",
    "choices",
    "options",
    "correct_answers",
    "correct_options",
  ]);

  function buildInstruction(userInstruction) {
    return String(userInstruction || "").trim();
  }

  // Parse the complete backend response rather than selecting only one field.
  // This remains compatible with the current server response { ok, text, ... }
  // and also tolerates nested or double-encoded text values.
  function parseBackendPayload(payload) {
    const direct = parseStructuredDeep(payload, new Set(), 0);
    if (direct) return direct;

    for (const candidate of collectStringCandidates(payload)) {
      const result = parseText(candidate);
      if (result) return result;
    }

    return null;
  }

  function parseAnswer(value) {
    return parseBackendPayload(value);
  }

  function parseStructuredDeep(value, seen, depth) {
    if (depth > 8 || value == null) return null;

    if (typeof value === "string") {
      return parseText(value);
    }

    if (typeof value !== "object") return null;
    if (seen.has(value)) return null;
    seen.add(value);

    if (Array.isArray(value)) {
      const directAnswers = normalizeAnswers(value);
      if (directAnswers.length) return answerOutcome(directAnswers);

      for (const item of value) {
        const nested = parseStructuredDeep(item, seen, depth + 1);
        if (nested) return nested;
      }
      return null;
    }

    const status = normalizeStatus(
      value.status ?? value.state ?? value.outcome ?? value.type ?? "",
    );
    const rawAnswers =
      value.answers ??
      value.answer ??
      value.options ??
      value.choices ??
      value.correct_options ??
      value.correct_answers;
    const answers = normalizeAnswers(rawAnswers);

    if (isInconclusiveStatus(status)) {
      return inconclusiveOutcome();
    }

    if (answers.length) {
      return answerOutcome(answers);
    }

    // Search likely response fields first. This avoids model/usage metadata
    // winning before the actual output field.
    for (const key of PRIORITY_KEYS) {
      if (!(key in value)) continue;
      const nested = parseStructuredDeep(value[key], seen, depth + 1);
      if (nested) return nested;
    }

    for (const [key, nestedValue] of Object.entries(value)) {
      if (PRIORITY_KEYS.includes(key)) continue;
      const nested = parseStructuredDeep(nestedValue, seen, depth + 1);
      if (nested) return nested;
    }

    return null;
  }

  function parseText(rawValue) {
    const raw = String(rawValue ?? "").trim();
    if (!raw) return null;

    const text = stripFormatting(raw);
    if (!text) return null;

    // Decode complete JSON, including JSON that was encoded as a JSON string.
    let decoded = text;
    for (let pass = 0; pass < 4; pass += 1) {
      const parsed = tryJsonParse(decoded);
      if (parsed === undefined) break;

      const structured = parseStructuredDeep(parsed, new Set(), 0);
      if (structured) return structured;

      if (typeof parsed !== "string") break;
      decoded = stripFormatting(parsed);
    }

    // Parse embedded JSON objects/arrays if surrounding text was added.
    for (const candidate of extractJsonFragments(text)) {
      const parsed = tryJsonParse(candidate);
      if (parsed === undefined) continue;
      const structured = parseStructuredDeep(parsed, new Set(), 0);
      if (structured) return structured;
    }

    // Last-resort structured extraction. This specifically handles outputs
    // such as {"status":"answered","answers":["D"]} even if stray
    // characters make the complete JSON invalid.
    const answersProperty = text.match(
      /["']?answers["']?\s*:\s*\[([^\]]*)\]/i,
    );
    if (answersProperty) {
      const answers = normalizeAnswers(answersProperty[1]);
      if (answers.length) return answerOutcome(answers);

      if (/\b(?:inconclusive|unclear|ambiguous|unreadable)\b/i.test(text)) {
        return inconclusiveOutcome();
      }
    }

    if (isInconclusiveText(text)) return inconclusiveOutcome();

    const tokenOnly = parseTokenOnlyAnswer(text);
    if (tokenOnly) return tokenOnly;

    const labelled = parseLabelledAnswer(text);
    if (labelled) return labelled;

    return null;
  }

  function collectStringCandidates(value) {
    const results = [];
    const seenObjects = new Set();
    const seenStrings = new Set();

    function add(text) {
      const normalized = String(text ?? "").trim();
      if (!normalized || seenStrings.has(normalized)) return;
      seenStrings.add(normalized);
      results.push(normalized);
    }

    function walk(current, depth) {
      if (depth > 8 || current == null) return;
      if (typeof current === "string") {
        add(current);
        return;
      }
      if (typeof current !== "object" || seenObjects.has(current)) return;
      seenObjects.add(current);

      if (Array.isArray(current)) {
        for (const item of current) walk(item, depth + 1);
        return;
      }

      for (const key of PRIORITY_KEYS) {
        if (key in current) walk(current[key], depth + 1);
      }
      for (const [key, nested] of Object.entries(current)) {
        if (!PRIORITY_KEYS.includes(key)) walk(nested, depth + 1);
      }
    }

    walk(value, 0);
    return results;
  }

  function tryJsonParse(value) {
    try {
      return JSON.parse(String(value).trim());
    } catch {
      return undefined;
    }
  }

  function extractJsonFragments(text) {
    const fragments = [];
    const source = String(text || "");

    for (const [opening, closing] of [["{", "}"], ["[", "]"]]) {
      let depth = 0;
      let start = -1;
      let inString = false;
      let escaped = false;

      for (let index = 0; index < source.length; index += 1) {
        const character = source[index];

        if (inString) {
          if (escaped) escaped = false;
          else if (character === "\\") escaped = true;
          else if (character === '"') inString = false;
          continue;
        }

        if (character === '"') {
          inString = true;
          continue;
        }

        if (character === opening) {
          if (depth === 0) start = index;
          depth += 1;
        } else if (character === closing && depth > 0) {
          depth -= 1;
          if (depth === 0 && start >= 0) {
            fragments.push(source.slice(start, index + 1));
            start = -1;
          }
        }
      }
    }

    return [...new Set(fragments)];
  }

  function normalizeAnswers(value) {
    let tokens = [];

    if (Array.isArray(value)) {
      tokens = value.flatMap((item) => extractOptionTokens(item));
    } else if (typeof value === "string" || typeof value === "number") {
      tokens = extractOptionTokens(value);
    } else if (value && typeof value === "object") {
      tokens = Object.values(value).flatMap((item) => extractOptionTokens(item));
    }

    const unique = [...new Set(tokens.filter((option) => VALID_SET.has(option)))];
    return VALID_OPTIONS.filter((option) => unique.includes(option));
  }

  function extractOptionTokens(value) {
    const text = String(value ?? "").toUpperCase();
    const matches = text.match(/(^|[^A-Z0-9])([A-E])(?=$|[^A-Z0-9])/g) || [];
    return matches
      .map((match) => match.match(/[A-E]/)?.[0])
      .filter(Boolean);
  }

  function normalizeStatus(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function isInconclusiveStatus(status) {
    return [
      "inconclusive",
      "unclear",
      "ambiguous",
      "unreadable",
      "insufficient",
      "unknown",
      "f",
    ].some((word) => status === word || status.includes(word));
  }

  function stripFormatting(value) {
    return String(value || "")
      .replace(/^\uFEFF/, "")
      .replace(/```(?:json|javascript|js|text)?/gi, "")
      .replace(/```/g, "")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[`*_#]/g, "")
      .replace(/[\u200B-\u200D\u2060]/g, "")
      .trim();
  }

  function isInconclusiveText(text) {
    const normalized = text.trim().toUpperCase();
    if (/^\(?\s*F\s*\)?[.!?]?$/.test(normalized)) return true;
    if (/^\?$/.test(normalized)) return true;
    return /\b(INCONCLUSIVE|INSUFFICIENT|UNREADABLE|UNCLEAR|AMBIGUOUS|CANNOT\s+DETERMINE|CAN'T\s+DETERMINE|NO\s+DEFENSIBLE\s+ANSWER)\b/i.test(text)
      && !/\b(?:ANSWER|ANSWERS|OPTION|OPTIONS|CHOICE|CHOICES)\b[\s\S]*\b[A-E]\b/i.test(text);
  }

  function parseTokenOnlyAnswer(text) {
    let normalized = text
      .toUpperCase()
      .replace(/\b(?:AND|OR)\b/g, ",")
      .replace(/[\[\](){}]/g, "")
      .replace(/[\/+;&|]/g, ",")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/[.!:]$/, "");

    if (!normalized) return null;
    if (!/^[A-E](?:\s*,?\s*[A-E])*$/.test(normalized)) return null;

    const answers = normalizeAnswers(normalized);
    return answers.length ? answerOutcome(answers) : null;
  }

  function parseLabelledAnswer(text) {
    const patterns = [
      /(?:FINAL\s+)?(?:ANSWER|ANSWERS|CHOICE|CHOICES|OPTION|OPTIONS)\s*(?:(?:IS|ARE)\s*)?(?::|=|-)?\s*([^\n]+)/i,
      /(?:THE\s+)?CORRECT\s+(?:ANSWER|ANSWERS|CHOICE|CHOICES|OPTION|OPTIONS)\s*(?:(?:IS|ARE)\s*)?(?::|=|-)?\s*([^\n]+)/i,
      /(?:SELECT|CHOOSE)\s+([^\n]+)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (!match) continue;

      const segment = match[1]
        .split(/\b(?:BECAUSE|SINCE|AS\s+THE|WHICH|WHEREAS)\b/i)[0]
        .slice(0, 160);
      const answers = normalizeAnswers(segment);
      if (answers.length) return answerOutcome(answers);
    }

    return null;
  }

  function answerOutcome(answers) {
    return { status: "answer", answers: normalizeAnswers(answers) };
  }

  function inconclusiveOutcome() {
    return { status: "inconclusive", answers: [] };
  }

  self.SnapGrokProtocol = {
    VALID_OPTIONS,
    buildInstruction,
    parseAnswer,
    parseBackendPayload,
  };
})();
