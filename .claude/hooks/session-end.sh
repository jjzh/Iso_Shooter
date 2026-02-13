#!/usr/bin/env bash
#
# session-end.sh — Runs automatically when a Claude Code session ends.
# Commits and pushes any changes to HANDOFF.md so the next session
# on any machine has the latest context.
#
# This runs regardless of how the session ends (close window, logout, etc.)

# Only proceed if HANDOFF.md has changes
if git diff --quiet HANDOFF.md 2>/dev/null && git diff --cached --quiet HANDOFF.md 2>/dev/null; then
    exit 0
fi

# Commit and push the handoff doc
git add HANDOFF.md
git commit -m "Auto-update session handoff ($(date +%Y-%m-%d))" --no-verify 2>/dev/null
git push --quiet 2>/dev/null

exit 0
