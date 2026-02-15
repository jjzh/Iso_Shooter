# Design: Level Editor + Size Bends (First Playable)

> A spatial level editor for authoring physics-rich rooms, plus Enlarge/Shrink bends usable mid-combat via radial menu, so you can design a room and immediately play-test rule-bending chain reactions.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Editor approach | Fresh editor, reuse undo/keyboard modules | Spatial handles (drag-to-resize) are fundamentally different from the current panel-slider approach. Fresh shell, import proven infrastructure. |
| Rule-bending UX | Mid-combat toggle (no observation phase) | Lean into the action feel first. Bends as creative combat tool, not heist planning. Observation phase can be added later if needed. |
| Bend selection | Q toggle → radial menu → click target | Toggle in/out of bend mode. Time slows while active. Multiple bends can be chained in one pause. |
| First bend set | Size only (Enlarge / Shrink) | Most visually obvious, immediate feedback. Tests whether visual+physical transformation creates "aha" moments. |
| Platform | Desktop first, mobile-compatible design | Mouse+keyboard implementation. Touch UX (select-then-confirm with target highlighting) is the preferred mobile pattern — deferred to later build. |
| Build order | Interleaved: bends → editor → playground | Each piece informs the next. Can't author good rooms without seeing bends. Can't evaluate bends without authored rooms. |

---

## Part 1: Rule-Bending System (Size Property)

### The Two Bends

| Bend | Effect | Visual |
|------|--------|--------|
| **Enlarge** | scale × 2.5, mass × 2, collision radius × 2 | Object grows with pulse effect. Blue-white glow tint. |
| **Shrink** | scale × 0.3, mass × 0.3, collision radius × 0.3 | Object shrinks with implosion effect. Yellow glow tint. |

### Mid-Combat Flow

1. Press **Q** → enter bend mode. Time slows to 30%. Radial menu appears (2 options: Enlarge / Shrink). Bend counter visible ("Bends: 3/3").
2. Click a bend from the radial → bend selected. Cursor becomes targeting reticle. Valid targets pulse/highlight.
3. Click a physics object or destructible obstacle → bend applies immediately. Object visually transforms (scale + color tint + particle burst + audio cue). Counter decrements.
4. Still in bend mode — can apply another bend or pick a different one.
5. Press **Q** again → exit bend mode. Time resumes normal speed.

### Bend Rules

- Max 3 bends per encounter (resets on room load)
- Can't apply both Enlarge AND Shrink to same target (opposite poles)
- CAN apply same bend to multiple targets
- Bends are permanent for the room — no undo during combat
- Same bend on same target = no-op (doesn't consume charge)

### What Changes When a Bend Applies

- **Visual:** Mesh scales up/down. Color tint (blue for Enlarge, yellow for Shrink). Brief pulse animation.
- **Physical:** Mass changes → push resistance changes. Radius changes → collision area changes. Friction unchanged — momentum (mass × velocity) is what shifts.
- **Mesh position:** Enlarged objects may need Y-offset adjustment so they sit on the ground correctly.

### Data Model

```typescript
export interface RuleBend {
  id: string;                    // 'enlarge' | 'shrink'
  name: string;
  description: string;
  icon: string;                  // emoji for now
  property: 'size';
  pole: 'positive' | 'negative';
  applicableTo: ('physicsObject' | 'obstacle')[];
  parameterChanges: BendEffect[];
}

export interface BendEffect {
  param: string;                 // 'scale' | 'mass' | 'radius'
  operation: 'multiply' | 'set';
  value: number;
}

export interface ActiveBend {
  bendId: string;
  targetType: 'physicsObject' | 'obstacle';
  targetId: number;
  originalValues: Record<string, number>;  // for reset on room load
}
```

### Files

- Create: `src/config/bends.ts` — Bend definitions
- Create: `src/engine/bendSystem.ts` — State management, apply/undo, room reset
- Create: `src/ui/radialMenu.ts` — Radial menu rendering + input
- Modify: `src/engine/game.ts` — Time slow during bend mode, integrate bend system
- Modify: `src/engine/input.ts` — Q key toggle for bend mode
- Modify: `src/entities/physicsObject.ts` — Mesh re-scaling on bend apply

### Gameplay Scenarios This Enables

- Enlarge rock → push into enemy cluster → massive collision radius + mass = multi-kill
- Shrink rock → push it → flies across room hitting everything (low mass, high velocity)
- Enlarge barrel → block a corridor or pit entrance
- Shrink pillar → small enough to push, shove into pit to clear path
- Enlarge + Shrink on different objects → create mass differential for collision chains

---

## Part 2: Level Editor

### Architecture

New editor (`src/ui/levelEditor.ts`). Reuses undo/redo snapshot system and keyboard shortcut infrastructure from existing spawn editor. Existing spawn editor remains for enemy placement.

### Three Modes

| Mode | Key | What you can do |
|------|-----|----------------|
| **Obstacle** | 1 | Place, select, move, resize obstacles. Spatial drag handles for w/h/d. Property panel for destructible, health, material. |
| **Physics Object** | 2 | Place rocks/crates/barrels/pillars. Drag to move. Visual collision radius circle on ground. Property panel for mass, health, material. |
| **Pit** | 3 | Place, resize, delete pits. Same spatial handle pattern as obstacles. |

### Spatial Handles

- Selected obstacle/pit: 6 edge handles (±X, ±Y, ±Z faces). Drag to resize that dimension.
- Selected physics object: draggable radius ring on ground plane. Shows collision circle.
- Position: click and drag the object body itself.
- All handles rendered as small colored spheres/cubes at edges.

### Property Panel (Compact, Right Side)

Only visible when an object is selected. Shows non-spatial properties:

**Obstacle properties:**
- Destructible (checkbox)
- Health (number input, only if destructible)
- Material (dropdown: stone/wood/metal/ice)

**Physics object properties:**
- Mesh type (dropdown: rock/crate/barrel/pillar)
- Material (dropdown: stone/wood/metal/ice)
- Mass (number input)
- Health (number input)
- Radius (number input — also shown as ground circle)

**Pit properties:**
- Width, depth (also editable via handles)

### Bend Preview (Editor Mode)

While in the editor, a "Preview Bends" toggle:
- When active, shows the same radial menu
- Click a bend → click an object → see the visual result (scale change, color tint)
- Helps author rooms with bend scenarios in mind: "if I enlarge this rock, does it block this corridor?"
- Preview bends don't persist — they reset when you exit preview mode
- This is a design tool, not a gameplay state

### Export / Import

- "Copy Room JSON" button → copies room definition to clipboard (same format as `rooms.ts`)
- "Load Room JSON" → paste JSON, loads into editor
- Format matches `RoomDefinition` interface exactly

### Keyboard

| Key | Action |
|-----|--------|
| `` ` `` (backtick) | Toggle editor on/off |
| `1` / `2` / `3` | Switch mode (Obstacle / Physics / Pit) |
| `Delete` / `Backspace` | Delete selected object |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Escape` | Deselect |
| `D` | Duplicate selected |

### Files

- Create: `src/ui/levelEditor.ts` — Editor core: modes, selection, placement, handles
- Create: `src/ui/editorHandles.ts` — Spatial resize handle rendering + drag interaction
- Create: `src/ui/editorPanel.ts` — Property panel (DOM)
- Modify: `src/engine/input.ts` — Editor input handling (click-to-place, drag, handle interaction)
- Modify: `src/engine/renderer.ts` — Handle meshes, collision radius visualization, editor grid overlay

---

## Part 3: Integration + Playground Room

### Build Order

| Step | What | Why this order |
|------|------|----------------|
| 1 | Bend system core (data model, apply/undo, state tracking) | Foundation — everything builds on this |
| 2 | Bend visuals (object scaling, color tint, particles) | Need to see bends working before authoring rooms for them |
| 3 | Radial menu + targeting (Q toggle, click to apply) | Player-facing UX for applying bends |
| 4 | Level editor core (place/move/delete physics objects + obstacles + pits) | Now you can author rooms |
| 5 | Editor spatial handles (drag to resize, radius visualization) | Makes authoring efficient |
| 6 | Editor property panel + export/import | Edit non-spatial properties, save room designs |
| 7 | Bend preview in editor | Author rooms with bend scenarios in mind |
| 8 | Author playground room + play-test | The evaluation moment |

### Evaluation Criteria

After building all of this, the question to answer:

> "Does bending size mid-combat create moments I couldn't get from just pushing objects around?"

If yes → add more bend properties (Durability, Adhesion), deepen the system.
If no → the twist needs rethinking before investing further.

---

## What's NOT in Scope

- Observation → combat phase split (can add later if planning matters)
- Adhesion bends (Sticky/Bouncy)
- Durability bends (Sturdy/Fragile)
- Player-action bends (Long Push, Heavy Strikes)
- Elegant solution detection
- Enemy inspection tooltips
- Mobile touch controls (design is compatible, implementation deferred)
- Enemy placement in new editor (existing spawn editor handles this)

---

## Mobile Compatibility Note

Desktop-first build. When mobile is implemented later, the preferred pattern is **select-then-confirm**: tap bend button → all valid targets get highlighted rings → tap target → bend applies. This avoids hover-dependency and handles fat-finger targeting through generous target highlighting.

---

## Technical Risks

1. **Radial menu during gameplay** — Need to handle time slow without pausing the render loop. Slow `dt` rather than pause.
2. **Spatial handles + isometric camera** — Drag directions need to map correctly in isometric projection. May need plane-constrained raycasting.
3. **Mesh re-scaling** — Enlarged objects need collision radius AND visual mesh to scale together. Y-position adjustment so objects sit on ground.
4. **Editor ↔ game state sync** — Editor modifies the same OBSTACLES/physicsObjects arrays the game uses. Need clean boundaries between editor state and game state.
5. **Undo system for spatial edits** — Need continuous-drag snapshots (save on drag start, not every frame).

---

*Design approved: 2026-02-15*
