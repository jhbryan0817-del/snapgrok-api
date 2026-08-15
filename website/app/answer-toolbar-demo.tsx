"use client";

import { useState } from "react";

const answerStates = [
  {
    id: "single",
    icon: "/zenaian-icons/result-a.png",
    title: "Single answer",
    explanation: "One clear answer was found. The icon displays the matching option letter.",
  },
  {
    id: "multiple",
    icon: "/zenaian-icons/result-multi.png",
    title: "Multiple answers",
    explanation: "More than one answer was found. Hover on the extension icon for details",
  },
  {
    id: "processing",
    icon: "/zenaian-icons/processing.png",
    title: "Processing",
    explanation: "Zenaian is reading the captured question and checking the possible answers.",
  },
  {
    id: "inconclusive",
    icon: "/zenaian-icons/result-inconclusive.png",
    title: "Inconclusive",
    explanation: "The image does not contain appropriate information for a reliable answer",
  },
  {
    id: "error",
    icon: "/zenaian-icons/result-error.png",
    title: "Error",
    explanation: "The answering process was interrupted. Capture the question again to retry.",
  },
] as const;

const defaultState = {
  icon: "/zenaian-search-icon-v2.png",
  title: "Zenaian",
  explanation: "Ready for your next capture.",
} as const;

const toolbarIcons = [
  { id: "default", icon: defaultState.icon },
  ...answerStates.map((state) => ({ id: state.id, icon: state.icon })),
] as const;

export function AnswerToolbarDemo() {
  const [activeId, setActiveId] = useState<(typeof answerStates)[number]["id"] | null>(null);
  const activeState = activeId
    ? answerStates.find((state) => state.id === activeId) ?? defaultState
    : defaultState;
  const showsMultipleAnswers = activeId === "multiple";

  return (
    <div className="answer-toolbar-experience">
      <div className="answer-toolbar-simulator">
        <div className="answer-toolbar-row" aria-label={`Chrome toolbar showing ${activeState.title}`}>
          <div className="answer-toolbar-navigation" aria-hidden="true">
            <span>&larr;</span><span>&rarr;</span><span>&#8635;</span>
          </div>
          <div className="answer-toolbar-address">
            <span aria-hidden="true">&#9679;</span>
            zenaian.com/icons-explanation
          </div>
          <div className="answer-toolbar-actions" aria-hidden="true">
            <span>&#9734;</span>
            <span className="answer-toolbar-puzzle">&#10010;</span>
            <span
              className={`answer-toolbar-active-icon${showsMultipleAnswers ? " answer-toolbar-multiple" : ""}`}
              aria-label={showsMultipleAnswers ? "Multiple answers. Hover or focus to reveal A and C." : undefined}
              tabIndex={showsMultipleAnswers ? 0 : undefined}
            >
              {toolbarIcons.map((state) => (
                <img
                  className={`answer-toolbar-icon-${state.id}${state.id === (activeId ?? "default") ? " is-visible" : ""}`}
                  key={state.id}
                  src={state.icon}
                  alt=""
                />
              ))}
              {showsMultipleAnswers ? (
                <span className="multiple-answer-tooltip" role="tooltip">
                  <b>A</b><em>and</em><b>C</b>
                </span>
              ) : null}
            </span>
            <span className="answer-toolbar-menu">&#8942;</span>
          </div>
        </div>

        <div className={`answer-toolbar-readout${activeId === null ? " is-default" : ""}`} aria-live="polite">
          {activeId !== null ? (
            <div className="answer-toolbar-readout-icon" aria-hidden="true">
              <img src={activeState.icon} alt="" />
            </div>
          ) : null}
          <div className="answer-toolbar-readout-copy">
            {activeId === null ? (
              <>
                <p className="answer-toolbar-intro">Explore aspects of Zenaian before you get started.</p>
                <p className="answer-toolbar-hint">Hover over each of the 5 icons below to learn more.</p>
              </>
            ) : (
              <>
                <span>CURRENT ICON STATE</span>
                <h3>{activeState.title}</h3>
                <p>{activeState.explanation}</p>
              </>
            )}
          </div>
        </div>
      </div>

      <div
        className="answer-state-tabs"
        role="tablist"
        aria-label="Choose an extension icon state"
        onMouseLeave={() => setActiveId(null)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setActiveId(null);
          }
        }}
      >
        {answerStates.map((state) => {
          const selected = state.id === activeId;
          return (
            <button
              className={`answer-state-tab${selected ? " is-selected" : ""}`}
              key={state.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveId(state.id)}
              onMouseEnter={() => setActiveId(state.id)}
              onFocus={() => setActiveId(state.id)}
            >
              <span className="answer-state-icon-surface"><img src={state.icon} alt="" /></span>
              <span>{state.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
