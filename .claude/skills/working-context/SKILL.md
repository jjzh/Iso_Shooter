---
name: working-context
description: >
  Captures how Jeff thinks and works — not what he decided, but how he
  decides. Activates when Claude notices calibration moments (Jeff corrects
  a misinterpretation), framework crystallizations (Jeff articulates a
  reusable principle), or working pattern observations (meta-observations
  about collaboration style). Maintains living session context documents
  in docs/ that serve as a translation layer for future Claude sessions.
user-invocable: false
---

# Working Context

You are building a translation layer between Jeff's mind and future Claude
sessions. The goal: a future Claude instance that reads these documents
should collaborate with Jeff as well as one that has worked with him for
hours.

This is NOT a learning journal, decision log, or knowledge base. It
captures **how Jeff thinks**, so Claude can calibrate faster.

## What this produces

Living documents in the project's `docs/` directory, following the
pattern established by `SESSION_CONTEXT_PHYSICS.md`. Each document is
anchored to a specific project context (a prototype branch, a design
phase, a technical domain) because Jeff's thinking patterns are best
understood through the concrete situations that revealed them.

## The three signals

Watch for these during normal work. When you notice one, capture it.

### 1. Calibration moments

Jeff corrects Claude's interpretation of something. This means Claude's
model of Jeff was wrong, and the correction prevents the same mistake in
future sessions.

**Examples from past sessions:**
- "The metaphor of it being a wave is more meant to communicate the idea
  that the force is only applied to the first set of targets" → Claude
  had defaulted to engineering-obvious (distance falloff) instead of
  game-design-correct (occlusion). The lesson: Jeff's metaphors carry
  interaction design intent, not math intent.
- "If we want physics to be a first-class system, using teleport to
  simulate some of the effects cheaply actually isn't necessarily the
  correct direction" → Jeff caught Claude fixing symptoms instead of
  systems. The lesson: Jeff prefers removing complexity over adding
  workaround complexity.

**What to capture:**
- What Claude assumed vs. what Jeff meant
- The underlying pattern (not just the specific instance)
- How to avoid the same misinterpretation next time

### 2. Framework crystallizations

Jeff articulates a principle or evaluation heuristic that will shape
multiple future decisions. These are the thinking tools he reaches for
when reasoning about design.

**Examples from past sessions:**
- "The genre is scaffolding. The twist is what you're evaluating."
  → Reframes every prototyping decision: don't over-invest in scaffolding,
  it exists to support the twist evaluation.
- "Does it change what the player *does*? Does it change what the player
  *decides*?" → Two-question evaluation for any proposed mechanic.
- "If two systems create similar outcomes, one should be trimmed."
  → Ability budget thinking — each verb needs a distinct purpose.

**What to capture:**
- The principle in Jeff's own words
- The situation that produced it (so it's grounded, not abstract)
- How it connects to other principles (Jeff's frameworks reinforce each
  other — "genre is scaffolding" connects to "don't over-engineer")

### 3. Working pattern observations

Things Claude notices about how Jeff operates that would help future
sessions go more smoothly. Jeff may not articulate these explicitly —
Claude infers them from behavior.

**Examples from past sessions:**
- Two working modes: exploration (long messages, metaphors, "what if")
  vs. execution (short messages, directive, "let's go")
- Transition signals: messages get shorter, hedging disappears, specific
  choices stated as facts
- Bundled feedback: 3-5 observations per message, all need tracking
- Feel-first feedback: "it doesn't feel punchy" means adjust friction/
  velocity/screenshake, not that something is broken

**What to capture:**
- The pattern and how to recognize it
- What Claude should do when it sees the pattern
- What Claude should NOT do (anti-patterns are as valuable as patterns)

## How to capture

When you notice a signal during a session, add a brief entry to the
project's session context doc. Don't interrupt the flow of work to do
this — note it mentally and write it when there's a natural pause, or
at the end of the session.

### Finding the right document

Look in `docs/` for an existing `SESSION_CONTEXT_*.md` file that matches
the current working context. If one exists, append to it. If the current
work is different enough to warrant a new document (new prototype branch,
new domain of collaboration), create one.

Naming: `SESSION_CONTEXT_[DOMAIN].md` where DOMAIN describes the working
context. Examples:
- `SESSION_CONTEXT_PHYSICS.md` — physics-first combat prototyping
- `SESSION_CONTEXT_WORKFLOW.md` — AI workflow and tooling setup
- `SESSION_CONTEXT_DESIGN.md` — open-ended design exploration

### Entry format

Don't force a rigid structure. The existing SESSION_CONTEXT_PHYSICS.md
has sections like "How Jeff Communicates", "Decision-Making Patterns",
"What Went Well / Poorly", "Key Principles for Future Sessions". Use
whatever sections make sense for what you're capturing.

The test for a good entry: would a future Claude instance, reading this
for the first time, change how it collaborates with Jeff? If yes, it
belongs. If it's just interesting trivia, skip it.

### What NOT to capture

- Technical decisions → Those go in HANDOFF.md (the session-handoff skill
  handles this)
- Implementation details → Those go in code comments or docs
- Things Jeff already knows about himself → He doesn't need a learning
  journal. This is for Claude's calibration, not Jeff's self-reflection.
- Generic best practices → "Listen to user feedback" is useless. "Jeff
  describes problems in terms of feel, not code — translate observations
  like 'it doesn't feel punchy' into parameter hypotheses" is useful.

## The synthesis step

Periodically (every few sessions, or when a session context doc gets
long), review the accumulated entries and look for patterns that
transcend the specific project context.

Patterns that are project-specific stay in the session context doc.
Example: "Physics should be first-class" is specific to the Hades
prototype — it might not apply to every future project.

Patterns that are Jeff-universal get proposed as additions to his
personal CLAUDE.md. Example: "Jeff's metaphors carry interaction design
intent, not math intent" applies everywhere. But DON'T just add them —
propose them to Jeff first. He should recognize the pattern as real
before it becomes part of his permanent config.

## Relationship to other skills

- **session-handoff** tracks WHERE Jeff is (state, decisions, next steps)
- **working-context** tracks HOW Jeff thinks (patterns, frameworks,
  calibrations)

They're complementary. session-handoff changes every session.
working-context accumulates over time and changes slowly.

## The vision

Over time, these documents become a progressively sharper model of how
Jeff thinks. A new Claude session that reads CLAUDE.md + HANDOFF.md +
SESSION_CONTEXT docs should feel like resuming a collaboration with
someone who already knows Jeff, not meeting a stranger who needs
everything explained.

The goal isn't comprehensive documentation. It's **surface area** — giving
Claude enough of Jeff's mental models to reason alongside him rather than
just following instructions.
