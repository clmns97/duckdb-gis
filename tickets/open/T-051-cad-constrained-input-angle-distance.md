---
id: T-051
title: CAD-style constrained input while drawing (TAB to lock angle/distance)
status: open
priority: P3
area: frontend
depends_on: [T-038]
branch:
---

## Goal

While drawing, a user can constrain the next vertex by **keyboard** — QGIS
Advanced Digitizing / Vectorworks style. Press **TAB** to move focus between
fields and **lock** a value; type an exact **distance** and/or **angle** and the
next point is placed at that distance/bearing from the previous one; type explicit
**x/y** to place an absolute coordinate. A locked value stays fixed while the
cursor supplies the rest (e.g. lock a 90° angle and just slide the cursor to set
the length). "Done" means precise, measured drawing without eyeballing — the
geometry the user intends, to exact numbers.

## Context

<context>
Requested by the user (2026-07-20) alongside construction lines (T-050): "press
TAB to set a fixed angle or distance." This is the QGIS Advanced Digitizing Panel
model: per-parameter fields (distance, angle, x, y) that can each be locked; angle
is relative to the previous segment (or absolute), distance is from the previous
vertex.

Feasibility: Terra Draw draws from pointer coordinates; there is likely **no
built-in numeric-entry hook**, so expect to intercept keyboard input and compute
the constrained coordinate ourselves, then hand Terra Draw a resolved point (add/
update the in-progress vertex programmatically). **Spike this** (`spike/`) against
the installed `terra-draw` (`frontend/package.json`): can we push a computed
coordinate into an in-progress draw, or must we drive a lower-level custom mode?
Terra Draw + its `change`/`finish` events live in the editing store
(`frontend/src/lib/editing.ts` `init()`, `editing.ts:191-218`); the shared map is
`getMap()` (`editing.ts:43`).

Pieces:
1. **Input surface.** A small CAD entry panel (distance / angle / x / y with
   lock toggles), shown only while drawing (gate like `DrawToolbar`,
   `components/DrawToolbar.tsx:17`). TAB cycles fields and locks; Enter commits the
   vertex. Prop-driven view + store state (`editing` store `version`/`subscribe`,
   `editing.ts:156-163`), mirrored in the design-system if it becomes a shared
   component.
2. **Constraint math.** Given the previous vertex and the locked fields, resolve
   the next coordinate: distance+angle → polar offset from the last point; locked
   angle only → constrain the cursor ray to that bearing (project the pointer onto
   it); x/y → absolute. Angle reference: previous segment by default; allow
   absolute, and (integration point) **relative to a construction line** from
   T-050.
3. **Feed Terra Draw.** Update/insert the in-progress vertex from the resolved
   coordinate on each keystroke/pointer move, so the rubber-band preview reflects
   the constraint live. Confirm the mechanism in the spike.
4. **Lifecycle.** Locks reset per segment (or per draw — pick a sensible default,
   QGIS resets distance each segment but can keep angle locked). Clear on
   finish/cancel (`finishEdit`, `editing.ts:351`).

Watch: don't hijack TAB/keys when focus is in an unrelated input (the panel must
own focus while active). Keep it keyboard-first — mouse is the fallback, not the
requirement.

Pairs with **T-050** (construction lines; "angle relative to a construction line"
is the shared seam) and **T-049** (snapping; a snap can seed the previous point).
</context>

## Acceptance criteria

- [ ] Spike outcome recorded (can a computed coordinate be pushed into an
      in-progress Terra Draw draw) and the chosen approach noted before building.
- [ ] While drawing, a CAD entry panel exposes distance/angle/x/y with per-field
      locks; TAB cycles/locks fields, Enter places the vertex.
- [ ] Locked distance and/or angle constrain the next vertex exactly; explicit
      x/y places an absolute coordinate; the live preview reflects the constraint.
- [ ] Keyboard capture is scoped to the draw session and doesn't interfere with
      other inputs.
- [ ] Locks/state clear on finish/cancel.
- [ ] `pnpm --dir frontend typecheck` + `build` pass; verified in the preview
      (draw a segment at a locked 90° / fixed length).

## Progress log

- 2026-07-20: Filed from user request (TAB-to-lock angle/distance, CAD-style
  precise input). Flagged spike-first — Terra Draw likely has no numeric-entry
  hook, so we intercept keys and push resolved coordinates. Pairs with T-050
  (angle relative to a construction line) and T-049 (snap seeds the prior point).
  Set P3 as an advanced follow-up.
</content>
</invoke>
