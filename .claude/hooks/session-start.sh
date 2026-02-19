#!/usr/bin/env bash
#
# session-start.sh — Runs automatically when a Claude Code session begins.
# Pulls latest code and outputs HANDOFF.md so Claude has full context.
#
# stdout from this script is injected into Claude's context.

# Pull latest (quiet, non-blocking — don't fail the session if offline)
git pull --rebase --quiet 2>/dev/null

# Output the handoff doc so Claude gets project context
if [ -f "HANDOFF.md" ]; then
    echo "=== PROJECT HANDOFF (auto-loaded) ==="
    cat HANDOFF.md
    echo ""
    echo "=== END HANDOFF ==="
    echo ""
    echo "Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')"
    echo "Last commit: $(git log --oneline -1 2>/dev/null || echo 'unknown')"
fi
