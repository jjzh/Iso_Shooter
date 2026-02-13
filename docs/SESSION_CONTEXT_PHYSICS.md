# Session Context: Physics-First Combat Prototyping

> Reference document for building a Claude Code prototyping skill. Captures how Jeff works, collaboration patterns, decision-making moments, and lessons learned from a full-day session building a physics-based combat system.

---

## Session Overview

**Branch:** `explore/hades`
**Duration:** ~5 context windows (marathon session)
**Scope:** Took an action roguelike prototype from basic melee combat to a full physics-based combat system with velocity knockback, wall slams, enemy-enemy collision, force push wave occlusion, and pit falls.
**Test count:** 312 → 509

---

## How Jeff Communicates

### Voice Dictation
Jeff uses voice dictation for all prompts. Expect:
- Transcription artifacts ("intercession" for "the session")
- Filler words ("um", "uh") scattered throughout
- Run-on sentences with topic shifts mid-thought
- Occasional garbled output when he pastes terminal errors

### Feel-First Feedback
Jeff describes problems in terms of **what he observes and how it feels**, not in terms of code:
- "They sort of slide back after you push them. I don't think that's good."
- "I want the feeling of like I tap the button and it is like punched."
- "I'm having difficulty pushing enemies into the pit."
- "The sword is much too small and oftentimes when I do the melee attack it is not actually drawing in the direction of my cursor."

**Implication:** Don't ask Jeff to debug code. Translate his feel observations into technical hypotheses yourself, then verify.

### Bundled Feedback
Jeff groups 3-5 observations per message rather than filing one at a time:
- "Let's add a mute button + remove melee knockback + double the enemies + split into waves"
- "Increase force + reduce cooldown + reduce slide feel + add terrain flash + enable enemy collision"

**Implication:** Track all items. Use a todo list. Don't lose the thread on item 3 because you're deep in item 1.

### Register Signals
Jeff changes his communication register to signal what kind of interaction he wants:

| Framing | What Jeff wants |
|---------|-----------------|
| "Let's add X" / "Do Y" | Directive — just do it, minimal discussion |
| "I'm gonna talk through my thoughts and I want us to come up with a plan" | Collaborative — explore together, push back on me |
| "Can you walk me through the decision for why we chose X?" | Teach me — explain trade-offs, build my judgment |
| "I seem to be observing..." | Bug report — diagnose and fix |

---

## Decision-Making Patterns

### Jeff Decides Direction, Claude Decides Implementation
Jeff's role is design intent and system philosophy. Claude's role is translating that into code. Jeff rarely prescribes implementation details, but he WILL push back on architectural decisions that conflict with his design philosophy.

### The "Physics as First-Class System" Moment
The most important decision in the session. The sequence:

1. Jeff noticed enemies passing through each other when force-pushed (bug report)
2. Claude diagnosed it as the "instant snap teleport" portion of hybrid knockback and implemented a stepped-snap workaround
3. Jeff asked: "Should it be a teleport? Can you walk me through the decision?"
4. Claude presented trade-offs
5. **Jeff's response (the key moment):**

> "If we want physics to be a first-class system, using teleport to simulate some of the effects cheaply actually isn't necessarily the correct direction... we just want the force applied to any individual object tuned such that we can still get all the snappiness that we want without having to cheat it via teleport. Because that way we're not running into these sorts of edge cases. We don't have to come up with additional handling for these edge cases. We can have a system that is designed to sort of capture the appropriate context throughout."

**What this reveals about Jeff's thinking:**
- He identifies when a fix treats symptoms instead of the cause
- He thinks in systems — if physics is the system, everything should go through physics
- He prefers removing complexity (delete the teleport) over adding complexity (step the teleport)
- He accepts that the "right" solution may require tuning (higher velocity values) rather than workarounds

### The Force Push Wave Misunderstanding
Jeff asked for force push to behave "like a wave." Claude initially proposed **distance-based force falloff** (nearer enemies get more force, farther get less). Jeff corrected this:

> "The metaphor of it being a wave is more meant to communicate the idea that the force is only applied to the first set of targets that it would overlap with and it's absorbed by them."

**What went wrong:** Claude defaulted to an engineering-obvious solution (gradient/falloff) instead of the game-design-correct solution (occlusion/blocking). Jeff's mental model was physical — a wave hits the first thing and stops. Claude's was mathematical — a wave attenuates with distance.

**Lesson:** When Jeff describes a mechanic using a metaphor, ask clarifying questions about the intended interaction before proposing a solution. Think about what the PLAYER experiences, not what the math looks like.

### Competing System Detection
Jeff identified that melee knockback and force push were competing for the same design role:

> "Let's remove the knockback on the sword... the knockback itself ends up replacing the need for force push."

**Pattern:** Jeff thinks about ability budgets — each verb should have a distinct purpose. If two systems create similar outcomes, one should be trimmed.

---

## The Iterative Feedback Loop

The pattern that repeated throughout the session:

```
1. Jeff gives design intent (voice dictation, feeling-oriented)
2. Claude explores the codebase (reads files, checks existing systems)
3. Claude proposes a plan (structured, with trade-offs when appropriate)
4. Jeff approves or redirects (usually approves with minor notes)
5. Claude implements (with automated tests, typecheck, build verification)
6. Jeff playtests (opens browser, interacts with the game)
7. Jeff reports observations (visual/feel-oriented, bundled 3-5 per message)
8. Repeat from step 1
```

### Two-Tier Verification
Jeff established this early:

> "As you're going along, once individual features and functions have been completed, we should go through an automated unit testing process. I will eventually play the game manually and we can make adjustments from there."

- **Tier 1 (Claude):** `npm run typecheck && npm run test && npm run build` after every change
- **Tier 2 (Jeff):** Manual playtesting after major milestones, with feel-oriented feedback

**Critical rule:** Always run build before telling Jeff the game is ready to play. A stale build caused the first playtest to fail (melee didn't work) and cost trust.

---

## What Went Well

### Plan-Then-Build Cadence
Jeff consistently wanted to see the plan before implementation. Claude delivered structured plans with trade-off tables and clear scope. This matched Jeff's "present options, let me choose" preference.

### Reusing Existing Systems
When Jeff said "we should reuse whatever systems are already there," Claude consistently found existing patterns (particle pools, event bus subscriptions, config objects, tuning panel sections) and extended them rather than building new infrastructure.

### Explaining Decisions When Asked
The instant-snap trade-off explanation included concrete numbers ("v0 = 24.5 u/s, first frame moves 0.41 units"). This matched Jeff's stated preference for understanding trade-offs before deciding.

### Acknowledging When Jeff Was Right
Rather than defending the teleport implementation, Claude immediately said "You're absolutely right" and simplified the code. This built trust and kept momentum.

### Session Continuations
Each context window ended with a detailed summary that preserved full state. Claude picked up seamlessly each time.

---

## What Went Poorly

### 1. First Playtest Failure
Melee didn't work on Jeff's first playtest. Likely a stale build (Jeff wasn't running `npm run watch`). This was a first-run-experience failure for someone learning engineering.

**Fix:** Always verify the build is fresh and explain how to start the dev server.

### 2. Visual Sizing for Isometric Camera
The sword mesh was sized for close-up viewing (0.04 x 0.35 x 0.04) but was barely visible in the isometric camera view. Jeff reported "the sword is much too small."

**Fix:** Consider camera distance and rig scale when sizing visual elements.

### 3. Engineering Solution vs. Game Design Solution
Force push wave: Claude proposed distance-based falloff (engineering-obvious). Jeff wanted occlusion/blocking (game-design-correct). The wave metaphor was about physical blocking, not mathematical attenuation.

**Fix:** When Jeff describes a mechanic, think about what the PLAYER would experience in real life, not what the cleanest math is.

### 4. Fixing Symptoms Instead of Systems
The tunneling bug led to a stepped-snap workaround (more code to handle edge cases of the teleport). Jeff caught this and pushed for the real fix (remove the teleport entirely, use pure velocity).

**Fix:** When patching edge cases, ask whether the underlying system design is wrong before adding workaround code.

### 5. Fundamental Interaction Didn't Work
After building the entire physics system, enemies couldn't be pushed into pits — the core gameplay moment. The cause was two collision systems disagreeing about whether pits were solid.

**Fix:** Verify the primary gameplay interaction works end-to-end after building a system. Don't assume subsystems compose correctly without testing.

### 6. Context Window Exhaustion
The session required 5 context windows. Each continuation required a summary, and some details were inevitably lost.

**Fix:** Aim for tighter sessions with clear stopping points. Update HANDOFF.md at natural milestones.

---

## Technical Decisions Made

### Physics System Architecture

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Knockback method | Pure velocity (not teleport) | Physics-first — all forces go through velocity so interactions compose naturally |
| Velocity formula | `v0 = sqrt(2 * friction * distance)` | Ensures total slide distance matches intended knockback, with friction deceleration |
| Wall tunneling prevention | Stepped velocity integration (radius-sized substeps) | Prevents high-speed enemies from skipping through walls |
| Force push targeting | Wave occlusion (lateral blocking) | Front enemies block back enemies → enables bowling mechanic |
| Pit interaction | Check pits during velocity substeps | Velocity can carry enemies into pits; pit collision skipped for knocked-back enemies |
| Enemy-enemy collision | O(n²) pairwise with mass-weighted separation | n is small (typically 2-6 enemies in contact), mass affects momentum transfer |
| Instant snap ratio | 0 (disabled) | Teleport creates edge cases; pure velocity handles all interactions |

### Config-Driven Design
Every feel parameter is exposed in the tuning panel:
- Physics: friction, wall slam damage/stun/bounce, enemy bounce/impact damage/stun, wave block radius
- Force push: cooldown, charge time, length, width, knockback range
- Melee: damage, range, arc, cooldown, screen shake, hit pause

Jeff tunes values via sliders during play. Claude sets reasonable defaults.

---

## Jeff's Working Style Summary

| Dimension | Pattern |
|-----------|---------|
| **Input method** | Voice dictation with transcription artifacts |
| **Feedback style** | Feel-first, bundled observations, direct but not prescriptive |
| **Planning preference** | Wants to see the plan, wants pushback, wants trade-off tables |
| **Decision authority** | Jeff decides direction; Claude decides implementation details |
| **Verification model** | Two-tier: automated tests (Claude) + manual playtesting (Jeff) |
| **Design philosophy** | Emergent systems over scripted behaviors; physics-first |
| **Technical depth** | Understands architecture and system interactions; learning implementation |
| **Pace** | Rapid iteration — build, test, adjust — no perfectionism |
| **Communication signal** | Register changes (directive vs. exploratory vs. "teach me") based on framing |

---

## Key Principles for Future Sessions

1. **Translate feel to code.** Jeff says "it doesn't feel punchy" — your job is to figure out which parameter (friction, velocity, screen shake) maps to "punchy."

2. **Think like a game designer first.** When Jeff describes a mechanic, think about the player fantasy and physical intuition before reaching for math.

3. **Systems, not patches.** If a fix adds complexity to handle edge cases, ask whether the underlying system should be redesigned instead.

4. **Verify the core interaction.** After building a system, test the primary gameplay moment end-to-end. Don't assume subsystems compose correctly.

5. **Always build before "try it."** Run `npm run build` before telling Jeff the game is ready.

6. **Track bundled feedback.** Jeff gives 3-5 requests per message. Use a todo list. Acknowledge each item.

7. **Present trade-offs, not choices.** When Jeff faces a decision with low context, research the options and present concrete implications before asking him to choose.

8. **Reuse existing patterns.** Check what infrastructure already exists (event bus, particle presets, tuning panel sections) before building new systems.

9. **Update HANDOFF.md at milestones.** This is the cross-session memory. Keep it current.

10. **Pair learning with building.** Jeff wants to understand WHY, not just get working code. Explain the reasoning behind technical decisions when there's a teaching moment.

---

*Generated from explore/hades session, February 2026*
