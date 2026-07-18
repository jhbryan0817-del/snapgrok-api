# SnapGrok V3.8 testing

## Parser cases
- A
- Answer: B
- The correct answer is C.
- A, C
- Answers: A and C
- {"status":"answer","answers":["A","C"]}
- ```json {"status":"inconclusive","answers":[]} ```
- F / inconclusive

## Workflow cases
- Ten consecutive full captures, waiting for each four-second reset.
- Ten consecutive selected-area captures.
- Alternate full and selected capture.
- Confirm processing icon appears only after capture.
- Confirm multiple-answer icon count and hover title.
- Confirm shortcuts are ignored until default icon returns.
- Confirm Escape cancels selection without a system-error result.


## Parser regression cases
- `{"status":"answered","answers":["D"]}`
- `{"status":"answer","answers":["A","C"]}`
- server wrapper `{ "ok": true, "text": "..." }`
- nested result objects
- double-encoded JSON strings
- Responses API-style output arrays
- inconclusive status
- labelled plain-text fallback
