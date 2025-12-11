# VocabBreak – Current State Context

Last updated: (prior to new refactor proposal)

## Core Behavior (today)
- Chrome MV3 extension that periodically blocks browsing and shows an English vocab quiz; user must answer correctly or remain blocked for a penalty duration.
- Contexts: background (timers, tab state), content blocker overlay (UI, question flow), popup (dashboard/auth/settings), options (configuration).
- Current logic supports blacklist/whitelist site filtering, 5–120 minute intervals (default 30), wrong-answer penalties (default 30s), and gamification (points, levels, streaks, achievements).

## Implemented Architecture Snapshot (from EXTENSION_FUNCTIONALITY.md)
- Simplified load chain: error-handler → question-bank → core-manager → supabase → setup-credentials → i18n → supabase-client → auth-manager → question-manager → gamification → blocker/content apps; popup/options load same chain.
- CoreManager centralizes state, caching (IndexedDB + chrome.storage + memory), and question pipeline; question-bank is single source of questions; background imports question-bank for local fallback.
- Supabase client wrapper with waitForInitialization, withTimeout, and supabaseReadyPromise guards; credentials injected via build or chrome.storage.
- Question system: multiple-choice + text input with fuzzy matching; CEFR levels A1–C2; topics (general, business, travel, etc.); fallback local 10-question bank.
- Blocking: chrome.alarms timers, per-tab state, refresh-safe; wrong-answer penalties; bypass prevention in overlay.
- Gamification: points by level, streak multipliers, speed/first-try bonuses; achievements and level thresholds.
- UI surfaces: popup dashboard/auth/settings; options for settings/block lists; overlay for questions; i18n en/vi.
- Build: scripts/build.js and copy-supabase.js; manifest MV3 with Supabase CSP; web_accessible_resources include shared modules.

## Known Issues / In-Flight Changes
- From previous audit: missing/incorrect manifest entries (e.g., site-filter.js), question-ui.html reference absent, background referencing QuestionManager, chrome.alarms decimals, Supabase copy failure tolerance, IndexedDB fallback gaps, credential race handling, popup/options missing site-filter, no .env sample.
- Active OpenSpec changes:
  - `fix-extension-blockers`: reliability/manifest/timer/IndexedDB/error-handling/build hard-fail on missing Supabase, site-filter everywhere.
  - `update-auth-providers`: add Supabase OAuth providers and UI (Google/GitHub/etc.), provider config, session handling.

## Data/Schema Baseline (current doc)
- Tables noted: users, questions, user_interactions, learning_sessions, configurations, achievements, user_achievements, analytics_events, feedback (JSONB-centric; Supabase).

## Current Constraints & Tooling State
- openspec CLI currently fails in WSL because `node` is not available (`exec: node: not found`); needs Node install to run validations.

## New Direction (per latest request)
- Replace/prune existing setup as needed (freedom to redesign).
- Visual style: “Duolingo-level friendly” but **not** using Duolingo colors; modern, non-overly-colorful.
- Target: Chrome-only (no Edge/Firefox).
- Auth: Supabase Google OAuth only (email/password and other providers optional to drop).
- Performance: fine unless “too bad”; offline fallback not required going forward.
- Schema: ok to revise; treat as greenfield with hints from legacy.


