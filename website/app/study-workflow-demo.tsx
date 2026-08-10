"use client";

import { useState } from "react";

type ManualTab = "question" | "assistant";

const questionAnswers = [
  ["A", "The nucleus"],
  ["B", "The mitochondrion"],
  ["C", "The Golgi apparatus"],
  ["D", "The ribosome"],
] as const;

export function ManualWorkflowDemo() {
  const [activeTab, setActiveTab] = useState<ManualTab>("question");

  return (
    <div
      className="study-motion-demo manual-tab-demo"
      aria-label="Interactive illustration of manually switching between a question and an AI tool"
    >
      <div className="motion-browser">
        <div className="motion-browser-tabs" role="tablist" aria-label="Manual workflow tabs">
          <button
            className={activeTab === "question" ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={activeTab === "question"}
            onClick={() => setActiveTab("question")}
          >
            Question
          </button>
          <button
            className={activeTab === "assistant" ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={activeTab === "assistant"}
            onClick={() => setActiveTab("assistant")}
          >
            AI tool
          </button>
        </div>
        <div className="motion-browser-screen" aria-live="polite">
          {activeTab === "question" ? (
            <div className="manual-screen manual-screen-question">
              <i>Question 08</i>
              <strong>What is known as the powerhouse of the cell?</strong>
              {questionAnswers.map(([letter, answer]) => (
                <span key={letter}><b>{letter}</b>{answer}</span>
              ))}
            </div>
          ) : (
            <div className="manual-screen manual-screen-assistant">
              <i>New conversation</i>
              <div className="manual-paste-preview" aria-label="Pasted screenshot preview" />
              <span className="manual-prompt-line" aria-hidden="true" />
              <b>Ask</b>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ZenaianWorkflowDemo() {
  return (
    <div
      className="study-motion-demo zenaian-speed-demo"
      role="img"
      aria-label="Zenaian shortcut, capture, processing, and answer illustration"
    >
      <div className="motion-browser" aria-hidden="true">
        <div className="zenaian-motion-toolbar">
          <span>Practice set</span>
          <div className="zenaian-motion-icon">
            <i className="zenaian-motion-idle">Z</i>
            <i className="zenaian-motion-processing">
              <img src="/zenaian-icons/processing.png" alt="" />
            </i>
            <i className="zenaian-motion-answer">B</i>
          </div>
        </div>
        <div className="zenaian-motion-question">
          <i>Question 08</i>
          <strong>What is known as the powerhouse of the cell?</strong>
          {questionAnswers.map(([letter, answer]) => (
            <span key={letter}><b>{letter}</b>{answer}</span>
          ))}
          <div className="zenaian-mini-shortcut">
            <kbd className="mini-key-control">Ctrl</kbd>
            <b>+</b>
            <kbd className="mini-key-shift">Shift</kbd>
            <b>+</b>
            <kbd className="mini-key-z">Z</kbd>
          </div>
          <b className="zenaian-motion-scan" />
        </div>
      </div>
    </div>
  );
}
