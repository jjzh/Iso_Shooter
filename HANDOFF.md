# Portfolio Demo Handoff

> Playable portfolio piece: walk through design exploration as sequential rooms, each showcasing a different prototype branch's mechanics.

---

## Branch Info
- **Branch:** `demo/portfolio`
- **Forked from:** `explore/hades`
- **Last updated:** 2026-02-18

## Current State
**Branch created. Design plan written. No implementation yet.**

Design plan: `docs/plans/2026-02-18-portfolio-demo-design.md`

## Vision
5 rooms, each showcasing a different stage of Jeff's design exploration:
1. **The Foundation** — base combat (auto-fire, melee, pit + force push)
2. **Physics Playground** — wall slams, enemy collisions, force push as spatial tool
3. **The Shadows** — assassin branch (vision cones, stealth, bullet time)
4. **The Workshop** — rule-bending branch (physics objects, enlarge/shrink)
5. **The Arena** — vertical branch (Y-axis, launch, dunk, spike)

Architecture: profile-gated superset (`'base' | 'assassin' | 'rule-bending' | 'vertical'`). Each room declares its profile. Sandbox mode (no required combat). Room selector UI to jump anywhere.

## What To Do Next
Start Phase 1: Foundation
1. Extend `RoomDefinition` with `profile`, `sandboxMode`, `commentary` fields
2. Implement `profileManager.ts` (setProfile, cleanup, setup)
3. Implement sandbox mode (doors always unlocked immediately)
4. Build room selector UI
5. Define Room 1 + Room 2 layouts (base profile only)
6. Test: play through rooms 1-2, room selector works

## Session Log
- **2026-02-18 (session 1)** — Feasibility analysis and design planning. Explored all 4 branch codebases, mapped file conflicts (player.ts, physics.ts, enemy.ts, game.ts are the 4 conflict surfaces). Evaluated 3 approaches: kitchen sink merge (too risky), system modules (over-engineered), profile-gated superset (right-sized). Resolved edge cases: linear progression, room selector UI, standardized inputs, comprehensive cleanup, vertical as final room. Estimated ~5-7 sessions total. Created branch and design doc.
