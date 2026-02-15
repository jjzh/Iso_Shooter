# Session Context: Stealth Feel Pass & Rotation Debugging

> Captures calibration moments and working patterns from the vision cone / enemy facing / movement debugging sessions.

---

## Calibration Moments

### "I want a more elegant solution"
When Claude attempted to fix the cone rotation by computing it independently from the model rotation (using the same `-facingAngle + Math.PI` formula but applied separately), Jeff pushed back: "It feels like for whatever reason these things are fighting each other." The fix he suggested — `cone.rotation.y = enemy.mesh.rotation.y` (copy from model) — eliminated an entire category of bugs by construction rather than by mathematical correctness.

**Lesson:** Jeff prefers solutions that are correct *by construction* over solutions that are correct *by computation*. If two things should always agree, make one derive from the other, don't compute them independently even if the formula is the same.

### "Enemies can only walk in the direction they're looking"
When moonwalking persisted, Jeff reframed the problem entirely. Instead of debugging why the facing direction didn't match the movement direction, he said: "Let's try one more thing. Enemies can only walk in the same direction they are looking." This eliminated the concept of "movement direction" as a separate thing from "facing direction."

**Lesson:** Jeff solves integration problems by reducing degrees of freedom, not by adding synchronization. Rather than "make sure X and Y agree," he prefers "make Y derive from X so they can't disagree."

### Iterative frustration threshold
After 5+ rounds of "fix → test → still broken," Jeff called it: "I don't think the issues are fixed. Let's summarize all the difficulties... I think we have to be prepared to rearchitect from the ground up." He didn't ask for another patch.

**Lesson:** Jeff has a clear threshold for when iterative patching should stop and a clean rebuild should start. The signal is: the same category of bug persists after multiple structurally different fix attempts. When this happens, stop patching and prepare context for a clean start.

## Working Patterns

### Screenshots as debugging evidence
Jeff sent screenshots at each test cycle showing exactly what was wrong. He describes what he *expects* to see vs what he *actually* sees: "I should be seen by the two goblins that are closer to me, but instead I am being seen by the goblin further on the left." This is precise behavioral evidence, not vague "it's broken."

**What Claude should do:** Trust the visual evidence completely. If the math says it should work but Jeff's screenshot shows it doesn't, the math analysis is wrong (or incomplete), not the observation.

### "Systems that are continuous with each other"
Jeff wants systems that feel like one coherent thing, not independent modules that happen to sync up: "Right now it feels like these are independent systems that are moving separate from each other as opposed to having a single source of truth." This applies to facing, movement, cones, and aggro — they should be one system with one source of truth, not four systems that try to agree.

**Anti-pattern for Claude:** Don't build parallel systems that compute the same value independently (even from the same formula). Build one authoritative system and have everything else read from it.

## Key Lesson for Future Sessions

When debugging visual/spatial bugs in a 3D engine:
1. **Don't trust math spot-checks.** Verifying `facingAngle=0 → rotation.y=π → model faces +Z ✓` at specific angles doesn't prove the system works at all angles or under all conditions.
2. **Build a visual test harness first.** Place one enemy, add debug arrows showing facing direction and movement direction, verify visually before integrating.
3. **If it's been 3+ iterations of the same bug category, stop and rebuild.** The accumulated patches are obscuring the real issue.
