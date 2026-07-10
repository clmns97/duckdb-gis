---
id: T-000
title: Scaffold the tickets/ feature-tracking system
status: done
priority: P1
area: docs
depends_on: []
branch:
---

## Goal

A durable, git-tracked ticketing system so work items survive token resets and
can be picked up cold by a fresh session or subagent — replacing the old
"NEXT list" that only lived in chat context and was lost on summarization.

## Context

<context>
Requested workflow: create tickets that an agent works on independently;
robust enough to resume after a token-limit reset; keep main context clean by
using subagents or a fresh chat per ticket. Decided on repo-local **markdown +
YAML frontmatter** over HTML (structure/delimiting is the real win, and
markdown is cheaper in tokens and far better for human authoring/diffing).
See `tickets/README.md` for the workflow and `tickets/TEMPLATE.md` for the
ticket format. Workflow summary also added to `CLAUDE.md`.
</context>

## Acceptance criteria

- [x] `tickets/` with `open/`, `in-progress/`, `blocked/`, `done/` folders
- [x] `tickets/README.md` documents the board + resumable workflow
- [x] `tickets/TEMPLATE.md` defines the ticket format
- [x] `CLAUDE.md` points future sessions at the workflow

## Progress log

- 2026-07-09: Scaffolded directory structure, README, template, and this
  example ticket. Added "Ticket workflow" section to CLAUDE.md. Done.
