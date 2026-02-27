# Session Context: Physics-First Combat Prototyping

> Project-specific context from the explore/hades physics session. Captures architecture decisions, the iterative feedback loop, and lessons specific to this prototype's combat system.
>
> Universal collaboration patterns (how Jeff communicates, his two working modes, feel-first feedback, steelmanning) have been migrated to `~/.claude/CLAUDE.md` (private, cross-project).

---

## Session Overview

**Branch:** `explore/hades`
**Duration:** ~5 context windows (marathon session)
**Scope:** Took an action roguelike prototype from basic melee combat to a full physics-based combat system with velocity knockback, wall slams, enemy-enemy collision, force push wave occlusion, and pit falls.
**Test count:** 312 → 509

---

## Key Design Decisions

### Physics as First-Class System

The most important decision in the session. Jeff identified that a "stepped snap teleport" workaround for tunneling was treating symptoms instead of causes:

> "If we want physics to be a first-class system, using teleport to simulate some of the effects cheaply actually isn't necessarily the correct direction... we just want the force applied to any individual object tuned such that we can still get all the snappiness that we want without having to cheat it via teleport."

**Implication for this project:** All forces go through velocity. No teleport shortcuts. Accept that the "right" solution may require tuning (higher velocity values) rather than workarounds.

### Force Push Wave as Occlusion

Jeff's "wave" metaphor meant physical blocking (front enemies absorb force, back enemies are shielded), not distance-based attenuation. The player fantasy is bowling, not a gradient.

### Competing System Detection

Jeff identified melee knockback and force push were competing for the same design role and trimmed melee knockback. Each verb should have a distinct purpose in the ability budget.

---

## Technical Architecture

### Physics System

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Knockback method | Pure velocity (not teleport) | Physics-first — all forces through velocity |
| Velocity formula | `v0 = sqrt(2 * friction * distance)` | Ensures total slide distance matches intended knockback |
| Wall tunneling prevention | Stepped velocity integration (radius-sized substeps) | Prevents high-speed enemies from skipping through walls |
| Force push targeting | Wave occlusion (lateral blocking) | Front enemies block back enemies → bowling mechanic |
| Pit interaction | Check pits during velocity substeps | Velocity can carry enemies into pits |
| Enemy-enemy collision | O(n²) pairwise with mass-weighted separation | n is small (typically 2-6 enemies in contact) |
| Instant snap ratio | 0 (disabled) | Teleport creates edge cases; pure velocity handles all |

### Config-Driven Design

Every feel parameter is exposed in the tuning panel:
- Physics: friction, wall slam damage/stun/bounce, enemy bounce/impact damage/stun, wave block radius
- Force push: cooldown, charge time, length, width, knockback range
- Melee: damage, range, arc, cooldown, screen shake, hit pause

Jeff tunes values via sliders during play. Claude sets reasonable defaults.

---

## Two-Tier Verification (This Project)

- **Tier 1 (Claude):** `npm run typecheck && npm run test && npm run build` after every change
- **Tier 2 (Jeff):** Manual playtesting after major milestones, with feel-oriented feedback

**Critical rule:** Always run build before telling Jeff the game is ready to play. A stale build caused the first playtest to fail and cost trust.

---

## Lessons Specific to This Prototype

1. **Visual sizing for isometric camera** — elements sized for close-up viewing are barely visible in isometric view. Consider camera distance when sizing meshes.
2. **Verify the core interaction** — after building the entire physics system, enemies couldn't be pushed into pits. Two collision systems were disagreeing. Test the primary gameplay moment end-to-end.
3. **Context window management** — marathon sessions (5 context windows) lose detail at each continuation. Aim for tighter sessions with clear stopping points.

---

*Generated from explore/hades physics session, February 2026.*
*Universal collaboration patterns migrated to ~/.claude/CLAUDE.md on 2026-02-27.*
