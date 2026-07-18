# V3.9 tests

1. Confirm normal responses under 27 seconds still work.
2. Simulate a 35-60 second backend response and confirm the processing icon remains visible and the answer eventually appears.
3. Confirm a response exceeding 120 seconds becomes a system error.
4. Confirm repeated shortcuts are ignored while processing.
5. Confirm the result resets after four seconds and the next request works.
6. Confirm both full and selected-zone capture work.
7. Confirm no notification permission or notification calls exist.
