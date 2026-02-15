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

*Generated from explore/hades physics session, February 2026*

---
---

# Part 2: Design Exploration & Thesis Development

> Captures how Jeff works during open-ended design exploration — idea generation, thesis refinement, convergent decision-making, and the transition from abstract thinking to concrete build plans. Appended to provide full session context.

---

## The Two Modes Jeff Operates In

The physics section above documents execution mode. This section documents **exploration mode** — the earlier part of the session where Jeff was developing ideas, not building code.

### Exploration Mode (~First 60% of Session)

Jeff is thinking out loud. He doesn't have a clear goal yet — he's circling around ideas, testing framings, looking for the thing that clicks. Signals:

- Long voice-dictated messages with topic shifts
- Hypothetical examples ("imagine if the game imported your Spotify...")
- Reference to other games as inspiration, not specification
- Questions framed as "what if" rather than "how do I"
- Explicit requests to challenge or push back

**What Claude should do:**
- Match Jeff's energy — explore broadly, don't converge prematurely
- Offer frameworks and framings, not solutions
- Push back genuinely (Jeff explicitly asks for this)
- Capture ideas in durable artifacts — Jeff's best thinking happens verbally and will be lost without documentation
- Identify when Jeff says something important that he hasn't fully articulated yet, and help him crystallize it

**What Claude should NOT do:**
- Jump to implementation ("let me create a file for that")
- Treat exploration as a decision that needs to be made
- Present options as if Jeff needs to choose right now
- Lose track of ideas that came up early — Jeff circles back to them

### Transition Signals

The transition from exploration to execution happened across Messages 8-10:

- **Message 8:** "I think my instinct is to get to a Hades-like state first" (directional convergence)
- **Message 9:** Specific decisions: hand-coded rooms, pure melee, one room sufficient (scoping convergence)
- **Message 10:** "Let's just start" (execution signal)

**Signals that Jeff is transitioning:**
- Messages get shorter
- Hedging language ("I think", "maybe") disappears
- Specific choices stated as facts
- Explicit "let's go" or "let's start"

**What Claude should do at the transition:**
1. Confirm the scope (repeat back what's in and out)
2. Present a structured build plan
3. Ask if the plan needs adjustment (one last chance for exploration)
4. Switch to execution mode — todo list, implement, test, build

---

## How Ideas Evolve in Conversation

### The Generative Surface Arc

This is the most instructive example of how Jeff develops ideas through dialogue:

**Stage 1 — Raw intuition** (Message 1):
> "One of the things that I want to explore more with this project is the idea of generative surfaces... This idea of a surface that actually generates different outcomes for gameplay from person to person — not because of a skill variable, but because of a context variable."

Jeff knows he's onto something but can't define it precisely yet. He uses examples to triangulate: D&D character backstory, importing a song that changes game mechanics, photographing a bridge that becomes a level.

**Stage 2 — Naming and framing** (Claude response):
Claude provided the term "exogenous context" and categorized different sources (temporal, environmental, social, creative, behavioral). This gave Jeff vocabulary to work with.

**Stage 3 — Sharpening through contradiction** (Message 4):
> "Build convergence is a really interesting thing for me... the idea of the game giving you a neutral power level and then the external context is what pushes you into temporary strength."

Jeff takes the framework and runs with it — but he's not just accepting it. He's stress-testing: does exogenous context actually solve the build convergence problem? His answer: only if it creates *temporary* advantages, not permanent ones.

**Stage 4 — Practical grounding** (Message 7):
> "The generative surface can be faked... just faking the data... Some of these things are interesting to talk about but I'm not sure they would actually feel more fun."

Jeff pulls back from the abstract to the concrete: cool ideas need to be testable. The prototyping version of a generative surface is just hard-coded presets that simulate different external contexts.

**Stage 5 — Separation of concerns** (Message 7):
> "I think the game needs BOTH a gameplay twist AND a generative twist... the game itself needs to feel different to play."

The final crystallization: generative surfaces are a *structural* innovation (run-to-run variety), but the game still needs a *moment-to-moment* innovation (gameplay twist). These are separate problems with separate solutions.

### Pattern: Ideas Arrive as Metaphors, Not Specifications

Jeff's most important ideas come wrapped in metaphors or examples:

| What Jeff said | What he meant |
|---|---|
| "Like D&D backstory" | Player identity should mechanically matter, not just be cosmetic |
| "Import your Spotify playlist" | External personal data creates unique gameplay variants |
| "Photograph a bridge" | Physical environment becomes game content |
| "Like a wave" (physics session) | Force propagates and is absorbed, not attenuated |
| "Neutral power + external context = temporary strength" | Exogenous modifiers should create fleeting advantages, not permanent builds |

**Lesson for skill authoring:** When Jeff uses a metaphor, unpack the intended *interaction* (what the player experiences) before proposing an *implementation* (what the code does). The metaphor carries design intent that a literal interpretation would miss.

---

## The Steelmanning Pattern

Jeff explicitly asks Claude to argue against its own proposals. This happened twice:

### Instance 1: "Steelman against each one of your suggested steps"

Claude proposed a 5-step Phase 1 plan. Jeff said:

> "I want you to steelman against each one of your suggested steps and then come to me with a revised plan."

The steelmanning produced real improvements:
- **Room system:** Originally proposed as a new parallel system -> steelmanned to "extend existing arena config" (simpler, reuses code)
- **Door visuals:** Originally included -> steelmanned to "auto-transition, no doors" (avoids visual design decisions that don't matter yet)
- **Melee animation:** Originally proposed as elaborate -> steelmanned to "minimal, generous arc" (feel over fidelity)

### What This Means for Skill Authoring

Build "challenge your own plan" as a default step in the workflow. Before presenting a plan to Jeff:
1. Write the plan
2. Argue against each point — what's over-engineered? What's missing? What's solving the wrong problem?
3. Revise based on the counterarguments
4. Present the *revised* plan with the steelman reasoning visible

Jeff trusts recommendations more when he can see they survived scrutiny.

---

## The "Genre Is Scaffolding" Reframing

This was the single most important conceptual shift in the session. It happened in Message 2:

> "The prototypes aren't about remaking Hades or remaking a souls-like... the genre is scaffolding. The twist is what you're evaluating."

**Implications for every future session:**
- Every task should connect back to "what twist are we evaluating?"
- Don't over-invest in genre scaffolding — it exists to support the twist
- If the scaffolding doesn't feel good enough to evaluate a twist on, that's a valid finding (iterate on scaffolding)
- If the scaffolding is "good enough," stop building scaffolding and start building the twist

---

## Phasing as Decision Management

Jeff arrived at a 3-phase structure that manages complexity:

```
Phase 1: Genre scaffolding (build the minimum shell)
Phase 2: Gameplay twist (moment-to-moment feel innovation)
Phase 3: Generative twist (run-to-run structural innovation)
```

Each phase has a clear question:
- Phase 1: "Does the base loop feel good enough to evaluate twists on?"
- Phase 2: "Does the gameplay twist change how combat feels?"
- Phase 3: "Does the generative twist change how runs feel different from each other?"

**Why this matters for skill authoring:** Jeff doesn't want to answer all questions simultaneously. He sequences them so each decision is made with the right context. Don't jump ahead to Phase 2 questions while building Phase 1.

---

## How Jeff Evaluates Ideas

### The Feasibility Filter
When presented with 7 generative twist candidates, Jeff immediately sorted by "can I test this in a browser game?" Not theoretical elegance or originality — practical testability.

### The "Interesting to Talk About vs. Fun to Play" Test
> "Some of these things are interesting to talk about but I'm not sure they would actually feel more fun when played."

Jeff is wary of ideas that sound clever in conversation but don't translate to moment-to-moment gameplay feel. The test is: if I hard-code this and play it, would I notice a difference?

### The "Two Questions" Framework
For any proposed mechanic:
1. Does it change what the player *does*? (gameplay twist)
2. Does it change what the player *decides*? (generative twist)

If a mechanic only changes flavor/cosmetics without changing actions or decisions, it's not worth prototyping.

---

## Interaction Anti-Patterns to Avoid

### 1. Presenting Choices Without Context
**Anti-pattern:** "Do you want a room system or a level system?"
**Better:** "Here's what each optimizes for [table], here's my recommendation given your prototyping goals, here's when I'd change the recommendation."

### 2. Converging Too Early
**Anti-pattern:** Jeff says "I'm interested in generative surfaces" -> Claude immediately proposes an implementation
**Better:** Explore the design space. What are the categories? What are the reference points? What are the cursed problems? THEN converge.

### 3. Treating Exploration as a Decision Point
**Anti-pattern:** "Which of these 5 twists should we build?" (when Jeff is still exploring)
**Better:** Present the space, help Jeff develop criteria for choosing, wait for his signal that he's ready to decide.

### 4. Losing Ideas
**Anti-pattern:** Jeff mentions "parallel/interleaved runs" in passing -> it never comes up again
**Better:** Capture it in the design doc even if it's not immediately actionable. Jeff's passing ideas often become central later.

### 5. Over-Specifying Before Playtesting
**Anti-pattern:** Detailed spec for every parameter before any code exists
**Better:** Set reasonable defaults, expose everything in the tuning panel, let Jeff's playtesting drive the values.

---

## Durable Artifacts Strategy

Jeff explicitly requested that design thinking be captured in markdown, not lost in chat:

> "I want some of these thoughts saved in more robust format"

**Artifacts produced this session:**

| Document | Purpose | Lives where |
|---|---|---|
| `PROTOTYPE_THESIS.md` | Top-level map across all prototypes | `docs/` on main |
| `DESIGN_EXPLORATION.md` | All design ideas, twist candidates, pairing matrices | `docs/` on main |
| `HANDOFF_TEMPLATE.md` | Template for new prototype branches | `docs/` on main |
| `HANDOFF.md` | Current state of explore/hades | branch root |
| This document | How Jeff works (implementation + exploration) | `docs/` on branch |

**Rule:** Every significant design conversation should produce or update a durable doc. The doc should capture not just the decisions but the reasoning and alternatives considered.

---

## Summary: Two Modes Compared

| Dimension | Design Exploration | Implementation |
|---|---|---|
| **Jeff's mode** | Exploratory, circling, refining | Directive, testing, iterating |
| **Message length** | Long, stream-of-consciousness | Short, bundled feedback |
| **Claude's role** | Thought partner, framework provider | Implementer, diagnostician |
| **Output type** | Documents, frameworks, candidate lists | Code, tests, config values |
| **Quality signal** | "That framing clicks" / "That's interesting" | "That feels good" / "That doesn't work" |
| **Risk** | Losing ideas, converging too early | Breaking gameplay, stale builds |
| **Key skill** | Patience — let Jeff explore | Speed — build, test, iterate |

Both modes are essential. A prototype session often starts in exploration mode and transitions to execution mode. The skill should support both, recognizing the transition signals.

---

*Appended from explore/hades design exploration session, February 2026*

---
---

# Part 3: Scoping Principles for Big Pivots

> Captures a prototyping principle Jeff articulated when working through a large directional change. Appended to document how Jeff thinks about scoping effort during exploratory pivots.

---

## The "Just Goblins" Scoping Principle

During a session involving a significant directional pivot, Jeff articulated a clear scoping rule:

> "In situations where we're making large, huge pivots... it's not necessary to apply that to the entirety of the game... unless I explicitly say so. Like... what we need just nails like hey, how would this feel if it was just goblins?"

### What This Means

When prototyping a big pivot — changing the fundamental feel or direction of a system — **scope the change to a single representative enemy type** (typically goblins, the simplest and most numerous enemy). Do NOT propagate the change across all enemy types, room configs, or game systems unless Jeff explicitly asks for it.

### The Reasoning

1. **Faster feel evaluation.** You can tell whether a direction works by testing it against one enemy type. You don't need all four enemy types behaving differently to answer "does this feel right?"

2. **Avoid wasted work.** Big pivots are exploratory — there's a real chance the direction will change again. Every hour spent propagating changes to skeleton archers, ice mortar imps, and stone golems is wasted if the pivot doesn't stick.

3. **Tighter feedback loop.** Fewer moving parts means less debugging, fewer interactions to reason about, and faster iteration cycles.

### When to Propagate

Only propagate a pivot to other enemy types / systems when:
- Jeff explicitly says "apply this to all enemies" or similar
- Jeff has playtested the scoped version and confirmed the direction feels right
- The scoped prototype has stabilized enough that propagation is mechanical, not exploratory

### How This Connects to Existing Principles

| Existing Principle | Connection |
|---|---|
| **Genre is scaffolding** | Don't over-invest in scaffolding (all enemy types) when you're evaluating a twist (the pivot direction) |
| **Iteration speed** | Scoping to one enemy type is faster to build, test, and throw away |
| **Done is better than perfect** | A goblin-only prototype that answers the design question is more valuable than a fully-propagated system that took 3x longer |
| **Phasing as decision management** | Scoped implementation is like a sub-phase — answer "does this feel right?" before answering "how does this work across the full game?" |
| **Over-specifying before playtesting** (anti-pattern) | Propagating to all enemies before Jeff has even confirmed the direction is a form of over-specifying |

### Implications for Claude

- **Default to scoped.** When implementing a big directional change, target goblins only unless told otherwise.
- **Call it out in the plan.** When presenting a build plan for a pivot, explicitly state: "Scoping this to goblins for initial feel evaluation. Will propagate to other enemy types if the direction holds."
- **Don't silently propagate.** If a change naturally touches all enemy types (e.g., a system-level refactor), flag it: "This will affect all enemies — want me to scope it to goblins instead?"
- **Treat propagation as a separate task.** If Jeff confirms the direction and asks to propagate, that's a new work item with its own plan — not a footnote on the original task.

---

*Appended from explore/hades pivot scoping session, February 2026*
