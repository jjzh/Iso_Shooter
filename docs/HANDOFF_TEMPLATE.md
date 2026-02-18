# [Prototype Name] Handoff

> Copy this template to `HANDOFF.md` at the root of each `explore/` branch.
> Fill it in as you work. This is the context bridge between sessions and machines.

---

## The Twist
What's the specific idea, mechanic, or generative element that makes this prototype worth building? This is the thing you're actually evaluating — not the genre itself.

> *Example: "What if encounter intensity is driven by the energy curve of a player-imported song rather than hand-sequenced difficulty?"*

## Design Hypothesis
A falsifiable version of the twist. Write it so you can playtest and say "confirmed," "rejected," or "it's more nuanced than I thought."

> *Example: "Rhythm that emerges from combat (reactive) feels better than rhythm that constrains combat (prescriptive)."*

**Status:** [ untested | partially tested | confirmed | rejected | pivoted ]

## Genre Scaffolding
The genre exists to give the twist enough surrounding game to be evaluable. What's the minimum viable genre shell you need?
- [Mechanic 1] — why the twist needs it (e.g., "rooms/encounters — because pacing requires something to pace")
- [Mechanic 2] — why the twist needs it

## Vertical Slice Target
How long does someone need to play to evaluate the twist? What does a "good session" look like?
- **Duration:** [30 seconds | 1 minute | 3-5 minutes] — [why this length]
- **What you'd experience:** [describe the play arc, e.g., "enter 3-4 rooms with escalating enemy density, feel the pacing ramp, make one build choice"]

## Reference Games
- [Game 1] — what specific aspect we're borrowing (e.g., "Hades — encounter pacing, dash-cancel combat")
- [Game 2] — secondary reference if applicable

## Generative Surface
Where could player-contributed context enter this prototype? What would it change about how the game plays?

- **Input:** What does the player bring? (e.g., a song, a photo, a story prompt, a behavior pattern)
- **Transformation:** How does the game process it? (e.g., stem extraction, image recognition, LLM interpretation)
- **Impact:** What changes in gameplay? (e.g., level structure, enemy behavior, puzzle solutions)
- **Bar to clear:** Why is this better than a hand-authored version? What moments can this create that a designer couldn't pre-build?

> Write "None identified yet" if this prototype doesn't have one. Having this section forces the question.

## Cross-Pollination Notes
Observations about how this prototype connects to *other* prototypes. Update as you notice things.
- [Observation] — e.g., "The tension/release pacing from stealth could inform encounter sequencing in the Hades branch"
- [Observation] — e.g., "The stamina system from souls could create interesting rhythm constraints in the rhythm battler"

---

## Branch Info
- **Branch:** `explore/[name]`
- **Forked from:** `main` at commit `[hash]`
- **Last updated:** [date]

## Current State
One sentence: what can you do right now if you build and play this branch?

## Systems Added
List every new file or major modification, one per line:
- `src/path/file.ts` — one-line description of what it does

## Systems Modified (from main)
- `src/path/file.ts` — what changed and why

## What Feels Good
Capture specific moments or interactions that feel right:
- [Observation about what works, be specific — "dashing through a cluster of goblins feels responsive because..."]

## What Doesn't Work Yet
- [Problem or missing piece]
- [Thing that felt wrong and why]

## Key Config Values
Parameters that were tuned to get the current feel. Include enough context to understand why:
- `PLAYER.speed`: [value] — [why this works for this prototype]
- `ABILITIES.dash.duration`: [value] — [observation about how it affects feel]

## Open Questions
Design questions still unresolved:
- [Question about a mechanic or system]
- [Decision that needs playtesting to answer]

## Merge Candidates
Systems worth bringing back to `main` because they're general-purpose:
- `src/path/system.ts` — [why it's useful beyond this prototype]

## What To Do Next
Prioritized list of what to work on in the next session. Written so someone (or Claude Code) can pick up without additional context:
1. [Task] — [why it matters, any relevant context]
2. [Task] — [why it matters, any relevant context]

## Session Log
Brief notes from each work session (most recent first):
- **[date]** — [what was done, key decisions, what to pick up next]
