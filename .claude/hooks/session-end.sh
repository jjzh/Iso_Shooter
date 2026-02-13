#!/usr/bin/env bash
#
# session-end.sh — Runs automatically when a Claude Code session ends.
# Commits and pushes session context files so the next session on any
# machine has the latest context.
#
# Files tracked:
#   - HANDOFF.md (where you are — updated by session-handoff skill)
#   - docs/SESSION_CONTEXT_*.md (how you think — updated by working-context skill)
#
# This runs regardless of how the session ends (close window, logout, etc.)

CHANGED=false

# Check HANDOFF.md
if ! git diff --quiet HANDOFF.md 2>/dev/null || ! git diff --cached --quiet HANDOFF.md 2>/dev/null; then
    git add HANDOFF.md
    CHANGED=true
fi

# Check session context docs
for f in docs/SESSION_CONTEXT_*.md; do
    [ -f "$f" ] || continue
    if ! git diff --quiet "$f" 2>/dev/null || ! git diff --cached --quiet "$f" 2>/dev/null; then
        git add "$f"
        CHANGED=true
    fi
    # Also pick up new (untracked) session context files
    if git ls-files --error-unmatch "$f" 2>/dev/null 1>/dev/null; then
        : # already tracked
    else
        git add "$f"
        CHANGED=true
    fi
done

# Only commit if something changed
if [ "$CHANGED" = true ]; then
    git commit -m "Auto-update session context ($(date +%Y-%m-%d))" --no-verify 2>/dev/null
    git push --quiet 2>/dev/null
fi

exit 0
