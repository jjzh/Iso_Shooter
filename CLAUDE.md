# Iso_Shooter — Claude Code Instructions

Isometric action gameplay sandbox built in Three.js + TypeScript. Rapid prototyping project exploring different combat directions (physics, stealth, vertical, rule-bending) across independent branches, integrated into a 6-room playable demo.

---

## Quick Reference

```bash
npm run build        # esbuild → dist/game.js
npm run typecheck    # tsc --noEmit
npm run test         # vitest run
npm run watch        # esbuild watch mode
npm run start        # node server.cjs (local dev server)
```

**Always run `npm run typecheck && npm run test && npm run build` before telling Jeff the game is ready to play.** A stale build erodes trust. This is non-negotiable.

---

## Project Context

**Who:** Jeff Zhang — product, UX, and game designer building as a solo indie developer. AI-native workflow: Claude handles implementation; Jeff drives design intent, systems architecture, and feel. Uses voice dictation — parse for embedded ideas even through transcription artifacts and topic shifts.

**What:** Each `explore/*` branch prototypes a different mechanical direction. The `demo/portfolio` branch integrates them into sequential rooms for a playable showcase. This is a prototyping project — iteration speed matters more than production polish.

**Where:** Mac laptop, single machine (traveling). Git is the sync mechanism. HANDOFF.md carries context between sessions.

---

## Session Flow

### Starting a session
The SessionStart hook auto-runs `git pull` and outputs HANDOFF.md. Read it silently — it tells you where things left off. Don't summarize it back to Jeff unless he asks ("where were we?", "what's the status?").

Jeff often starts sessions by referencing the handoff: "let's pick up from handoff.md", "where did we leave off", "let's continue from handoff.md and look at next steps". He also frequently starts execution sessions with: "Execute the implementation plan at docs/plans/..."

### During a session
- The `session-handoff` skill updates HANDOFF.md when meaningful progress happens (design decisions, features built, bugs fixed, priorities shifted)
- The `working-context` skill captures patterns in how Jeff thinks when calibration moments occur
- Neither skill is user-invoked — activate them automatically when triggered

### Context window awareness
Warn Jeff when context reaches 50% usage. He proactively wraps up sessions ("let's push these changes and update handoff", "let's spin up a new session"). When context is running low, prioritize: push changes, update HANDOFF.md, and prepare a clean handoff for the next session.

### Ending a session
When Jeff signals wrap-up ("let's push", "update handoff", "that's it"), do a final HANDOFF.md update. The SessionEnd hook auto-commits and pushes context files.

---

## Branching Strategy

```
main                    — shared infrastructure (event bus, audio, particles, effect system)
  ├── explore/hades     — combat juice, encounter pacing, room system
  ├── explore/vertical  — aerial verbs (jump, launch, dunk, spike)
  ├── explore/assassin  — vision cones, stealth, detection
  ├── explore/rule-bending — physics objects, enlarge/shrink
  └── demo/portfolio    — all explorations integrated into 6 playable rooms
```

- `explore/*` branches diverge from `main` and develop independently
- `demo/portfolio` integrates the best of each into a profile-gated superset
- When integrating from an explore branch: copy unique files, extend types/events/config, gate mechanics behind `getActiveProfile() === 'profileName'`

---

## Architecture

### Profile-Gated Superset
Each room declares a profile. Mechanics are gated behind profile checks:

```typescript
if (getActiveProfile() === 'vertical') {
  // jump, launch, dunk, spike logic
}
```

Profiles: `'origin' | 'base' | 'assassin' | 'rule-bending' | 'vertical'`

### Key Files
| Area | Files |
|------|-------|
| Room definitions | `src/config/rooms.ts` |
| Profile management | `src/engine/profileManager.ts` |
| Physics | `src/engine/physics.ts` |
| Player | `src/entities/player.ts` |
| Enemies | `src/entities/enemy.ts` |
| Game loop | `src/engine/game.ts` |
| Room transitions | `src/engine/roomManager.ts` |
| Types | `src/types/index.ts` |
| Events | `src/engine/events.ts` |
| Config | `src/config/*.ts` |

### Conventions
- **Event bus** for decoupled communication between systems
- **Procedural audio** via Web Audio API (no audio files)
- **Pooled mesh particles** with config-driven bursts
- **Per-room physics flags** (`enableWallSlamDamage`, `enableEnemyCollisionDamage`) on RoomDefinition
- **Config-driven parameters** — expose tunable values in config files, not magic numbers in logic

---

## How Jeff Works

See `~/.claude/CLAUDE.md` for full working style, communication patterns, and learning philosophy. Project-specific notes:

- Jeff gives **feel-first feedback** about game feel: "it doesn't feel punchy", "the drift feels disconnected", "spike doesn't fire reliably." Translate into parameter or physics hypotheses — default to diagnosing it yourself.
- Jeff decides direction and design intent; Claude decides implementation details. Jeff will push for explanations when he wants to build intuition — don't pre-filter what's "too technical."
- **Bundled feedback** is common after playtesting (3-5 items per message). Track all items. Use a todo list.
- When exploring new mechanical directions, Jeff thinks in systems and player verbs. Don't converge on an implementation before the design space is explored.

---

## Plans and Design Docs

Plans live in `docs/plans/` with naming: `YYYY-MM-DD-description.md`

**Design docs** and **implementation plans** are always separate:
- Design doc: narrative, layout, mechanics, profile definition, room definition, "what and why"
- Implementation plan: numbered task list, files to modify, integration approach, "how"

When integrating mechanics from an explore branch, the standard pattern is:
1. Copy unique files from the explore branch
2. Extend types/events/config
3. Gate new mechanics behind profile checks in shared files
4. Add room definition
5. Add/update tests
6. Build + typecheck + test

---

## Key Documents

| Document | Purpose |
|----------|---------|
| `HANDOFF.md` | Living context bridge — where we are, what happened, what's next |
| `docs/HANDOFF_TEMPLATE.md` | Template for new branch handoff docs |
| `docs/PROTOTYPE_THESIS.md` | Top-level map of design exploration across all branches |
| `docs/DESIGN_EXPLORATION.md` | Design ideas, twist candidates, evaluation frameworks |
| `docs/SESSION_CONTEXT_PHYSICS.md` | How Jeff thinks and works (calibration data for Claude) |
| `docs/parameters.md` | All tunable parameters, defaults, and units |
| `EFFECT_SYSTEM_HANDOFF.md` | GAS-inspired effect system design and migration plan |

---

## Deployment and Mobile Testing

- **GitHub Pages:** `https://jjzh.github.io/Iso_Shooter/` — the live demo target
- Push to the active branch and GitHub Pages deploys automatically
- Jeff frequently pushes, then tests on his phone in landscape mode
- Mobile testing is a core feedback loop — expect bundled reports about button layout, zoom levels, touch controls, and joystick behavior after each push
- When Jeff reports mobile issues, consider: viewport sizing, touch event handling, landscape orientation, button positioning in the radial fan layout

---

## Testing

- **851+ tests** across 27+ test files in `tests/`
- Framework: vitest
- Run with: `npm run test` (or `npx vitest run`)
- Always verify tests pass after changes. Don't claim work is done with failing tests.
- Jeff does manual playtesting as tier 2 — always build before he plays

---

## Principles

1. **Systems, not patches.** If a fix adds complexity to handle edge cases, ask whether the underlying system should be redesigned. Jeff prefers removing complexity over adding workaround complexity.

2. **Physics-first.** Forces go through velocity so interactions compose naturally. Avoid teleport/snap workarounds.

3. **Think like a game designer.** When Jeff describes a mechanic using a metaphor, unpack the intended player experience before proposing an implementation. His metaphors carry interaction design intent, not math intent.

4. **Reuse existing patterns.** Check what infrastructure already exists (event bus, particle presets, config objects) before building new systems.

5. **Verify the core interaction.** After building a system, test the primary gameplay moment end-to-end. Don't assume subsystems compose correctly.

6. **Genre is scaffolding.** Don't over-invest in genre mechanics. They exist to support evaluating the twist.

7. **Explain when Jeff pulls the thread.** Jeff will push for explanations when he wants to build intuition. Don't pre-filter what's worth explaining — but don't slow down execution to teach unless asked.

---

## Sibling Projects

Jeff works on multiple projects in parallel. Context from these may come up:

- **game-design-brain** (`~/Workspace/game-design-brain`) — Jeff's thinking/writing project for organizing design frameworks, prototype ideas, and conversations with friends. Heavily exploration-mode. This is where design hypotheses and cross-prototype insights live.
- **SV-Portfolio** (`~/Workspace/SV-Portfolio`) — Frontend portfolio site. Uses git worktrees for feature isolation.
