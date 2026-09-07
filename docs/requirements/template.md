# Requirement template

Copy the block below into `register.md`. Delete the guidance in parentheses.

---

### REQ-F-000 — Short imperative title

| | |
|---|---|
| **Type** | Functional / Quality / Constraint |
| **Status** | Draft \| Agreed \| Implemented \| Retired |
| **Priority** | P1 \| P2 \| P3 (same scale as the issue labels) |
| **Stakeholder** | Who wants this — the role, not a person |
| **Source** | Where it came from: an issue, a decision, an upstream rule |

**Requirement.** (One sentence, present tense, testable. Use *shall* for
obligations. Say what the system does, not how it's built.)

**Rationale.** (Why. The single most valuable field — it's what lets a future
reader decide whether this still applies. "Because QGIS does it" is a legitimate
rationale here; record it.)

**Acceptance criteria.**

- [ ] (Observable, checkable. If you can't write a test or a manual check for
      it, the requirement is too vague — sharpen it.)

**Traces to.** ADR-000X · #12, #34 · `path/to/code.ts`

---

## Writing notes

**Testable.** "Fast" is not a requirement; "renders a 100k-feature layer in
under 2 s on a 2020 laptop" is. If a number is arbitrary, say it's provisional
rather than pretending to precision.

**One requirement per entry.** "and" in a requirement usually means two
requirements. Split them so they can be prioritised and retired independently.

**Solution-neutral by default.** Constrain the solution only when the constraint
is real (a platform limit, a licence, a compatibility rule) — and then file it as
a `REQ-C-###` so the restriction is visible instead of smuggled in.

**Retire, don't delete.** When a requirement stops applying, set its status to
`Retired` and add a line saying what replaced it. Deleting it breaks every link
pointing at the ID and destroys the reasoning trail.
