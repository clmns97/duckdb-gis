# UC-NNN — Actor's goal, as an active verb phrase

| | |
|---|---|
| **Primary actor** | The role pursuing the goal — from the stakeholder table in [`../vision.md`](../vision.md) |
| **Scope** | duckdb-gis |
| **Level** | User goal (the usual) \| Subfunction \| Summary |
| **Status** | Supported \| Partial \| Target |

**Goal.** (One sentence, from the actor's perspective. What do they walk away
with? If you can't say what changed for them, it isn't a goal.)

**Preconditions.** (What must already be true. Not steps — state.)

**Trigger.** (What starts it.)

## Main success scenario

(Numbered steps, alternating actor and system. Present tense. Describe intent
and outcome, not widgets — a step that names a button breaks when the button is
renamed. Aim for 5–9 steps; more usually means two use cases.)

1. The actor ...
2. The system ...

## Extensions

(Alternatives and failures, numbered against the step they branch from. This is
the valuable part — the main scenario is the part everyone already agrees on.
`3a` branches from step 3.)

- **3a.** Condition.
  - **3a1.** What the system does about it.

## Postconditions

**On success.** (What is now true.)

**On failure.** (What is true if it was abandoned partway. "Nothing changed" is
a strong answer — say it explicitly when it holds, since it's a real guarantee.)

## Traces to

**Requirements.** REQ-F-000, REQ-Q-000 — [`../register.md`](../register.md)
**Decisions.** ADR-0000
**Issues.** #00

## Open questions

(Things this scenario exposed that nobody has decided. A use case that raises
none was probably written from finished code rather than from the goal.)
