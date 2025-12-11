# VocabBreak Manual Test Checklist (Temporary)

## Setup
- Ensure `.env` has `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
- In Supabase: Google provider enabled; redirect URI `https://<extension-id>.chromiumapp.org/supabase-auth`; Site URL/Redirect URLs set to the same (remove localhost fallback or change to unused port if needed).
- `npm run build` and reload the unpacked `dist/` in Chrome.

## Auth (Google)
- Click “Continue with Google”; complete flow.
- Confirm popup shows dashboard (not login).
- Reload popup: stays authenticated.

## Blocking Flow
- In Options, set interval (e.g., 1–2 min) and penalty (e.g., 10–20s); save.
- On a normal site, wait for interval → question overlay appears.
- Wrong answer → all tabs blocked with countdown; unblock automatically after penalty.
- Correct answer → overlay clears; next interval schedules.
- Use popup “Trigger Test Block” button → overlay appears immediately on active tab.

## Data Writes
- In Supabase, verify `blocking_events` and `user_interactions` receive rows (penalty/question).

## UI/Theme
- Overlay/popup/options use neutral + single-accent theme; only Google button shown.
- Keyboard navigation works in overlay; countdown visible during penalty.

## Error Check
- Console: no “stateManager.getAuthState is not a function”; no IndexedDB/offline warnings; avoid multiple GoTrue clients (ensure only one extension copy loaded).

