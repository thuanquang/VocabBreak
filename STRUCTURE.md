# VocabBreak Extension - Technical Structure

## Architecture Overview
- **Type**: Manifest V3 Browser Extension (Cross-browser compatible)
- **Backend**: Supabase (Auth + Database + Real-time sync)
- **Offline Storage**: IndexedDB for question caching
- **Languages**: English/Vietnamese UI support
- **Target**: Educational language learning through controlled web interruption

## Core Components

### 1. Manifest V3 Configuration (`manifest.json`)
- Permissions: storage, activeTab, background, scripting, tabs
- Background service worker registration
- Content script injection rules
- Web accessible resources for UI assets

### 2. Background Service Worker (`background.js`)
- Tab lifecycle management and tracking
- Question scheduling (per-tab timers: new site + 30min intervals)
- Timer persistence across browser sessions
- Communication hub between content scripts and popup
- Supabase sync coordination

### 3. Content Scripts (`content/`)
- **blocker.js**: Unbypassable full-page overlay injection
- **question-ui.js**: Question interface rendering and interaction
- **timer-handler.js**: Wrong answer 30-second lockout management
- DOM manipulation for seamless blocking experience

### 4. Popup Interface (`popup/`)
- **popup.html**: Compact login/dashboard view
- **popup.js**: Authentication flow, quick stats display
- **popup.css**: Responsive modern UI styling

### 5. Options Page (`options/`)
- **options.html**: Comprehensive settings configuration
- **options.js**: Site whitelist/blacklist, difficulty settings, timing config
- **options.css**: Detailed configuration interface

### 6. Shared Utilities (`shared/`)
- **supabase-client.js**: Database connection and API wrapper
- **offline-manager.js**: IndexedDB operations for question caching
- **gamification.js**: Points, streaks, achievements, level calculations
- **i18n.js**: English/Vietnamese localization system
- **question-manager.js**: Question selection, difficulty matching
- **site-filter.js**: Whitelist/blacklist logic implementation

### 7. Localization (`locales/`)
- **en/messages.json**: English interface strings
- **vi/messages.json**: Vietnamese interface strings

## Database Schema (Supabase) - Optimized Flexible Design

### Core Tables:
1. **users**: Flexible JSONB-based profile storage
   - id, username, profile (JSONB), metadata (JSONB)
   - profile contains: preferences, learning_config, gamification, statistics
   - Fully extensible without schema changes

2. **questions**: Dynamic content and metadata storage
   - content (JSONB): multilingual text, media, hints, explanations
   - answers (JSONB): multiple correct answers, validation rules
   - metadata (JSONB): level, topics, tags, difficulty, categories
   - scoring (JSONB): configurable point systems and multipliers

3. **user_interactions**: Universal interaction tracking
   - Replaces user_progress with flexible event tracking
   - Records all types of interactions (answers, skips, achievements)
   - context (JSONB): site URL, trigger type, device info
   - metrics (JSONB): time taken, attempts, hints used

4. **configurations**: Flexible key-value configuration system
   - Scope-based (global, user, feature)
   - Category organized (site_rules, gamification, learning)
   - JSONB values for complex configurations

5. **learning_sessions**: Session-based analytics
   - Tracks complete learning sessions
   - Aggregated statistics per session
   - Device and browser metadata

6. **achievements**: Gamification achievement definitions
   - achievement_data (JSONB): multilingual names, requirements, rewards
   - Flexible tier and category system

7. **Additional Support Tables**:
   - question_sets: Group questions into collections
   - analytics_events: Detailed event tracking
   - feedback: User feedback and bug reports

## Key Features Implementation

### Blocking Mechanism:
- Unbypassable overlay (z-index: 2147483647, pointer-events control)
- Disable right-click, F12, keyboard shortcuts via event capture
- Full viewport coverage with backdrop-filter blur
- Question interface modal in center

### Offline Support:
- Download 50-100 questions per user level/topic combination
- IndexedDB storage with expiration timestamps
- Fallback to cached questions when network unavailable
- Sync progress when connection restored

### Gamification:
- Points: Base points × difficulty multiplier × streak bonus
- Streaks: Consecutive correct answers (reset on wrong/skip)
- Achievements: First correct, 10-day streak, level completion, etc.
- Levels: Point thresholds trigger level progression

### Site Management:
- Whitelist mode: Only specified sites get blocked
- Blacklist mode: All sites except specified get blocked
- URL pattern matching for subdomain/path control
- Import/export settings for backup

## Security Considerations
- Content Security Policy compliance
- Secure Supabase RLS policies for user data isolation
- Input sanitization for user-generated content
- Extension permission minimal principle

## Performance Optimizations
- Lazy loading of question content
- Efficient DOM manipulation with minimal reflows
- Background sync batching for reduced API calls
- IndexedDB indexing for fast question retrieval

## Error Handling Strategy
- Network failure graceful degradation
- Supabase timeout handling with retry logic
- Missing permissions user guidance
- Browser compatibility detection and fallbacks


