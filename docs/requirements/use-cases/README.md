# Use cases

A use case describes **one goal, achieved through an interaction**, from the
actor's point of view. It is a narrative: a trigger, a sequence of steps, and
the things that can go wrong along the way.

That makes it a different artifact from a requirement, and the difference is
worth holding onto:

| | Requirement | Use case |
|---|---|---|
| Answers | What must be true | How a goal gets achieved |
| Form | One atomic, testable statement | A sequence with alternatives |
| Granularity | Many per feature | One per user goal |
| Lives in | [`../register.md`](../register.md) | One file each, here |

They point at each other. A use case ends with the requirement IDs it exercises;
a requirement doesn't list use cases, because that link would need updating every
time a use case is added. **One direction only** — bidirectional links rot.

## Why these earn their keep

Requirements are easy to write once you know what you're building. Use cases are
what tell you *whether you know*. Two things fall out of them almost for free:

- **Gaps.** Walking a scenario step by step surfaces the steps nobody specified —
  usually error handling and the "what if it's already open?" cases.
- **Dead requirements.** A requirement that no use case exercises is either
  infrastructure, or speculative. Both are worth knowing about.

## Index

**Status** says whether the scenario works *today* — so this table doubles as a
gap map, not just a contents list.

| ID | Goal | Status |
|---|---|---|
| [UC-001](UC-001-put-existing-data-on-the-map.md) | Put existing spatial data on the map | Supported |
| [UC-002](UC-002-answer-a-question-with-spatial-sql.md) | Answer a question with spatial SQL and keep the answer | Supported |
| [UC-003](UC-003-correct-a-feature-by-hand.md) | Correct a feature's geometry by hand and keep the correction | Partial |

Planned, not yet written: geoprocessing over a selection set; Overture
quick-load for a viewport.

**Status values.** `Supported` — works end to end today. `Partial` — the
scenario runs but at least one step is missing or unenforced; the gap is named in
the use case. `Target` — described, not built.

## Coverage

Running the check the section above describes — which requirements no use case
exercises — currently returns four:

| Requirement | Reading |
|---|---|
| REQ-C-001 — no unrequested network calls | Expected. A constraint holds across every scenario; it isn't a goal anyone pursues. |
| REQ-C-002 — coexist with core `ui` | Expected. Same: a property of the build, not an interaction. |
| REQ-Q-003 — build reproducibly | Expected. The actor is a contributor, not a user of the running system. |
| **REQ-F-003 — select features** | **A real gap.** This is user-facing behaviour with no scenario describing it. |

The first three are the normal case: constraints and build-time qualities have no
use case and shouldn't be forced into one. REQ-F-003 is the finding — selection
is the input to every geoprocessing operation, and the use case that would
exercise it (geoprocessing over a selection set) is listed above as planned but
unwritten.

That distinction is the whole point of the check. "Not covered" means either
"correctly not covered" or "we haven't thought this through" — and it's worth
re-running whenever requirements are added.

## Writing one

Copy [template.md](template.md) to `UC-NNN-short-goal.md`. Numbers are sequential
and never reused.

Name it for the **actor's goal, not the feature** — "Put existing spatial data on
the map", not "Layer panel". If the name contains a UI noun, you are probably
describing a screen rather than a goal.

Write the main success scenario as **what the actor and system do**, not what the
code does. Steps should survive a redesign of the interface; if renaming a button
would invalidate a step, that step is too specific.

Keep one use case to one goal. "And then they also…" is a second use case.
