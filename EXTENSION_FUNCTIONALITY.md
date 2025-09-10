VocabBreak Extension Functionality Notes (for assistant reference)

## Core Architecture & MV3 Implementation

### Extension Contexts & Script Roles
- **Background (Service Worker)**: background.js - Tab tracking, question scheduling (30-min intervals), cross-component communication, local question bank fallback
- **Content Script**: content/blocker.js - Blocking overlay injection, question UI rendering, answer validation, bypass prevention
- **Popup**: popup/popup.html + popup-refactored.js - User dashboard, stats display, authentication, settings access
- **Options**: options/options.html + options.js - Comprehensive settings management, site filtering, learning preferences

### Script Loading Order & Dependencies
- **Manifest content_scripts**: shared/supabase.js → shared/error-handler.js → shared/state-manager.js → shared/setup-credentials.js → shared/i18n.js → shared/supabase-client.js → shared/auth-manager.js → shared/offline-manager.js → shared/question-manager.js → content/blocker.js
- **Popup/Options HTML**: supabase.js → error-handler/state/setup → supabase-client → auth-manager → others
- **Background**: Uses importScripts for shared/supabase.js when needed (service worker limitation)

## Supabase Integration & Database Operations

### Client Architecture
- **Library**: shared/supabase.js (UMD, copied from @supabase/supabase-js)
- **Client Wrapper**: shared/supabase-client.js
  - Dynamic library loading (window/importScripts)
  - waitForInitialization(timeout) with timeout guards
  - withTimeout for all DB operations
  - assertClient and getDebugInfo for debugging
  - Exposes window.supabaseReadyPromise for consumers

### Credentials & Initialization
- Credentials loaded from chrome.storage or injected build-time constants
- Throws on missing credentials; routed to window.errorHandler with stage metadata
- Dynamic library loading with fallback and error contexts
- Initialization guard: waitForInitialization with timeout; withTimeout around DB operations
- Debug: getDebugInfo, console logs on successful steps; window.supabaseReadyPromise

### Database Schema (JSONB-centric)
- **users**: User profiles with gamification, statistics, preferences
- **questions**: Question content, answers, metadata, scoring
- **user_interactions**: Question answers, achievements, analytics
- **learning_sessions**: Session tracking and progress
- **configurations**: User settings and app configuration
- **achievements**: Achievement definitions and unlock tracking
- **user_achievements**: User-specific achievement unlocks
- **analytics_events**: Event tracking and user behavior
- **feedback**: User feedback and suggestions

### API Methods
- **Auth**: signUp, signIn, signOut, getCurrentUser, isAuthenticated
- **Users**: createUserProfile, getUserProfile, updateUserProfile
- **Questions**: getQuestions, getRandomQuestion, createQuestion (with filtering by level, topics, type, difficulty)
- **Sessions**: startLearningSession, updateLearningSession, endLearningSession
- **Configs**: getConfiguration, setConfiguration, getUserSettings, updateUserSettings
- **Achievements**: getAchievements, getUserAchievements, unlockAchievement
- **Analytics**: trackEvent, getUserStatistics, submitFeedback

## Question Management & Learning System

### Question Types & Formats
- **Multiple Choice**: Options-based questions with single correct answer
- **Text Input**: Free-form text answers with fuzzy matching support
- **Difficulty Levels**: A1, A2, B1, B2, C1, C2 (CEFR standard)
- **Topics**: General, Business, Travel, Food, Technology, Health, Education, Entertainment, Nature, Culture

### Question Selection & Filtering
- **User Settings**: Difficulty levels, question types, topics, interface language
- **Smart Filtering**: Questions filtered by user preferences and performance
- **Fallback System**: Local question bank (10 sample questions) when Supabase unavailable
- **Caching**: Offline manager caches questions for offline use
- **Randomization**: Weighted random selection based on user performance

### Answer Validation
- **Multiple Choice**: Exact match validation
- **Text Input**: Normalized comparison with alternative answers support
- **Fuzzy Matching**: Levenshtein distance-based matching for typos
- **Case Insensitive**: Normalized to lowercase for comparison
- **Whitespace Handling**: Trimmed and normalized spaces

## Blocking System & Site Management

### Blocking Modes
- **Blacklist Mode**: Block all sites except exclusions (default)
- **Whitelist Mode**: Only block sites in target list
- **Default Exclusions**: Browser pages, extensions, localhost, banking sites
- **Emergency Bypass**: Available for banking/financial sites

### Site Filtering Logic
- **Pattern Matching**: Wildcard support (*.reddit.com, facebook.com)
- **URL Validation**: Comprehensive pattern validation
- **Category Suggestions**: Pre-defined site lists for social, news, entertainment, shopping, work
- **Real-time Updates**: Settings changes apply immediately

### Timing & Penalties
- **Question Frequency**: 5-120 minutes (default 30 minutes) ✅ FIXED: Questions appear immediately on first visit
- **Wrong Answer Penalty**: 10-300 seconds (default 30 seconds)
- **Persistent Timers**: Uses chrome.alarms for cross-session persistence
- **Tab State Tracking**: Individual timer per tab with state persistence

## Gamification & User Motivation

### Points System
- **Base Points**: A1=10, A2=15, B1=20, B2=25, C1=30, C2=35
- **Streak Multipliers**: 1-2 correct=1.0x, 3-5=1.2x, 6-10=1.5x, 11+=2.0x
- **Speed Bonus**: 50% bonus for answers under 10 seconds
- **First Attempt Bonus**: 25% bonus for correct answers without retries

### Level System
- **Level Thresholds**: 0, 500, 1500, 3500, 7000, 13000 points
- **Level Names**: Beginner, Elementary, Intermediate, Upper-Intermediate, Advanced, Expert
- **Progress Tracking**: Visual progress bars and points-to-next-level display

### Achievements System
- **Consistency**: First Success, 3-Day Streak, Week Warrior, Monthly Master
- **Mastery**: Perfect Ten, Accuracy Master, Century Club, Millennium Master
- **Speed**: Lightning Fast (10 questions under 5 seconds each)
- **Level**: Rising Star (Level 2), Language Expert (Level 5)
- **Unlock Tracking**: Persistent achievement state with offline sync

## Offline Support & Data Management

### IndexedDB Storage
- **Questions Store**: Cached questions with metadata and filtering
- **User Progress**: Answer history, performance tracking, streaks
- **Settings Store**: User preferences and configuration
- **Sync Queue**: Offline actions queued for online sync
- **Cache Metadata**: Cache timestamps and invalidation

### Offline-First Architecture
- **Local Question Bank**: 10 sample questions always available
- **Progress Tracking**: All interactions stored locally first
- **Sync Queue**: Automatic sync when online
- **Fallback UI**: Graceful degradation when services unavailable

### Data Synchronization
- **Bidirectional Sync**: Local changes sync to Supabase when online
- **Conflict Resolution**: Local data takes precedence for user experience
- **Batch Operations**: Efficient bulk sync operations
- **Error Handling**: Retry logic and offline queue management

## User Interface & Experience

### Popup Interface
- **Authentication**: Login/signup with offline mode option
- **Dashboard**: Stats display, level progress, recent achievements
- **Quick Actions**: Settings access, manual sync, logout
- **Real-time Updates**: Live stats and achievement notifications

### Options Page
- **Account Management**: User info, data export, reset functionality
- **Learning Settings**: Difficulty levels, question types, topics
- **Blocking Configuration**: Site lists, timing settings, blocking modes
- **Gamification**: Achievement display, progress overview, notification settings
- **Language Settings**: Interface language, regional preferences

### Content Script Overlay
- **Question Display**: Clean, modal-style question interface
- **Answer Input**: Multiple choice buttons or text input
- **Feedback System**: Immediate correct/incorrect feedback with explanations
- **Penalty Timer**: Visual countdown for wrong answers
- **Bypass Prevention**: Disabled F12, right-click, keyboard shortcuts

## Error Handling & Debugging

### Error Management
- **Centralized Handler**: shared/error-handler.js for all error routing
- **Context-Aware**: Errors include stage, context, and metadata
- **User Feedback**: Graceful error messages and fallback behaviors
- **Logging**: Comprehensive console logging with error categorization

### Debug Tools
- **Supabase Debug**: getDebugInfo for client state inspection
- **State Inspection**: Background script stats and tab state monitoring
- **Network Status**: Online/offline detection and sync status
- **Performance Metrics**: Response times, cache hit rates, sync success rates

## Internationalization & Localization

### Language Support
- **English**: Primary language with full feature support
- **Vietnamese**: Complete translation for Vietnamese users
- **Extensible**: Easy addition of new languages via message files

### Localization Features
- **Interface Translation**: All UI elements translated
- **Question Content**: Bilingual question text and explanations with user language preference
- **Cultural Adaptation**: Number formatting, date formats, cultural references
- **Dynamic Switching**: Runtime language switching without restart
- **Content Script Localization**: Questions display in user's preferred language (en/vi) with proper fallback

## Build & Distribution

### Build System
- **build.js**: Copies project to dist, injects credentials if .env present
- **copy-supabase.js**: Always attempts to copy UMD supabase.js to dist/shared/supabase.js
- **Credential Injection**: Optional injection into setup-credentials.js and supabase-client.js
- **Environment Handling**: Development vs production configuration

### Manifest Configuration
- **MV3 Compliance**: Service worker, updated permissions, CSP
- **Content Security Policy**: Allows connect to https://*.supabase.co and wss://*.supabase.co
- **Web Accessible Resources**: Assets, shared modules, question UI templates
- **Permissions**: storage, activeTab, tabs, scripting, background, unlimitedStorage, alarms, identity

## Known Risks & Debug Tips

### Common Issues
- **Supabase Undefined**: Confirm dist/shared/supabase.js exists and manifest includes it
- **Credentials Error**: Set via window.setSupabaseCredentials or ensure .env used by build
- **Background Script Issues**: Confirm importScripts path via chrome.runtime.getURL works
- **Content Script Loading**: Verify manifest content_scripts load order and timing
- **Questions Not Appearing**: ✅ FIXED: Tab initialization now triggers immediate questions instead of 30-minute delay
- **Gamification Stats**: ✅ FIXED: Replaced undefined `this.userStats` references with proper `this.cachedStats` usage

### Debug Workflow
- **Use window.supabaseReadyPromise** in popup/options to await readiness before queries
- **Check chrome.storage** for user settings and session data
- **Monitor console logs** for initialization steps and error context
- **Test offline scenarios** to verify fallback behavior
- **Verify site filtering** with different URL patterns and blocking modes

### Performance Considerations
- **Question Caching**: Reduces database queries and improves response time
- **Batch Operations**: Efficient bulk data operations for sync
- **Lazy Loading**: Modules loaded only when needed
- **Memory Management**: Proper cleanup of timers and event listeners