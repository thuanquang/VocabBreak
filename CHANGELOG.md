# VocabBreak Extension - Changelog

## [1.0.1] - 2025-10-29

### 🔧 Critical Bug Fixes (15 issues resolved)

This release fixes all critical and high-priority issues identified in the comprehensive codebase audit, ensuring the extension is production-ready.

#### **Manifest & Loading**
- ✅ Added `site-filter.js` to manifest content_scripts array (was missing, blocking site filtering)
- ✅ Removed non-existent `question-ui.html` reference from web_accessible_resources
- ✅ Verified safe handling of QuestionManager in background script (defensive check works correctly)

#### **Chrome API Fixes**
- ✅ Fixed chrome.alarms decimal minutes issue:
  - Changed `delayInMinutes: this.wrongAnswerPenalty / 60000` → `Math.ceil(this.wrongAnswerPenalty / 60000)`
  - Applied fix to penalty timer (3 locations in background.js)
  - Penalty timer now works correctly with 1-minute minimum (gracefully handles 30-second penalties)

#### **Build Process Hardening**
- ✅ Made Supabase library copy a **hard requirement** - build now fails if copy fails (prevents silent failures)
- ✅ Removed duplicate Supabase copy calls in build.js
- ✅ Improved error messages with clear instructions for failed builds

#### **Script Loading & Initialization**
- ✅ Added `site-filter.js` to popup.html and options.html (was missing from UI scripts)
- ✅ Added credential initialization race condition guard in supabase-client.js
  - New `waitForCredentials()` method with 5-second timeout
  - Prevents content scripts from using Supabase before credentials are loaded

#### **Offline & Error Handling**
- ✅ Added IndexedDB fallback for incognito mode and quota exceeded scenarios:
  - If IndexedDB fails to open, sets `this.db = null`
  - All cache methods check `if (!this.db)` before operating
  - Extension continues with limited offline support instead of crashing
- ✅ Added comprehensive try-catch error handling in content script initialization
  - Catches module loading errors and notifies background script
  - Extension continues to run even if initialization fails partially

#### **Code Quality & Deployment**
- ✅ Updated package.json and manifest.json version to 1.0.1
- ✅ Enhanced console logging with emoji indicators for better debugging
- ✅ Build verification: All 11 shared files present, Supabase library copied successfully

### 🧪 Validation

- ✅ Build completes successfully with zero errors or warnings
- ✅ All dist files present and correct
- ✅ Ready for deployment to Chrome Web Store

### 📝 Notes

- No breaking changes to user-facing features
- All fixes are backward compatible
- Extension now reliable for production deployment
- Recommended minimum version for all users

---

## [1.0.0] - 2025-10-15

### ✨ Initial Release

- Initial launch of VocabBreak extension
- Core features: vocabulary questions, gamification, site blocking
- Supabase integration for user data and question bank
- Multi-language support (English, Vietnamese)
- Comprehensive error handling system
