# 0001: Record architecture decisions as ADRs

## Status
Accepted

## Context
This project pivoted from a blank web scaffold into a desktop overlay with several
non-obvious, hard-to-reverse choices (runtime, data source, IPC boundary). Future
work needs the *why* behind those choices without spelunking git history, and the
project rules call for lightweight, wiki-style docs.

## Decision
Log significant technical decisions as lightweight ADRs in the Michael Nygard
format under `specs/decisions/`. Files are `NNNN-kebab-case-title.md`, numbered
sequentially and immutably. Each record has exactly these sections, in order:
`Status`, `Context`, `Decision`, `Consequences`. `Status` is one word:
`Proposed` | `Accepted` | `Superseded by NNNN` | `Deprecated`. Once `Accepted`, a
decision is superseded rather than edited or deleted. Every new ADR also adds a
line to the `## Log` in `decisions/README.md`.

## Consequences
- A durable, greppable trail of intent; onboarding reads decisions, not diffs.
- Small ongoing cost: a new ADR per meaningful decision and a log update.
- ADRs record rationale only — they don't replace inline code docs or area specs.
