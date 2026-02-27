#!/usr/bin/env bash
#
# session-end.sh — Runs automatically when a Claude Code session ends.
# Commits and pushes session context files so the next session on any
# machine has the latest context.
#
# Files tracked:
#   - HANDOFF.md (where you are — updated by session-handoff skill)
#   - CLAUDE.md (project conventions — updated occasionally)
#
# Working-context session notes (.claude/session-notes/) are private and
# gitignored. They don't get committed here — they stay local and get
# synthesized into ~/.claude/CLAUDE.md over time.

CHANGED=false

# Check HANDOFF.md
if ! git diff --quiet HANDOFF.md 2>/dev/null || ! git diff --cached --quiet HANDOFF.md 2>/dev/null; then
    git add HANDOFF.md
    CHANGED=true
fi

# Check CLAUDE.md (project-level)
if ! git diff --quiet CLAUDE.md 2>/dev/null || ! git diff --cached --quiet CLAUDE.md 2>/dev/null; then
    git add CLAUDE.md
    CHANGED=true
fi

# Only commit if something changed
if [ "$CHANGED" = true ]; then
    git commit -m "Auto-update session context ($(date +%Y-%m-%d))" --no-verify 2>/dev/null
    git push --quiet 2>/dev/null
fi

exit 0
