"use client";
import { useState } from "react";
import { TextField } from "./ui";
import type { Vocabulary, VocabularyKind } from "@/shared/log-vocabulary";

/**
 * A text box that finishes your sentence with what the log actually said.
 *
 * The problem it solves is the one that makes alert rules hard: EQ prints "Mesmerization", not
 * "Mesmerize", nobody can quote a log from memory, and this game's spelling defeats people who *do*
 * remember. Everything offered comes from **your own log**, so it is exactly as current as the
 * server is.
 *
 * Two ways of offering, because one isn't enough:
 *
 *   - **The ghost** — the rest of the word, greyed, behind the caret — for when what you typed is
 *     the *start* of a term. It's the nicest of the two: no list, no reading, just Tab.
 *   - **The list** — for everything the ghost can't express. A term that *contains* what you typed
 *     ("sme" → Mesmerization) has no remainder to grey, and neither does a near-miss spelling; both
 *     are real matches that ghost text simply cannot show, so they get a dropdown.
 *
 * **Tab or → takes the ghost**, ↑/↓ and Enter take from the list, Escape hides it. Nothing is
 * accepted implicitly: a rule that silently became a different rule than you typed is the worst
 * outcome available here.
 */
export default function SuggestField({
  value,
  onChange,
  vocabulary,
  kind,
  slot = "",
  className = "field",
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  vocabulary: Vocabulary;
  /** Which words to draw on — omitted, it's any term the log used. */
  kind?: VocabularyKind;
  /**
   * The layout class for the **wrapper**, since the ghost means this is a box inside a box and the
   * row's flex has to act on the outer one. Splitting it from `className` (which dresses the input)
   * is what stops a row's sizing quietly stopping at the wrapper.
   */
  slot?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  // What's in the box right now. `TextField` owns the text (see its note on the caret), so this
  // mirrors it purely to know what to suggest — never to set it.
  const [typed, setTyped] = useState(value);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const ghost = vocabulary.complete(typed, kind);
  const rest_ = ghost?.slice(typed.length);
  const matches = focused && !dismissed ? vocabulary.suggest(typed, kind) : [];
  // The ghost already offers the first prefix match, so a list of one that says the same thing is
  // noise. Anything else — a substring hit, a near-miss — is the reason the list exists.
  const list = matches.length > 1 || (matches.length === 1 && matches[0] !== ghost) ? matches : [];

  const accept = (term: string | undefined) => {
    if (!term) return;
    setTyped(term);
    setDismissed(true);
    onChange(term);
  };

  return (
    <span className={`suggest ${slot}`}>
      {rest_ && (
        <span className={`suggest-ghost ${className.includes("sm") ? "sm" : ""}`} aria-hidden>
          <span className="suggest-typed">{typed}</span>
          {rest_}
        </span>
      )}
      <TextField
        {...rest}
        className={className}
        value={value}
        onFocus={() => setFocused(true)}
        // Late enough for a click on the list to land first.
        onBlur={() => window.setTimeout(() => setFocused(false), 150)}
        onChange={(next) => {
          setTyped(next);
          setDismissed(false);
          setHighlight(0);
          onChange(next);
        }}
        onKeyDown={(e) => {
          const atEnd = e.currentTarget.selectionStart === typed.length;
          if (ghost && (e.key === "Tab" || (e.key === "ArrowRight" && atEnd))) {
            e.preventDefault();
            accept(ghost);
            return;
          }
          if (!list.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % list.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h - 1 + list.length) % list.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            accept(list[highlight]);
          } else if (e.key === "Escape") {
            setDismissed(true);
          }
        }}
        title={ghost ? `Tab to complete: ${ghost}` : rest.title}
      />
      {list.length > 0 && (
        <div className="suggest-list" role="listbox">
          {list.map((term, i) => (
            <button
              key={term}
              className={`suggest-item ${i === highlight ? "on" : ""}`}
              role="option"
              aria-selected={i === highlight}
              // `onMouseDown`, not `onClick`: the input's blur would otherwise close the list first.
              onMouseDown={(e) => {
                e.preventDefault();
                accept(term);
              }}
            >
              {term}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
