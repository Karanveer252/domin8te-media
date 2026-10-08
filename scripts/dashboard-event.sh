#!/usr/bin/env bash
# Enqueue one dashboard event as an approved bot. Never run with -x; prints only the response body.
# Needs, from the environment (Karan sets them where the bot runs): DASHBOARD_EVENT_URL
# (https://<ref>.supabase.co/functions/v1/dashboard-event), DASHBOARD_BOT_SECRET, DASHBOARD_BOT_NAME (on the
# function's DASHBOARD_BOT_ALLOWLIST). Usage: scripts/dashboard-event.sh '<json body>'
set -euo pipefail
: "${DASHBOARD_EVENT_URL:?}" "${DASHBOARD_BOT_SECRET:?}" "${DASHBOARD_BOT_NAME:?}"
curl -fsS -X POST "$DASHBOARD_EVENT_URL" -H "content-type: application/json" \
  -H "x-dashboard-bot-secret: $DASHBOARD_BOT_SECRET" -H "x-dashboard-bot-name: $DASHBOARD_BOT_NAME" -d "$1"
