# Architecture decision records

An ADR records **one decision**: what was chosen, what the alternatives were,
and what it costs. It is written once, when the decision is made, and then left
alone. When a decision is reversed you write a *new* ADR that supersedes the old
one — you don't edit history, because the reasoning that led somewhere wrong is
exactly what stops it being repeated.

ADRs answer a different question from requirements.
[`docs/requirements/`](../requirements/) says **what must be true**; an ADR says
**which path we took and why**. "Sources are read-only" is a requirement;
"we get that by keeping an in-memory working database and writing out explicitly"
is a decision.

## Index

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-in-memory-working-database-and-project-files.md) | In-memory working database, read-only sources, explicit project files | Accepted |
| [0003](0003-crs-detection-reprojection-and-refusal.md) | Reproject a layer's CRS when known; refuse an implausible extent when it isn't | Accepted |

## Writing one

Copy [template.md](template.md) to `NNNN-short-kebab-title.md`, taking the next
number. Numbers are sequential and never reused.

Worth writing an ADR when a choice is **expensive to reverse** or when someone
will reasonably ask "why on earth is it done this way?" a year from now. Choices
that are cheap to change don't need one — a comment will do.

**Status** is one of:

- **Proposed** — under discussion, not yet binding.
- **Accepted** — decided. Implementation may still be in progress; that's what
  issues are for.
- **Superseded by ADR-NNNN** — reversed. Say what replaced it and leave the rest
  of the document untouched.

Keep the **Consequences** section honest, especially the negative half. An ADR
that lists only benefits isn't a decision record, it's an advertisement — and it
gives a future reader nothing to weigh when circumstances change.
