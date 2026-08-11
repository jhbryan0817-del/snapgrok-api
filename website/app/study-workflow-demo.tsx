"use client";

import { useState } from "react";

type ManualTab = "question" | "assistant";

const questionAnswers = [
  ["A", "Venus"],
  ["B", "Mars"],
  ["C", "Jupiter"],
  ["D", "Mercury"],
] as const;

function QuestionContent({ animated = false }: { animated?: boolean }) {
  return (
    <>
      <i>Question 08</i>
      <strong>What is known as the red planet?</strong>
      {questionAnswers.map(([letter, answer]) => (
        <span
          className={animated && letter === "B" ? "zenaian-correct-choice" : undefined}
          key={letter}
        >
          <b>{letter}</b>{answer}
        </span>
      ))}
      <button className="motion-next-question" type="button">Next question</button>
    </>
  );
}

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
              <QuestionContent />
            </div>
          ) : (
            <div className="manual-screen manual-screen-assistant">
              <div className="manual-assistant-heading">
                <span aria-hidden="true">AI</span>
                <div><b>AI assistant</b><small>New conversation</small></div>
              </div>
              <div className="manual-conversation">
                <div className="manual-paste-preview" aria-label="Attached screenshot preview">
                  <span aria-hidden="true">PNG</span>
                  <div><b>question-capture.png</b><small>Image attached</small></div>
                </div>
                <p>Which option is correct?</p>
              </div>
              <div className="manual-composer" aria-label="AI message composer illustration">
                <button type="button" aria-label="Attach a file">
                  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m7.2 10.7 4.85-4.85a2.4 2.4 0 0 1 3.4 3.4l-6.1 6.1a4 4 0 0 1-5.65-5.66l6.28-6.28" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                </button>
                <span>Ask about this question...</span>
                <button className="manual-send-button" type="button" aria-label="Send message">
                  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 15V5m0 0L6.5 8.5M10 5l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
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
          <QuestionContent animated />
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
