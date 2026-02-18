# Example Session Context Entries

These show what good working-context captures look like. Each one came
from a real session and changed how Claude collaborates with Jeff.

---

## Example: Calibration Moment

### Metaphors Carry Interaction Design Intent

**What happened:** Jeff asked for force push to behave "like a wave."
Claude proposed distance-based force falloff (nearer = more force,
farther = less). Jeff corrected: "The metaphor of it being a wave is
more meant to communicate the idea that the force is only applied to
the first set of targets and it's absorbed by them."

**What Claude assumed:** Wave = mathematical attenuation (gradient).
**What Jeff meant:** Wave = physical propagation with occlusion (hits
the first thing and stops).

**The pattern:** When Jeff describes a mechanic using a metaphor, he's
communicating the *player experience*, not the *math*. Ask: "What does
the player see happen?" before proposing an implementation.

---

## Example: Framework Crystallization

### Genre Is Scaffolding, The Twist Is What Matters

**What happened:** During design exploration, Jeff reframed the entire
prototyping approach: "The prototypes aren't about remaking Hades or
remaking a souls-like... the genre is scaffolding. The twist is what
you're evaluating."

**How it applies:** Every prototyping decision should connect back to
"what twist are we evaluating?" If time is being spent polishing genre
scaffolding beyond what's needed to evaluate the twist, redirect.

**Connected principles:** "Don't over-engineer" and "phasing as
decision management" both reinforce this — Phase 1 builds minimum
scaffolding, Phase 2 implements the twist, Phase 3 adds the generative
surface. Don't jump phases.

---

## Example: Working Pattern Observation

### Two Modes: Exploration vs. Execution

**The pattern:** Jeff operates in two distinct modes during a session.

*Exploration mode:* Long voice-dictated messages, topic shifts,
hypothetical examples, "what if" framing, references to other games as
inspiration. Jeff is circling ideas, not making decisions.

*Execution mode:* Short messages, bundled feedback (3-5 items), direct
and directive ("let's add X", "do Y"), problems described as feel
observations ("it doesn't feel punchy").

**Transition signals:** Messages get shorter. Hedging ("I think",
"maybe") disappears. Specific choices stated as facts. Explicit "let's
go" or "let's start."

**What Claude should do:**
- In exploration: match Jeff's energy, explore broadly, offer frameworks,
  push back, capture ideas in docs. Do NOT converge prematurely or jump
  to implementation.
- At transition: confirm scope, present a build plan, one last chance
  for exploration, then switch to execution mode with todo lists.
- In execution: move fast, build-test-iterate, track all bundled items,
  run builds before saying "try it."
