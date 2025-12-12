# Remote Code and Data Security Disclosure for Google Chrome Web Store

## Statement on Remote Code Execution

**VocabBreak does NOT execute any remote code.**

The extension is fully self-contained and operates entirely using:
- Local JavaScript bundled with the extension
- Built-in Chrome extension APIs
- Server-side database queries (NOT code execution)

### Remote Data Sources

VocabBreak connects to **Supabase**, a third-party backend service, for:

1. **User Authentication** - Google OAuth via Supabase
2. **Data Synchronization** - Reading and writing user profile data and learning progress
3. **Question Bank** - Reading vocabulary questions (static data only, not executable code)

All remote data (questions, user profiles, progress stats) are:
- ✅ Static text/JSON data only
- ✅ Never evaluated or executed as code
- ✅ Safely rendered using `textContent` (not `innerHTML`) for user-generated content
- ✅ Stored in a structured database with input validation and Row Level Security

---

## Data Handling Security

### 1. User-Generated Content
**Site URLs** entered by users in blocking settings are:
- Stored locally in `chrome.storage.sync`
- Used only for URL matching/pattern comparison
- Never executed or evaluated

### 2. Database Content
**Question text and options** from Supabase are:
- Static strings/text only
- Rendered safely using `textContent` property
- Never passed to `eval()`, `Function()`, or dynamic `innerHTML` in critical contexts

### 3. Remote API Responses
**All API responses** from Supabase are:
- Validated against expected schema
- Treated as data, not code
- Processed through type-safe data structures

---

## Code Analysis

### No Dangerous APIs Used
```javascript
// ❌ NOT USED in VocabBreak
eval()           // Forbidden - never used
Function()       // Forbidden - never used
setTimeout("code") // Forbidden - never used
innerHTML + user data // Avoided for untrusted data
```

### Safe Data Rendering
```javascript
// ✅ USED for displaying question text and user data
element.textContent = userText;  // Safe - no HTML interpretation
element.textContent = dbText;    // Safe - escapes HTML
```

### HTML Rendering
```javascript
// Only innerHTML used for INTERNAL static templates:
overlay.innerHTML = `<div class="modal">...</div>`; // No user data
content.innerHTML = `<button>${staticMessage}</button>`; // staticMessage from i18n only
```

---

## Third-Party Data Sources

### Supabase Backend
- **URL**: `https://nyxtigtweenrnsmaaoic.supabase.co`
- **Data Types**: User accounts, learning progress, vocabulary questions
- **Security**: PostgreSQL database with Row Level Security policies
- **Validation**: Server-side input validation and constraint enforcement

### Google OAuth
- **Provider**: Google authentication service
- **Data Shared**: Email address, basic profile info for account creation
- **Security**: Industry-standard OAuth 2.0 protocol

---

## No Content Distribution Networks (CDNs)

VocabBreak does NOT load:
- JavaScript from external CDNs
- CSS stylesheets from external sources
- Fonts or assets from external domains
- Analytics or tracking code from third parties

All static assets are bundled with the extension.

---

## Summary for Google Compliance

| Criteria | Status | Details |
|----------|--------|---------|
| Remote Code Execution | ✅ NO | No eval, Function, or dynamic code execution |
| Static Data Only | ✅ YES | Database provides text/JSON data only |
| Safe Data Rendering | ✅ YES | Uses `textContent` for untrusted data |
| No External Scripts | ✅ YES | All code bundled locally |
| No Remote Execution | ✅ YES | Backend does authentication and data storage only |
| Input Validation | ✅ YES | Server-side validation + client-side escaping |
| HTTPS Communication | ✅ YES | All connections encrypted (CSP enforced) |

---

## Permissions Justification

All host permissions (`<all_urls>` + `supabase.co`) are used for legitimate purposes:
- **`<all_urls>`** → Inject question overlay on any user-configured website
- **`supabase.co`** → Backend authentication and data sync

No data from other websites is collected or sent to the backend.


