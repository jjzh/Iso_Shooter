---
name: working-context
description: >
  Captures how Jeff thinks and works — not what he decided, but how he
  decides. This skill is NOT user-invoked. Claude should activate it
  automatically when any of these happen during a session:

  (1) Jeff corrects a misinterpretation — "no, that's not what I meant",
  "the metaphor is more like...", "I meant X not Y", "that's not the
  right direction", or any time Claude's assumption about Jeff's intent
  was wrong.

  (2) Jeff articulates a reusable principle — "the way I think about it
  is...", "my rule of thumb is...", "the principle here is...", "I think
  the pattern is...", or statements like "genre is scaffolding" that
  reframe how to approach future decisions.

  (3) Claude observes a working pattern — Jeff switches between
  exploration and execution modes, gives bundled feedback, describes
  problems in feel-terms, or shows any recurring collaboration behavior
  worth documenting for future sessions.

  Outputs to .claude/session-notes/ (private, gitignored). Universal
  patterns get synthesized into ~/.claude/CLAUDE.md at session end and
  during periodic reviews.
---

# Working Context

You are building a translation layer between Jeff's mind and future Claude
sessions. The goal: a future Claude instance that reads these documents
should collaborate with Jeff as well as one that has worked with him for
hours.

This is NOT a learning journal, decision log, or knowledge base. It
captures **how Jeff thinks**, so Claude can calibrate faster.

## Privacy architecture

Cognitive modeling has three layers with different visibility:

| Layer | Location | Visibility | What goes here |
|-------|----------|------------|----------------|
| Session notes | `.claude/session-notes/` | Private (gitignored) | Raw observations from each session |
| Global CLAUDE.md | `~/.claude/CLAUDE.md` | Private (home dir) | Universal patterns that apply across all projects |
| Project CLAUDE.md | `CLAUDE.md` (repo root) | Public (committed) | Project-specific conventions only |

**The rule:** "How Jeff thinks" stays private. "How to work on this project"
can be public. When in doubt, write to session notes first and let the
synthesis step decide where it graduates to.

## What this produces

Timestamped entries in `.claude/session-notes/`. Each entry captures a
specific observation — a calibration moment, a framework crystallization,
or a working pattern. These accumulate privately and get synthesized into
`~/.claude/CLAUDE.md` periodically.

Create the `.claude/session-notes/` directory if it doesn't exist.

### Naming

Files in `.claude/session-notes/` use the format:
`YYYY-MM-DD-[domain].md`

Examples:
- `2026-02-27-workflow.md` — observations from a workflow session
- `2026-02-27-physics.md` — observations from a physics prototyping session

If a file for today's date and domain already exists, append to it.

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
session notes. Don't interrupt the flow of work to do this — note it
mentally and write it when there's a natural pause, or at the end of
the session.

### Entry format

Each entry should be concise. Use this structure:

```markdown
### [Signal type]: [Brief title]
**Date:** YYYY-MM-DD
**Context:** [What was happening when this came up]
**Observation:** [What Claude noticed or Jeff said]
**Pattern:** [The underlying principle, not just this instance]
**Implication:** [How future Claude sessions should behave differently]
```

The test for a good entry: would a future Claude instance, reading this
for the first time, change how it collaborates with Jeff? If yes, it
belongs. If it's just interesting trivia, skip it.

### What NOT to capture

- Technical decisions → Those go in HANDOFF.md (session-handoff skill)
- Implementation details → Those go in code comments or docs
- Things Jeff already knows about himself → This is for Claude's
  calibration, not Jeff's self-reflection
- Generic best practices → "Listen to user feedback" is useless. "Jeff
  describes problems in terms of feel, not code — translate observations
  like 'it doesn't feel punchy' into parameter hypotheses" is useful.

## Synthesis

Synthesis is how raw session notes become durable, cross-project
understanding. There are two triggers:

### Session-end synthesis (every session)

When Jeff signals the session is ending, before wrapping up:

1. Review any entries added to `.claude/session-notes/` this session
2. For each entry, ask: is this **project-specific** or **Jeff-universal**?
3. Project-specific patterns stay in session notes (they may inform project
   CLAUDE.md updates later)
4. Jeff-universal patterns get **proposed** as additions to `~/.claude/CLAUDE.md`
   - Present the proposed addition to Jeff
   - Only add it if Jeff confirms it feels right
   - Frame it as: "I noticed [pattern]. Does this feel like something that
     applies across all your projects?"

### Periodic deep synthesis (cadence-triggered)

The session-start hook checks a timestamp. If it's been 3+ days since
the last synthesis, it outputs a reminder in Claude's context.

When triggered:

1. Read all files in `.claude/session-notes/`
2. Look for patterns that appear across multiple sessions or domains
3. Cross-reference against `~/.claude/CLAUDE.md` — what's already captured?
4. Propose batch updates to `~/.claude/CLAUDE.md` for patterns that have
   been confirmed across multiple observations
5. Propose trimming session notes that have been fully synthesized
6. Update `.claude/last-synthesis` with the current date

The periodic synthesis is deeper than session-end — it looks for
**convergent patterns** across sessions rather than individual observations.

### What graduates to global CLAUDE.md

A pattern should graduate from session notes to `~/.claude/CLAUDE.md` when:
- It has appeared in 2+ sessions (not a one-off)
- It applies across projects (not specific to Iso_Shooter physics)
- Jeff recognizes it as real when you propose it
- It would change how Claude collaborates (not just trivia)

Examples of patterns that should graduate:
- "Jeff's metaphors carry interaction design intent, not math intent"
- "Present trade-offs with concrete implications, not just A-or-B"
- "Feel-first feedback: translate observations into parameter hypotheses"

Examples that should NOT graduate (project-specific):
- "Physics should be first-class in the Hades prototype"
- "Don't over-invest in genre scaffolding" (specific to the prototype thesis)

## Relationship to other skills

- **session-handoff** tracks WHERE Jeff is (state, decisions, next steps)
- **working-context** tracks HOW Jeff thinks (patterns, frameworks,
  calibrations)

They're complementary. session-handoff changes every session.
working-context accumulates over time and changes slowly.

## The vision

Over time, `~/.claude/CLAUDE.md` becomes a progressively sharper model
of how Jeff thinks — private, cross-project, and always improving. A new
Claude session on any project should feel like resuming a collaboration
with someone who already knows Jeff, not meeting a stranger who needs
everything explained.

The accumulation is private. The benefits are visible everywhere.
