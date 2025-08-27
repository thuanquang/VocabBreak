VocabBreak Extension Functionality Notes (for assistant reference)

- Contexts
  - Background (service worker): background.js; Supabase library can be loaded via importScripts by supabase-client when needed
  - Content script: blocker injection; relies on shared modules, now includes shared/supabase.js via manifest before supabase-client
  - Popup: popup.html loads shared/supabase.js and shared/supabase-client.js early
  - Options: options.html loads shared/supabase.js early

- Supabase Client Behavior
  - Credentials loaded from chrome.storage or injected build-time constants
  - Throws on missing credentials; routed to window.errorHandler with stage metadata
  - Dynamic library loading with fallback and error contexts
  - Initialization guard: waitForInitialization with timeout; withTimeout around DB operations
  - Debug: getDebugInfo, console logs on successful steps; window.supabaseReadyPromise

- Error Handling Integration
  - All initialization and DB errors go to errorHandler.handleDatabaseError/handleNetworkError with stage/context
  - User-visible feedback possible via stateManager/notifications

- Build/Distribution
  - build.js: copies project to dist, injects creds if .env present
  - Always attempts to copy UMD supabase.js to dist/shared/supabase.js

- CSP/Manifest
  - content_security_policy allows connect to https://*.supabase.co and wss://*.supabase.co
  - content_scripts load order ensures library before client

- Known Risks / Debug Tips
  - If window.supabase undefined: confirm dist/shared/supabase.js exists and manifest includes it
  - If credentials error: set via window.setSupabaseCredentials or ensure .env used by build
  - In background: confirm importScripts path via chrome.runtime.getURL('shared/supabase.js') works
  - Use window.supabaseReadyPromise in popup/options to await readiness before queries

