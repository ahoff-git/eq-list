# Project rules

- Functional Decomposition by default:
  - Prefer changes that keep the code easy to modify.
  - Code reuse is ideal.
  - Avoid duplicating knowledge or intent.
  - Choose readable, obvious solutions over clever ones.
- Log debugging messages using the method defined in logging.ts, they should be disabled by default but easily enabled. 
- Give each function, component, and module one clear job.
- Prefer composition and factory functions over inheritance-heavy designs.
- Create helper functions when they improve readability, isolate logic, or reduce noise in the main flow. 
- Reuse proven solutions before inventing new ones.
- Use comments for why, tradeoffs, and context; use names for what.
- In React, compute before return; keep JSX declarative.
- Use objects when they clarify ownership or lifecycle; otherwise prefer plain functions.
- Keep exported APIs stable unless a change is explicitly requested.
- Reuse existing utilities and patterns when possible.
- Stop and ask before adding dependencies, or changing unrelated files.
- Whenever possible, the code should be broken into distinct testable chunks that should then be treated as 'functioning black boxes'. Their tests should not be re-run unless their code changes. The agents should not bother chaning the 'black boxes' unless instructed to do so. 

## Specs & Decisions

Docs live in `specs/` as **lightweight, wiki-style Markdown**, cross-linked with
relative links. Start at `specs/README.md` and branch out by area. Keep specs
current with the code — they are the source of truth for intent, not history.

### Area specs (`specs/<area>/README.md`)
One folder per area (`architecture`, `bootstrap-service`, `awari-core`,
`awari-protocol`, `testing`). Each `README.md` follows a fixed shape:

- `## Purpose` — what this area is, in a sentence or two.
- `## Responsibilities` — what it owns / does.
- `## Non-responsibilities` — what it explicitly does NOT do (prevents scope creep).
- `## See also` — `·`-separated relative links to sibling docs and relevant ADRs.

Supporting files per area as needed: `data-model.md`, `term-bank.md`,
`scenarios.md`. Prose over ceremony; no boilerplate.

### Decisions (`specs/decisions/`) — Nygard-style ADRs
Significant technical decisions are logged as **lightweight Architecture
Decision Records** in the Michael Nygard format. Do NOT invent a template — use
this one exactly (settled by ADR 0001).

- Filename: `NNNN-kebab-case-title.md`, zero-padded, **sequential and immutable**
  (next number = highest + 1; never renumber or reuse).
- Sections, in order and nothing else: `## Status`, `## Context`,
  `## Decision`, `## Consequences`.
- `Status` is one word: `Proposed` | `Accepted` | `Superseded by NNNN` | `Deprecated`.
  Supersede — don't edit or delete — a decision once it's `Accepted`.
- Scope: record *why*, not day-to-day implementation notes, and never as a
  substitute for inline code docs.

**When you make an ADR, also update `specs/decisions/README.md`:** add a one-line
entry to the `## Log` (`[NNNN: one-line summary](./NNNN-....md)`), and resolve or
add any relevant `## Open Questions`.

### Working list (`specs/todo.md`)
`specs/todo.md` holds **open** work only — a live backlog, not a changelog. When
you finish an item, record the outcome where it belongs (an ADR, a README, or the
code) and then **delete it from the todo in the same session, without being
asked**. Leave a `_No open items._` note when the list is empty.
