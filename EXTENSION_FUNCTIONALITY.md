# VocabBreak - Complete Extension Functionality Documentation

## Project Overview
**VocabBreak** is an educational browser extension that gamifies English vocabulary learning by strategically blocking web access until users correctly answer language questions. The extension combines controlled interruption with comprehensive gamification to create engaging, persistent learning habits.

## Core User Experience Flow

### 1. Initial Setup
- User installs extension → redirected to options page
- Creates Supabase account or logs in with existing credentials
- Configures initial settings: difficulty level (A1-C2), topics, blocking mode
- Downloads initial question cache for offline use
- Sets up site whitelist/blacklist preferences

### 2. Active Learning Cycle
- User browses normally until trigger event (new site OR 30-minute timer)
- Full-page blocking overlay appears with blur backdrop
- Question presented based on user's configured difficulty/topics
- **Correct Answer**: Immediate access granted + points/streak update
- **Wrong Answer**: 30-second lockout timer + educational feedback
- Progress automatically syncs to Supabase for cross-device consistency

### 3. Gamification Engagement
- Real-time points accumulation with difficulty-based multipliers
- Streak counters with exponential bonus rewards
- Achievement unlocks for milestones (first correct, 7-day streak, etc.)
- Level progression system with visual progress indicators
- Daily/weekly challenge notifications via popup interface

## Detailed Feature Specifications

### Question System
**Types Supported:**
- Multiple Choice: 4 options, 1 correct answer
- Text Input: Free-form typing with fuzzy matching
- Voice Input: [Placeholder] Speech recognition with pronunciation scoring

**Difficulty Levels (CEFR):**
- A1: Basic vocabulary (colors, numbers, family)
- A2: Elementary (daily activities, simple descriptions)
- B1: Intermediate (opinions, experiences, plans)
- B2: Upper-intermediate (abstract topics, detailed explanations)
- C1: Advanced (complex texts, nuanced meanings)
- C2: Proficiency (sophisticated vocabulary, subtle distinctions)

**Topic Categories:**
- Business & Work, Travel & Transportation, Food & Cooking
- Technology & Internet, Health & Fitness, Education & Learning
- Entertainment & Media, Nature & Environment, Culture & Society

### Blocking Mechanism Technical Details
**Unbypassable Implementation:**
- CSS: z-index: 2147483647, position: fixed, top: 0, left: 0
- JavaScript event capture: keydown, contextmenu, beforeunload prevention
- DevTools detection: debugger statement timing checks
- Tab focus management: prevents switching away during questions

**Visual Design:**
- Backdrop blur filter for professional appearance
- Smooth fade-in animations (300ms duration)
- Question modal: centered, responsive, accessible (ARIA labels)
- Progress indicators: circular progress for timers, linear for streaks

### Site Management System
**Whitelist Mode**: Only specified sites trigger questions
- Use case: Focused learning on specific websites (news, social media)
- Configuration: URL patterns with wildcard support (*.reddit.com)

**Blacklist Mode**: All sites except specified trigger questions
- Use case: Protect work/banking sites from interruption
- Default exclusions: localhost, file://, chrome://, extension pages

**Pattern Matching:**
- Exact URLs: https://example.com/specific-page
- Domain wildcards: *.example.com (includes subdomains)
- Path patterns: example.com/blog/* (all blog posts)
- Protocol flexibility: http/https automatic matching

### Offline Functionality
**Question Caching Strategy:**
- Download 100 questions per user's active difficulty levels
- Balanced distribution across selected topics (equal representation)
- Cache expiration: 7 days, auto-refresh when online
- Storage limit: 5MB IndexedDB quota management

**Sync Behavior:**
- Online: Real-time progress sync after each answer
- Offline: Queue progress locally, batch sync on reconnection
- Conflict resolution: Server timestamp wins for settings conflicts
- Cache invalidation: Smart updates when user changes preferences

### Gamification Mechanics
**Points System:**
- Base points per question: A1=10, A2=15, B1=20, B2=25, C1=30, C2=35
- Streak multiplier: 1x (1-2 correct), 1.2x (3-5), 1.5x (6-10), 2x (11+)
- Speed bonus: +50% if answered within 10 seconds
- First attempt bonus: +25% for correct answers without retries

**Achievement Categories:**
- **Consistency**: 3-day streak, 7-day streak, 30-day streak
- **Mastery**: 100% accuracy in 10 questions, complete topic mastery
- **Volume**: 100 questions answered, 1000 questions answered
- **Speed**: 10 questions under 5 seconds each
- **Exploration**: Try all difficulty levels, complete all topics

**Level Progression:**
- Level 1: 0-499 points (Beginner)
- Level 2: 500-1499 points (Elementary)
- Level 3: 1500-3499 points (Intermediate)
- Level 4: 3500-6999 points (Upper-Intermediate)
- Level 5: 7000-12999 points (Advanced)
- Level 6: 13000+ points (Expert)

### User Interface Components

**Popup Interface (320x480px):**
- Header: User avatar, current level badge, total points
- Quick stats: Today's streak, questions answered, accuracy rate
- Action buttons: Settings, View Progress, Sync Now
- Login/logout functionality with Supabase auth state

**Options Page (Full-screen):**
- **Account Tab**: Profile management, sync status, data export
- **Learning Tab**: Difficulty selection, topic preferences, question types
- **Blocking Tab**: Site management, timing configuration, bypass rules
- **Gamification Tab**: Achievement gallery, progress charts, streak history
- **Language Tab**: Interface language (EN/VI), question language settings

**Question Overlay (Full-screen modal):**
- Question text: Large, readable typography (16px minimum)
- Answer options: Clear buttons/input fields with hover states
- Progress indicator: Current streak, points for this question
- Timer display: Countdown for wrong answer lockouts
- Encouraging messages: Positive reinforcement for correct answers

### Internationalization (i18n)
**Supported Languages:**
- English (en): Default interface language
- Vietnamese (vi): Full translation for Vietnamese users

**Translatable Elements:**
- All UI text: buttons, labels, error messages, notifications
- Question instructions: "Choose the correct answer", "Type your answer"
- Gamification messages: "Streak bonus!", "Level up!", achievement names
- Error handling: Network errors, authentication failures, permission issues

**Implementation:**
- JSON message files: locales/en/messages.json, locales/vi/messages.json
- Runtime language switching without extension reload
- Browser locale detection for automatic language selection
- Fallback to English for missing translations

### Error Handling & Edge Cases

**Network Issues:**
- Supabase connection timeout: Graceful fallback to cached data
- Slow internet: Loading spinners with timeout warnings
- Complete offline: Clear messaging about offline mode limitations

**Browser Compatibility:**
- Manifest V3 feature detection for older browsers
- Graceful degradation for unsupported APIs
- Clear error messages for incompatible browsers

**User Experience Edge Cases:**
- Extension disabled mid-question: Resume state on re-enable
- Browser crash during lockout: Timer persistence via storage
- Multiple extension instances: Singleton pattern enforcement
- System sleep/hibernate: Timer adjustment for actual elapsed time

## Technical Implementation Details

### Data Models - Flexible JSONB Architecture
```javascript
// User Profile (Stored in JSONB - Infinitely Extensible)
{
  display_name: string,
  avatar_url: string,
  preferences: {
    interface_language: 'en' | 'vi' | string, // Easily add more languages
    question_language: 'en' | 'vi' | string,
    theme: 'light' | 'dark' | 'auto',
    notifications_enabled: boolean,
    sound_enabled: boolean,
    // Add any preference without schema change
  },
  learning_config: {
    difficulty_levels: ['A1', 'A2', ...], // Dynamic array
    topics: string[], // Unlimited topics
    question_types: string[], // Any question type
    daily_goal: number,
    session_length: number,
    // Extend with AI preferences, learning paths, etc.
  },
  gamification: {
    total_points: number,
    current_level: number,
    current_streak: number,
    longest_streak: number,
    achievements: Array<{id, unlocked_at, progress}>,
    badges: Array<{type, tier, earned_at}>,
    experience_points: number,
    // Add leagues, tournaments, social features
  },
  statistics: {
    total_questions_answered: number,
    total_correct_answers: number,
    average_response_time: number,
    favorite_topics: string[],
    weak_areas: Array<{topic, accuracy, suggestions}>,
    // Track any metric without database changes
  }
}

// Question Object (Flexible Content & Metadata)
{
  id: UUID,
  content: {
    text: { [lang: string]: string }, // Unlimited languages
    media: {
      images: string[],
      audio: string[],
      video: string[]
    },
    context: string,
    instructions: { [lang: string]: string },
    hints: Array<{ [lang: string]: string }>,
    explanation: { [lang: string]: string }
  },
  answers: {
    correct: string[], // Multiple correct answers
    options: Array<{id, text, media}>,
    alternatives: string[], // Accept variations
    validation_rules: {
      case_sensitive: boolean,
      fuzzy_match: boolean,
      fuzzy_threshold: number,
      regex_pattern: string,
      // Add custom validators
    }
  },
  metadata: {
    level: string, // Not limited to A1-C2
    topics: string[], // Multiple topics
    tags: string[], // Flexible tagging
    type: string, // Any question type
    difficulty: number, // 1-10 or any scale
    categories: string[],
    skills: string[], // 'vocabulary', 'grammar', etc.
    // Add AI metadata, prerequisites, etc.
  },
  scoring: {
    base_points: number,
    time_bonus_enabled: boolean,
    multipliers: { [key: string]: number },
    // Completely customizable scoring
  }
}

// Universal Interaction Tracking
{
  id: UUID,
  user_id: UUID,
  interaction_type: string, // Any interaction type
  target_type: string, // 'question', 'achievement', 'feature', etc.
  target_id: UUID,
  session_id: UUID,
  context: {
    site_url: string,
    trigger_type: string,
    device_info: object,
    browser_info: object,
    // Track any contextual data
  },
  interaction_data: object, // Any interaction-specific data
  result: object, // Flexible result storage
  metrics: {
    time_taken: number,
    attempts: number,
    hints_used: number,
    // Any measurable metric
  },
  created_at: timestamp
}
```

### Extension Architecture
- **Background Script**: Single service worker managing all tabs
- **Content Scripts**: Injected per-tab for blocking and UI
- **Popup**: Persistent authentication and quick stats
- **Options**: Comprehensive configuration management
- **Shared Libraries**: Common functionality across all components

This extension represents a comprehensive educational tool that seamlessly integrates learning into daily web browsing habits while maintaining user control and providing engaging gamification elements.


