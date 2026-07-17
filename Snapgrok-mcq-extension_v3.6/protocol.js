(() => {
  "use strict";

  function buildInstruction(userInstruction) {
    return [
      String(userInstruction || "").trim(),
      "The screenshot contains a multiple-choice problem. Determine the single best answer from choices A, B, C, D, or E. If the screenshot is insufficient, unreadable, ambiguous, or does not support one defensible answer, return F for inconclusive.",
      "FINAL OUTPUT RULE: Return exactly one uppercase character: A, B, C, D, E, or F. Do not include words, explanations, punctuation, markdown, or extra whitespace.",
    ].join("\n\n");
  }

  function parseChoice(value) {
    const text = String(value || "")
      .toUpperCase()
      .replace(/[`*_#]/g, "")
      .trim();

    const single = text.match(/^\(?\s*([A-F])\s*\)?[.!]?$/);
    if (single) return single[1];

    const labelled = text.match(
      /^(?:FINAL\s+ANSWER|ANSWER|CHOICE|OPTION|FINAL)\s*(?:IS|:|=|-)??\s*\(?\s*([A-F])\s*\)?[.!]?$/,
    );
    return labelled ? labelled[1] : null;
  }

  self.SnapGrokProtocol = {
    buildInstruction,
    parseChoice,
  };
})();
