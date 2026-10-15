/**
 * quest-steps.ts — a quest's walkthrough as a tree of steps, the way the wiki bullets it.
 *
 * A chain quest is a tree: Exotic Drinks has you "Get [[Honey Jum]]", and *how* is two sub-bullets
 * (kill Bixies for Honeycomb, hand them to Kizzie Mintopp in Rivervale). The flat turn-in list
 * (`components`) can't say that, so this keeps the bullets as written, links in place. It doesn't
 * decide what each link is. An NPC, a zone, an item and another quest all look alike in a bullet;
 * the linked page knows, and the page view asks it
 * ([ADR 0295](../../specs/decisions/0295-a-quest-is-a-tree-of-steps.md)).
 *
 * Pure: HTML elements in, steps out. Which links count is handed in (`linkOf`), so this module
 * doesn't reach back into `parse.ts`.
 */
import type { HTMLElement, Node } from "node-html-parser";
import type { QuestStep, QuestStepPart } from "../../src/shared/types";

/** The page a link names, or undefined when it isn't a content link (an edit link, a category). */
export type LinkOf = (a: HTMLElement) => string | undefined;

/** A walkthrough-ish section: its heading and the elements under it, in page order. */
export interface StepSection {
  heading: string;
  els: HTMLElement[];
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const isList = (el: HTMLElement) => el.tagName === "UL" || el.tagName === "OL";

/**
 * The steps of the first section that reads as steps.
 *
 * A section qualifies when one of its bullets has sub-bullets (Exotic Drinks' "TLDR; Walkthrough",
 * Coin of Tash's checklist), since nesting is what a chain looks like. Failing that, the first
 * checklist (`{{CheckboxList}}`) counts, because a checklist is a list of steps however flat it is
 * (Tarton's Wheel). One section only: a page often says the same thing twice, a short version and a
 * long one, and the long one's flat ingredient list would repeat the short one's steps.
 */
export function parseQuestSteps(sections: readonly StepSection[], linkOf: LinkOf): QuestStep[] {
  const read = sections.map((s) => ({ s, steps: sectionSteps(s.els, linkOf) }));
  const nested = read.find((r) => r.steps.some((step) => step.steps.length > 0));
  if (nested) return nested.steps;
  const checklist = read.find((r) => r.steps.length > 0 && r.s.els.some(hasChecklist));
  return checklist?.steps ?? [];
}

function hasChecklist(el: HTMLElement): boolean {
  return el.classList?.contains("checkbox-list") || !!el.querySelector?.(".checkbox-list");
}

/**
 * Every list in these elements, in order, as steps. A paragraph that is nothing but bold text
 * ("**Odus**") is a group label, and heads the list after it.
 */
function sectionSteps(els: readonly HTMLElement[], linkOf: LinkOf): QuestStep[] {
  const out: QuestStep[] = [];
  let label: string | undefined;
  const walk = (el: HTMLElement) => {
    if (isList(el)) {
      const steps = listSteps(el, linkOf);
      if (label && steps.length) out.push({ parts: [label], steps });
      else out.push(...steps);
      label = undefined;
      return;
    }
    if (el.tagName === "P") {
      label = boldOnly(el);
      return;
    }
    // A table of contents is a list too, and never a step. A hover box is an embedded item card.
    if (el.tagName === "DIV" && !el.classList.contains("toc") && !el.classList.contains("hb")) {
      for (const child of el.childNodes) if (child.nodeType === ELEMENT_NODE) walk(child as HTMLElement);
    }
  };
  for (const el of els) walk(el);
  return out;
}

/** A paragraph's text when all of it is bold, else undefined. */
function boldOnly(p: HTMLElement): string | undefined {
  const text = squash(p.text);
  const bold = squash(p.querySelectorAll("b, strong").map((b) => b.text).join(" "));
  return text && text === bold ? text : undefined;
}

function listSteps(list: HTMLElement, linkOf: LinkOf): QuestStep[] {
  const steps: QuestStep[] = [];
  for (const li of list.childNodes) {
    if (li.nodeType !== ELEMENT_NODE || (li as HTMLElement).tagName !== "LI") continue;
    const step = itemStep(li as HTMLElement, linkOf);
    if (step.parts.length || step.steps.length) steps.push(step);
  }
  return steps;
}

/** One bullet: its own sentence, and its nested lists as sub-steps. */
function itemStep(li: HTMLElement, linkOf: LinkOf): QuestStep {
  const parts: QuestStepPart[] = [];
  const steps: QuestStep[] = [];
  for (const child of li.childNodes) {
    if (child.nodeType === ELEMENT_NODE && isList(child as HTMLElement)) steps.push(...listSteps(child as HTMLElement, linkOf));
    else collectParts(child, linkOf, parts);
  }
  return { parts: tidy(parts), steps };
}

/** A sentence's text and links, in order. An embedded item card (`.hbdiv`) is just its link. */
function collectParts(node: Node, linkOf: LinkOf, into: QuestStepPart[]): void {
  if (node.nodeType === TEXT_NODE) {
    into.push(node.text);
    return;
  }
  if (node.nodeType !== ELEMENT_NODE) return;
  const el = node as HTMLElement;
  if (el.classList.contains("hb") || el.tagName === "SUP") return;
  if (el.tagName === "A") {
    const title = linkOf(el);
    const label = squash(el.text);
    if (!title) into.push(el.text);
    else into.push(label && label !== title ? { title, label } : { title });
    return;
  }
  for (const child of el.childNodes) collectParts(child, linkOf, into);
}

/** Adjacent text merged and whitespace folded, with the sentence's own ends trimmed. */
function tidy(parts: QuestStepPart[]): QuestStepPart[] {
  const out: QuestStepPart[] = [];
  for (const part of parts) {
    const last = out[out.length - 1];
    if (typeof part === "string" && typeof last === "string") out[out.length - 1] = last + part;
    else out.push(part);
  }
  const folded = out.map((p) => (typeof p === "string" ? p.replace(/\s+/g, " ") : p));
  if (typeof folded[0] === "string") folded[0] = folded[0].trimStart();
  const end = folded.length - 1;
  if (typeof folded[end] === "string") folded[end] = (folded[end] as string).trimEnd();
  return folded.filter((p) => p !== "");
}

function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
