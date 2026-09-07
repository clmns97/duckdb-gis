# Requirements

This directory is the project's durable requirements record. It exists because
GitHub Issues are good at tracking *change* ("add snapping to the digitizer")
but bad at recording *state* ("what must this thing always do, and why?"). An
issue is closed and forgotten; a requirement stays true until something replaces
it.

Requirements live here, in the repo, rather than in the GitHub wiki — on purpose.
A requirement and the code implementing it should change in the same commit and
be reviewed in the same pull request. A wiki is a separate git repository, so it
can't do either.

## How the pieces fit

| Artifact | Question it answers | Where |
|---|---|---|
| **Vision** | Who is this for, and where does the system stop? | [vision.md](vision.md) |
| **Glossary** | What do we mean by "layer", "project", "source"? | [glossary.md](glossary.md) |
| **Requirements** | What must the system do, and how well? | [register.md](register.md) |
| **Use cases** | How does an actor actually achieve a goal? | [use-cases/](use-cases/) |
| **Decisions** | Which design path did we take, and why? | [../adr/](../adr/) |
| **Issues** | What are we changing next? | GitHub Issues |

The division that matters: **a requirement says what must be true; an issue says
what we're doing about it.** If you find yourself writing a deadline or an
assignee into a requirement, it belongs in an issue.

## Requirement IDs

Stable, never reused, never renumbered — they're the anchor everything else
points at.

- `REQ-F-###` — **functional**: something the system does.
- `REQ-Q-###` — **quality**: how well it does it (performance, usability,
  portability). What's often called "non-functional".
- `REQ-C-###` — **constraint**: a restriction on the solution space, not a
  behaviour. Constraints are not negotiable trade-offs; they're boundaries.

## Traceability

The point of the ID scheme is being able to answer "why does this code exist?"
and "what breaks if I change this?" in one hop:

```
Vision  →  UC-003  →  REQ-F-004  →  issue #26  →  PR / commit  →  ADR-0001
 goal      scenario   requirement    the work     the change     the decision
```

Use cases link *down* to requirements and requirements do not link back up — see
[use-cases/README.md](use-cases/README.md) for why that direction is deliberate.

In practice:

- A requirement lists the issues that implement it, and the ADR that shaped it.
- An issue that implements a requirement names it in the body: `Implements REQ-F-003.`
- A commit or PR that changes behaviour names the requirement too, so
  `git log --grep REQ-F-003` tells the whole story.

If you change a requirement, check what points at it before you do.

## Adding one

Copy [template.md](template.md) into [register.md](register.md), take the next
free number, and fill in every attribute — especially **Rationale**. A
requirement without a rationale is impossible to retire later, because nobody
can tell whether the reason still holds.

## When to split this up

All requirements live in one `register.md`, sectioned by type. That is a
deliberate choice for the current size — the whole specification reads in one
scroll and `grep` finds anything, with no per-file boilerplate.

Split it when one of these becomes true, not before:

- **It passes roughly 40 requirements.** Break it into `constraints.md`,
  `functional.md` and `quality.md`, and turn `register.md` into an index table.
- **Two people are editing requirements at once.** A single file is a merge-conflict
  hotspot; per-category files reduce it, one file per requirement removes it.
- **You need per-requirement history.** With one file `git log` only tells you
  "register.md changed". One file per requirement buys
  `git log docs/requirements/functional/REQ-F-006-*.md` — the actual evolution of
  that one requirement, which is what requirements change management wants.

Whichever layout is in use, the IDs are the stable anchor — moving a requirement
between files must never change its ID.

Keep them **solution-neutral** where you can. "The user can find a feature by
attribute value" is a requirement; "the sidebar has a search box" is a design
decision wearing a requirement's clothes. When the solution genuinely *is*
constrained, say so explicitly and record it as a `REQ-C-###`.
