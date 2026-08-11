"use client";

import { useState } from "react";

const primaryModifiers = ["Ctrl", "Alt", "Command"] as const;
const secondaryModifiers = ["Shift", "Alt", "Ctrl"] as const;
const shortcutKeys = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

type ShortcutRowProps = {
  label: string;
  initialKey: string;
};

function ShortcutRow({ label, initialKey }: ShortcutRowProps) {
  const [primary, setPrimary] = useState("Ctrl");
  const [secondary, setSecondary] = useState("Shift");
  const [key, setKey] = useState(initialKey);

  return (
    <div className="shortcut-control-row">
      <span>{label}</span>
      <div className="shortcut-selects">
        <select aria-label={`${label} first key`} value={primary} onChange={(event) => setPrimary(event.target.value)}>
          {primaryModifiers.map((option) => <option key={option}>{option}</option>)}
        </select>
        <b>+</b>
        <select aria-label={`${label} second key`} value={secondary} onChange={(event) => setSecondary(event.target.value)}>
          {secondaryModifiers.map((option) => <option key={option}>{option}</option>)}
        </select>
        <b>+</b>
        <select aria-label={`${label} letter key`} value={key} onChange={(event) => setKey(event.target.value)}>
          {shortcutKeys.map((option) => <option key={option}>{option}</option>)}
        </select>
      </div>
    </div>
  );
}

export function ShortcutExperience() {
  return (
    <div className="shortcut-preview shortcut-controls" aria-label="Try custom shortcut combinations">
      <ShortcutRow label="Capture visible tab" initialKey="Z" />
      <ShortcutRow label="Capture selected area" initialKey="X" />
      <small>Interactive preview only. Your extension settings are not changed.</small>
    </div>
  );
}

export function ContextExperience() {
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="context-preview context-controls"
      aria-label="Try a custom AI instruction"
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(true);
      }}
    >
      <span>ADD CONTEXT</span>
      <label htmlFor="context-demo">Custom Instruction for AI</label>
      <textarea
        id="context-demo"
        maxLength={240}
        onChange={() => setSaved(false)}
        defaultValue="Use relativistic conventions and choose every defensible answer."
      />
      <div className="context-control-footer">
        <small>{saved ? "Saved in this preview only" : "Optional · nothing is sent or stored"}</small>
        <button type="submit">Save</button>
      </div>
    </form>
  );
}
