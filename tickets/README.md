# Tickets — feature tracking & work board

Durable, git-tracked work items. The point: nothing important lives only in
chat context (which gets summarized/lost at a token reset). Each ticket is a
**self-contained brief** that a cold session or subagent can pick up without
the prior conversation.

## Board = directory

State is the folder a ticket lives in — `ls` shows the board at a glance:

```
tickets/
  open/          # not started
  in-progress/   # being worked; each has a Progress log kept current
  blocked/       # waiting on a dependency or decision
  done/          # merged / complete (keep for history)
```

To change a ticket's state, **move the file** and update its `status:`
frontmatter to match.

## Naming

`T-<NNN>-<short-slug>.md`, e.g. `T-004-legend-component.md`. IDs are
monotonic and never reused. Find the next number:

```sh
ls tickets/*/ | grep -oE 'T-[0-9]+' | sort -u | tail -1
```

## Creating a ticket

Copy `TEMPLATE.md` into `open/`, give it the next id, fill in **Goal**,
**Context**, and **Acceptance criteria**. A ticket is "ready" only when a
cold agent could start from it with no chat history — links to concrete files
(`frontend/src/...:123`) beat prose.

## Working a ticket (the resumable loop)

1. **Start clean.** New chat or a subagent, pointed at the one ticket file.
   Because the ticket is self-contained, the cold start is cheap and the main
   context stays unpolluted. One ticket ≈ one branch ≈ one PR.
2. Move it to `in-progress/`, set `status`, record the `branch`.
3. Work. **Append to the Progress log** as you go — what changed, what's next,
   any blocker. This is the section that makes a token reset survivable.
4. When acceptance criteria are all checked: open the PR, move the file to
   `done/`, set `status: done`.

## Resuming after a reset / new session

Read `tickets/in-progress/`. Each file's Progress log says exactly where it
stands and what's next. Continue from there — no need to reconstruct the chat.

## Subagents vs. fresh chat

Subagents start **cold** and re-derive context, so they fit *genuinely
independent* tickets (clean fan-out, main context stays clean). For tickets
that are tightly coupled or share a lot of setup, a fresh main chat is cheaper
than fanning out. Don't spawn a subagent per ticket reflexively.

## Board index

<!-- Optional: keep a quick list here, or just rely on `ls tickets/*/`. -->
- See `ls tickets/open/`, `tickets/in-progress/`, `tickets/blocked/`.
