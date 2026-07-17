:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  width: 390px;
  background: #f5f3ee;
  color: #181818;
}

.panel { padding: 20px; }

.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.eyebrow {
  margin: 0 0 3px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .2em;
  color: #6d6559;
}

h1 {
  margin: 0;
  font-size: 23px;
  letter-spacing: -.03em;
}

h1 span {
  font-size: 12px;
  color: #726a5f;
  vertical-align: middle;
}

.server-dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: #9c968e;
  box-shadow: 0 0 0 4px rgba(156,150,142,.18);
}

.server-dot.online {
  background: #16834a;
  box-shadow: 0 0 0 4px rgba(22,131,74,.14);
}

.server-dot.offline {
  background: #cf3b2e;
  box-shadow: 0 0 0 4px rgba(207,59,46,.14);
}

.card {
  padding: 15px;
  border: 1px solid #d9d3c8;
  border-radius: 15px;
  background: #fffdfa;
  box-shadow: 0 8px 25px rgba(54,45,34,.06);
}

label {
  display: block;
  margin-bottom: 9px;
  font-size: 13px;
  font-weight: 750;
}

textarea {
  width: 100%;
  resize: vertical;
  min-height: 104px;
  padding: 11px 12px;
  border: 1px solid #cfc7bb;
  border-radius: 10px;
  background: #fff;
  color: #181818;
  font: inherit;
  font-size: 13px;
  line-height: 1.45;
  outline: none;
}

textarea:focus {
  border-color: #2d2d2d;
  box-shadow: 0 0 0 3px rgba(45,45,45,.08);
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

button {
  border: 0;
  border-radius: 9px;
  padding: 9px 12px;
  background: #1f1f1f;
  color: white;
  font: inherit;
  font-size: 12px;
  font-weight: 750;
  cursor: pointer;
}

button:hover { background: #393939; }

#saveMessage {
  font-size: 12px;
  color: #4f765e;
}

.shortcuts {
  margin: 14px 0;
  padding: 12px 14px;
  border-radius: 13px;
  background: #e9e4da;
}

.shortcut-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
}

.shortcut-row + .shortcut-row { margin-top: 9px; }
.shortcut-row strong { margin-left: auto; font-size: 12px; }

kbd {
  min-width: 24px;
  padding: 3px 5px;
  border: 1px solid #bcb3a5;
  border-bottom-width: 2px;
  border-radius: 5px;
  background: #fff;
  text-align: center;
  font: inherit;
  font-weight: 700;
}

.legend {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.legend > div {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px;
  border: 1px solid #ddd6cb;
  border-radius: 10px;
  background: rgba(255,255,255,.62);
}

.legend p {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.25;
}

.badge {
  display: inline-grid;
  place-items: center;
  min-width: 27px;
  height: 21px;
  padding: 0 5px;
  border-radius: 5px;
  color: white;
  font-size: 11px;
  font-weight: 800;
}

.badge.answer { background: #27364a; }
.badge.unsure { background: #f4b400; color: #111; }
.badge.error { background: #d93025; }

.server-text {
  margin: 13px 0 4px;
  font-size: 11px;
  color: #746d63;
}

.shortcut-link {
  font-size: 11px;
  color: #34312d;
}
