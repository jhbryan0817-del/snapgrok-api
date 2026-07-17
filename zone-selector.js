(() => {
  "use strict";

  function sanitizeAnswer(value) {
    const label = String(value ?? "")
      .trim()
      .toUpperCase()
      .replace(/^[\s([{]+|[\s)\]},.;:]+$/g, "")
      .replace(/\s+/g, " ");

    return label && label.length <= 16 ? label : null;
  }

  function normalizeResult(source) {
    const value = source && typeof source === "object" ? source : {};
    const status = String(value.status || "").trim().toLowerCase();
    const incomingAnswers = Array.isArray(value.answers) ? value.answers : [];
    const answers = [];
    const seen = new Set();

    for (const incoming of incomingAnswers) {
      const answer = sanitizeAnswer(incoming);
      if (!answer || seen.has(answer)) continue;
      seen.add(answer);
      answers.push(answer);
    }

    if (status === "answered" && answers.length > 0) {
      return { status: "answered", answers };
    }

    if (status === "inconclusive") {
      return { status: "inconclusive", answers: [] };
    }

    return null;
  }

  function parseTextFallback(text) {
    const value = String(text || "").trim();
    if (!value) return null;

    try {
      return normalizeResult(JSON.parse(value));
    } catch {
      const statusMatch = value.match(/status\s*:\s*(answered|inconclusive)/i);
      const answersMatch = value.match(/answers\s*:\s*([^\n\r]*)/i);
      if (!statusMatch) return null;

      const answers = answersMatch?.[1]
        ? answersMatch[1]
            .split(/\s*(?:,|\band\b|\+)\s*/i)
            .filter(Boolean)
        : [];

      return normalizeResult({ status: statusMatch[1], answers });
    }
  }

  function parseServerPayload(payload) {
    return (
      normalizeResult({ status: payload?.status, answers: payload?.answers }) ||
      normalizeResult(payload?.result) ||
      parseTextFallback(payload?.text)
    );
  }

  function badgeForAnswers(answers) {
    if (!Array.isArray(answers) || answers.length === 0) return "?";

    if (answers.length === 1 && answers[0].length <= 4) {
      return answers[0];
    }

    return `${answers.length}✓`;
  }

  self.SnapGrokProtocol = {
    normalizeResult,
    parseServerPayload,
    badgeForAnswers,
  };
})();
