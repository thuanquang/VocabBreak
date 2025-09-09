VocabBreak STRUCTURE (for assistant reference)

## Project Architecture Overview

### Extension Type & Manifest
- **Manifest Version**: 3 (MV3) - Service Worker based
- **Extension Name**: VocabBreak - Language Learning Extension
- **Core Function**: Gamified vocabulary learning through strategic web interruptions
- **Target Languages**: English (primary), Vietnamese (interface), extensible

## File Organization & Directory Structure

### Root Level Files
- **manifest.json**: MV3 manifest with permissions, content scripts, CSP configuration
- **background.js**: Service worker for tab tracking, question scheduling, cross-component communication
- **package.json**: Node.js dependencies and build scripts
- **README.md**: Project documentation and setup instructions

### Core Directories

#### `/shared/` - Shared Modules (Loaded by All Contexts)
- **supabase.js**: UMD Supabase library (copied from @supabase/supabase-js)
- **supabase-client.js**: Client wrapper with initialization, timeout handling, error management
- **error-handler.js**: Centralized error handling with context-aware routing
- **state-manager.js**: Application state management with subscription system
- **auth-manager.js**: Authentication flow management and user session handling
- **question-manager.js**: Question selection, filtering, validation, and caching
- **gamification.js**: Points, streaks, levels, achievements, and motivation system
- **offline-manager.js**: IndexedDB operations, offline sync, data persistence
- **site-filter.js**: URL pattern matching, blocking logic, site list management
- **i18n.js**: Internationalization for English/Vietnamese with message loading
- **setup-credentials.js**: Supabase credentials management and injection

#### `/content/` - Content Script Implementation
- **blocker.js**: Main content script for overlay injection and question display
- **blocker.css**: Styling for question overlay and modal interface

#### `/popup/` - Extension Popup Interface
- **popup.html**: Popup HTML structure with authentication and dashboard screens
- **popup-refactored.js**: Popup manager with state management and UI updates
- **popup.css**: Popup styling and responsive design

#### `/options/` - Settings & Configuration Page
- **options.html**: Comprehensive settings interface with tabbed navigation
- **options.js**: Options manager with form handling and settings persistence
- **options.css**: Settings page styling and layout

#### `/assets/` - Extension Assets
- **icon16.png, icon32.png, icon48.png, icon128.png**: Extension icons for different contexts

#### `/locales/` - Internationalization Files
- **en/messages.json**: English translations and interface text
- **vi/messages.json**: Vietnamese translations and interface text

#### `/database/` - Database Schema & Setup
- **schema.sql**: Supabase database schema with JSONB-centric design
- **SETUP_INSTRUCTIONS.md**: Database setup and configuration guide

#### `/scripts/` - Build & Development Tools
- **build.js**: Build script for copying files to dist and injecting credentials
- **copy-supabase.js**: Script for copying Supabase UMD library to dist

#### `/dist/` - Built Extension (Generated)
- Mirror of source structure with processed files ready for distribution

## Script Loading Order & Dependencies

### Content Scripts (manifest.json)
1. **shared/supabase.js** - Supabase library (must load first)
2. **shared/error-handler.js** - Error handling system
3. **shared/state-manager.js** - Application state management
4. **shared/setup-credentials.js** - Credentials initialization
5. **shared/i18n.js** - Internationalization system
6. **shared/supabase-client.js** - Supabase client wrapper
7. **shared/auth-manager.js** - Authentication management
8. **shared/offline-manager.js** - Offline data management
9. **shared/question-manager.js** - Question system
10. **content/blocker.js** - Main content script

### Popup/Options HTML Loading
1. **shared/supabase.js** - Supabase library
2. **shared/error-handler.js** - Error handling
3. **shared/state-manager.js** - State management
4. **shared/setup-credentials.js** - Credentials
5. **shared/supabase-client.js** - Supabase client
6. **shared/auth-manager.js** - Authentication
7. **Application-specific scripts** - Popup/options managers

### Background Script (Service Worker)
- **background.js** - Main service worker
- **Dynamic importScripts** - Loads shared/supabase.js when needed

## Data Flow & Communication

### Background ↔ Content Script Communication
- **Message Types**: GET_QUESTION, SUBMIT_ANSWER, REQUEST_BLOCK_CHECK, GET_TAB_STATE, CLEAR_PENALTY, UPDATE_SETTINGS, GET_STATS, GET_ACHIEVEMENTS
- **Tab State Management**: Individual timers and state per tab
- **Question Scheduling**: 30-minute intervals with persistent alarms
- **Penalty System**: Wrong answer penalties with countdown timers

### Popup ↔ Background Communication
- **Authentication State**: Login/logout status and user data
- **Statistics**: Points, streaks, achievements, level progress
- **Settings Sync**: User preferences and configuration updates
- **Manual Actions**: Sync, settings access, data export

### Content Script ↔ Supabase (When Available)
- **Question Fetching**: Filtered question retrieval based on user settings
- **Answer Validation**: Local validation with database recording
- **Progress Tracking**: Interaction recording and analytics
- **Offline Fallback**: Local question bank when database unavailable

## Database Schema (Supabase)

### Core Tables
- **users**: User profiles with gamification, statistics, preferences (JSONB)
- **questions**: Question content, answers, metadata, scoring (JSONB)
- **user_interactions**: Question answers, achievements, analytics (JSONB)
- **learning_sessions**: Session tracking and progress (JSONB)
- **configurations**: User settings and app configuration (JSONB)
- **achievements**: Achievement definitions and unlock tracking (JSONB)
- **user_achievements**: User-specific achievement unlocks
- **analytics_events**: Event tracking and user behavior (JSONB)
- **feedback**: User feedback and suggestions (JSONB)

### JSONB Design Benefits
- **Flexible Schema**: Easy to add new fields without migrations
- **Nested Data**: Complex objects stored efficiently
- **Query Performance**: Indexed JSONB fields for fast filtering
- **Version Compatibility**: Schema evolution without breaking changes

## Build & Distribution System

### Build Process (scripts/build.js)
1. **Copy Source**: All files copied to dist directory
2. **Credential Injection**: Optional injection from .env file
3. **Supabase Library**: Always attempts to copy UMD library
4. **Asset Processing**: Icons and resources prepared for distribution

### Environment Configuration
- **Development**: Local development with hot reload
- **Production**: Minified and optimized for distribution
- **Credentials**: Environment-specific Supabase configuration
- **Feature Flags**: Development vs production feature toggles

## Security & Permissions

### Manifest Permissions
- **storage**: User settings and progress data
- **activeTab**: Current tab information and scripting
- **tabs**: Tab management and state tracking
- **scripting**: Content script injection
- **background**: Service worker execution
- **unlimitedStorage**: Large question cache and offline data
- **alarms**: Persistent timers across sessions
- **identity**: User authentication (future use)

### Content Security Policy
- **script-src**: 'self' only
- **object-src**: 'self' only
- **connect-src**: 'self' https://*.supabase.co wss://*.supabase.co

### Web Accessible Resources
- **assets/***: Extension icons and images
- **content/question-ui.html**: Question overlay templates
- **shared/***: Shared modules for content script access
- **scripts/***: Build and utility scripts

## Error Handling & Debugging

### Error Management Architecture
- **Centralized Handler**: shared/error-handler.js
- **Context-Aware**: Errors include stage, context, metadata
- **User Feedback**: Graceful error messages and fallbacks
- **Logging**: Comprehensive console logging with categorization

### Debug Tools & Utilities
- **Supabase Debug**: getDebugInfo for client state inspection
- **State Inspection**: Background script stats and tab monitoring
- **Network Status**: Online/offline detection and sync status
- **Performance Metrics**: Response times, cache rates, sync success

### Common Debug Scenarios
- **Supabase Issues**: Library loading, credentials, initialization
- **Content Script Problems**: Loading order, timing, permissions
- **Background Script**: Service worker lifecycle, message handling
- **Offline Scenarios**: Fallback behavior, sync queue, data persistence

## Internationalization Architecture

### Language Support
- **English**: Primary language with full feature support
- **Vietnamese**: Complete translation for Vietnamese users
- **Extensible**: Easy addition of new languages via message files

### Implementation Details
- **Message Loading**: Dynamic loading from locales/{lang}/messages.json
- **Runtime Switching**: Language changes without extension restart
- **Cultural Adaptation**: Number formatting, date formats, cultural references
- **Fallback System**: English fallback for missing translations
- **Question Localization**: Questions display in user's preferred language (en/vi) with proper fallback

## Performance & Optimization

### Caching Strategy
- **Question Cache**: IndexedDB storage for offline question access
- **User Progress**: Local storage with periodic sync
- **Settings Cache**: Chrome storage for fast access
- **Asset Caching**: Extension assets cached by browser

### Memory Management
- **Event Listener Cleanup**: Proper cleanup on component destruction
- **Timer Management**: Clear timers on tab close and extension shutdown
- **State Cleanup**: Unsubscribe from state changes on component destroy
- **Resource Limits**: Efficient data structures and minimal memory footprint

### Network Optimization
- **Batch Operations**: Bulk data operations for sync
- **Lazy Loading**: Modules loaded only when needed
- **Connection Pooling**: Efficient Supabase connection management
- **Offline-First**: Local operations with background sync