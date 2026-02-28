#!/usr/bin/env bash
#
# session-start.sh — Runs automatically when a Claude Code session begins.
# Pulls latest code, outputs HANDOFF.md, and checks synthesis cadence.
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

# --- Periodic synthesis cadence check ---
# Check if it's been 3+ days since the last cognitive synthesis.
# If so, remind Claude to do a deep review of accumulated session notes.

SYNTHESIS_FILE=".claude/last-synthesis"
CADENCE_DAYS=3

if [ -f "$SYNTHESIS_FILE" ]; then
    LAST_SYNTHESIS=$(cat "$SYNTHESIS_FILE" 2>/dev/null)
    if [ -n "$LAST_SYNTHESIS" ]; then
        # Calculate days since last synthesis
        LAST_EPOCH=$(date -j -f "%Y-%m-%d" "$LAST_SYNTHESIS" "+%s" 2>/dev/null || date -d "$LAST_SYNTHESIS" "+%s" 2>/dev/null)
        NOW_EPOCH=$(date "+%s")
        if [ -n "$LAST_EPOCH" ] && [ -n "$NOW_EPOCH" ]; then
            DAYS_SINCE=$(( (NOW_EPOCH - LAST_EPOCH) / 86400 ))
            if [ "$DAYS_SINCE" -ge "$CADENCE_DAYS" ]; then
                echo ""
                echo "=== SYNTHESIS REMINDER ==="
                echo "It's been $DAYS_SINCE days since the last cognitive synthesis (last: $LAST_SYNTHESIS)."
                echo "When there's a natural pause, review .claude/session-notes/ for accumulated"
                echo "patterns and propose updates to ~/.claude/CLAUDE.md. See the working-context"
                echo "skill for the synthesis process."
                echo "=== END REMINDER ==="
            fi
        fi
    fi
else
    # No synthesis has ever been done — check if there are session notes
    if [ -d ".claude/session-notes" ] && [ "$(ls -A .claude/session-notes 2>/dev/null)" ]; then
        echo ""
        echo "=== SYNTHESIS REMINDER ==="
        echo "Session notes exist in .claude/session-notes/ but no synthesis has been done yet."
        echo "When there's a natural pause, review accumulated notes and propose updates to"
        echo "~/.claude/CLAUDE.md. See the working-context skill for the synthesis process."
        echo "=== END REMINDER ==="
    fi
fi
