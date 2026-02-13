---
name: session-handoff
description: >
  Maintains the project's HANDOFF.md as a living context bridge between
  sessions. This skill is NOT user-invoked. Claude should activate it
  automatically in two situations:

  (1) During the session when meaningful progress happens — a design
  decision was made, a feature was built, a bug was found or fixed,
  tuning produced notable results, or priorities shifted. The test:
  would the next session on a different machine need to know this?

  (2) When Jeff signals the session is ending — "wrap up", "I'm done",
  "let's stop here", "handoff", "end of session", "save context",
  "that's it for today", "save where we are", or anything suggesting
  he's finishing work. Do a final HANDOFF.md update before the session
  closes.
---

# Session Handoff

You are maintaining a living handoff document that bridges Jeff's work
sessions across machines and time. The HANDOFF.md at the project root
is the single source of truth for "where are we and what happened."

## Why this matters

Jeff works across 3 machines (2 Windows, 1 Mac). When he starts a new
session, he may be on a different machine, using a different Claude
instance, with zero memory of what happened last time. HANDOFF.md is
the only thing that carries context forward. If it's stale, the next
session starts from scratch. If it's current, he picks up in 30 seconds.

## When to update HANDOFF.md

Don't update after every small change — that would be noisy. Update
when something **meaningful** happens that the next session would need
to know:

- A design decision was made (and why)
- A feature was built or significantly changed
- A bug was found or fixed
- A tuning session produced notable results
- An open question was answered (or a new one emerged)
- The "what to do next" priorities shifted
- Something felt good or bad during playtesting

A good rule of thumb: if Jeff started a new session tomorrow on a
different machine, would this change affect what Claude should know?
If yes, update the handoff.

## How to update

Read the current HANDOFF.md, then update the relevant sections. The
template structure (from docs/HANDOFF_TEMPLATE.md) defines the sections.
The most frequently updated sections are:

- **Current State** — one sentence on what's playable right now
- **What Feels Good** / **What Doesn't Work Yet** — capture specific
  observations, not vague impressions
- **Open Questions** — add new ones, mark resolved ones
- **What To Do Next** — reprioritize based on what happened
- **Session Log** — add a brief entry (date + what was done + key decisions)
- **Key Config Values** — if tuning happened, capture what changed and why

Keep the update surgical — change what's relevant, leave the rest alone.
Don't rewrite sections that haven't changed.

## Session Log format

Add entries to the Session Log section, most recent first:

```
- **YYYY-MM-DD** — [what was done]. Key decisions: [decisions and reasoning].
  Next: [what to pick up].
```

Keep each entry to 2-3 sentences. The goal is scannable context, not a
detailed narrative. If a decision has important reasoning behind it,
capture the reasoning — that's the part that's hardest to reconstruct
in the next session.

## On session start

When a session begins, HANDOFF.md will be injected into your context
automatically via a SessionStart hook. Read it carefully. Pay attention to:

- **What To Do Next** — this is Jeff's stated priority from last session
- **Open Questions** — these may be what he wants to explore
- **What Doesn't Work Yet** — these may be what he wants to fix
- **Session Log** — the most recent entry tells you where things left off

Don't summarize the handoff back to Jeff unless he asks. Just orient
yourself silently and be ready to pick up where things left off. If Jeff
says something like "where were we" or "what's the status", then
reference the handoff.

## On session end

When Jeff signals he's wrapping up (or you notice the conversation is
ending), do a final update to HANDOFF.md. Make sure:

1. Session Log has an entry for today
2. What To Do Next reflects current priorities (not stale ones)
3. Any decisions made during this session are captured
4. Open Questions are current

A SessionEnd hook will automatically commit and push after the session
closes, so just make sure the file is written — the git part is handled.

## Important

- Never delete information from the handoff that might be useful later.
  If something was resolved, move it or mark it as resolved rather than
  deleting it.
- The handoff is for Claude, not for documentation. Write it so a Claude
  instance with zero prior context can get oriented fast.
- If the branch changed during the session, update Branch Info.
- If new files were created, add them to Systems Added.
