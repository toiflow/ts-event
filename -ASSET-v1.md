<instructions>

ASSET LOG
INSTRUCTION FOR AI MODEL:

ALWAYS ADD NEW ASSET ENTRIES AT THE TOP, DIRECTLY BELOW THIS HEADER.

NEVER DELETE OR EDIT PREVIOUS ASSET ENTRIES.

REQUIRED FORMAT FOR EACH ASSET ENTRY:

## ASSET:{NAME OF ENVIRONMENT} {YYYY-MM-DD HH:MM} → {CONTENT}

</instructions>

####### <!-- ANCHOR MARKER - ADD NEW ENTRIES BELOW -->

## ASSET:ts-event 2026-06-06 → pipeline fully operational — all 4 jobs passing

First end-to-end run confirmed. Google Calendar API → Ollama → GitHub commit + must-event email all passing.

| Job | Status | Detail |
|---|---|---|
| `fetch` | ✅ | Calendar API read tomorrow's events from `would` + `could` calendars |
| `issue` | ✅ | Ollama analysis via `must-update-content.yml` |
| `asset` | ✅ | Ollama analysis via `must-update-content.yml` |
| `update` | ✅ | Committed to `would/` files + sent `must-event` email |

**Fix required before first success:** Google Calendar API was not enabled in GCP project `202052754278` — enabled via GCP Console → APIs & Services.

## ASSET:ts-event 2026-06-06 → pipeline initialised — Google Calendar API + GitHub Actions

Migrated from Mac-bound AppleScript + Mail.app to GitHub Actions + Google Calendar API.

| Component | Detail |
|---|---|
| `would-read-md.js` | Google Calendar API v3 — tomorrow's events from `would` + `could` calendars |
| `would-update-content.js` | Commits to `would/` files + sends `must-event` email with .md attachment |
| `would-update-csv.js` | Appends daily asset analysis to `would/-log-asset-v1.csv` |
| Workflow | 4-job: `fetch` → `issue` + `asset` (reusable Ollama) → `update` |
| Schedule | cron `0 6 * * *` — 6pm NZST daily |
| OAuth scope | `https://www.googleapis.com/auth/calendar` — same refresh token as ts-inbox |
| Email | `must-event` subject, `must-event-YYYY-MM-DD.md` attachment to `jayreck996@gmail.com` |
| Org secrets | Inherits `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `OLLAMA_SECRET`, `OLLAMA_URL` |
