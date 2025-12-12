# VocabBreak Database Tables - Achievement Flow

## Overview
The achievement system involves multiple interconnected tables in the Supabase PostgreSQL database. Here are all the tables involved in the achievement flow.

---

## Tables Involved in Achievement Flow

### 1. **users** (Primary Table)
Stores user profiles and all gamification data embedded within.

```sql
CREATE TABLE IF NOT EXISTS public.users (
  id uuid NOT NULL,
  username text UNIQUE,
  profile jsonb NOT NULL DEFAULT jsonb_build_object(
    'display_name', '', 
    'avatar_url', '', 
    'bio', '', 
    'preferences', jsonb_build_object(
      'interface_language', 'en', 
      'question_language', 'en', 
      'theme', 'light', 
      'notifications_enabled', true, 
      'sound_enabled', true
    ), 
    'learning_config', jsonb_build_object(
      'difficulty_levels', ARRAY['A1'::text], 
      'topics', ARRAY[]::text[], 
      'question_types', ARRAY['multiple-choice'::text], 
      'daily_goal', 10, 
      'session_length', 30
    ), 
    'gamification', jsonb_build_object(
      'total_points', 0, 
      'current_level', 1, 
      'current_streak', 0, 
      'longest_streak', 0, 
      'achievements', ARRAY[]::jsonb[],     ← ACHIEVEMENT DATA HERE
      'badges', ARRAY[]::jsonb[], 
      'experience_points', 0
    ), 
    'statistics', jsonb_build_object(
      'total_questions_answered', 0, 
      'total_correct_answers', 0, 
      'average_response_time', 0, 
      'favorite_topics', ARRAY[]::text[], 
      'weak_areas', ARRAY[]::jsonb[]
    )
  ),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_active_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  is_premium boolean DEFAULT false,
  subscription_tier text DEFAULT 'free'::text,
  schema_version integer DEFAULT 1,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
```

#### Key Fields for Achievements:
- **id**: UUID - User identifier (from auth.users)
- **profile.gamification**: JSONB object containing:
  - `total_points`: Integer - Total XP earned
  - `current_level`: Integer - Current level (1-6)
  - `current_streak`: Integer - Days of consecutive correct answers
  - `longest_streak`: Integer - Personal best streak
  - `achievements`: Array of JSONB - **Array of unlocked achievements**
  - `experience_points`: Integer - Same as total_points
- **profile.statistics**: JSONB object for checking achievement conditions:
  - `total_questions_answered`: Integer
  - `total_correct_answers`: Integer
  - `average_response_time`: Number - For speed achievements
- **updated_at**: Timestamp - When stats were last updated

#### Achievement Array Structure in JSONB:
```json
{
  "achievements": [
    {
      "id": "first_correct",
      "name": "First Success",
      "description": "Answer your first question correctly",
      "icon": "🎯",
      "points": 50,
      "unlocked_at": "2025-01-15T10:30:00Z"
    },
    {
      "id": "century_club",
      "name": "Century Club",
      "description": "Answer 100 questions correctly",
      "icon": "💪",
      "points": 500,
      "unlocked_at": "2025-02-20T14:45:00Z"
    }
  ]
}
```

---

### 2. **user_achievements** (Mapping Table)
Maps users to achievements they've unlocked. Used for tracking and querying.

```sql
CREATE TABLE IF NOT EXISTS public.user_achievements (
  user_id uuid NOT NULL,
  achievement_id uuid NOT NULL,
  unlocked_at timestamp with time zone DEFAULT now(),
  progress jsonb DEFAULT '{}'::jsonb,
  notified boolean DEFAULT false,
  CONSTRAINT user_achievements_pkey PRIMARY KEY (user_id, achievement_id),
  CONSTRAINT user_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievements(id),
  CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
```

#### Key Fields:
- **user_id**: UUID - References users.id
- **achievement_id**: UUID - References achievements.id
- **unlocked_at**: Timestamp - When the achievement was unlocked
- **progress**: JSONB - Additional progress data (reserved for future use)
- **notified**: Boolean - Whether user was notified about unlock
- **Primary Key**: (user_id, achievement_id) - Ensures one unlock per user per achievement

#### When This Table Is Used:
- ⚠️ **Currently NOT actively used** - The extension primarily uses the achievements array in `users.profile.gamification`
- Could be used for: Advanced queries, leaderboards, bulk exports, analytics

---

### 3. **achievements** (Master Table)
Master list of all available achievements in the system.

```sql
CREATE TABLE IF NOT EXISTS public.achievements (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  achievement_data jsonb NOT NULL DEFAULT jsonb_build_object(
    'name', jsonb_build_object('en', '', 'vi', ''),
    'description', jsonb_build_object('en', '', 'vi', ''),
    'icon', '',
    'category', '',
    'tier', 'bronze',
    'points_value', 0,
    'requirements', jsonb_build_object(),
    'rewards', jsonb_build_object()
  ),
  metadata jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  is_hidden boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT achievements_pkey PRIMARY KEY (id)
);
```

#### Key Fields:
- **id**: UUID - Achievement identifier
- **achievement_data**: JSONB - Contains all achievement metadata:
  - `name`: Bilingual names (en, vi)
  - `description`: Bilingual descriptions (en, vi)
  - `icon`: Emoji icon
  - `category`: Achievement type
  - `tier`: bronze/silver/gold/platinum
  - `points_value`: Points awarded
  - `requirements`: Conditions to unlock
  - `rewards`: Bonus rewards
- **is_active**: Boolean - Whether achievement is available
- **is_hidden**: Boolean - Whether to show in UI
- **created_at/updated_at**: Timestamps

#### Current Status:
- ⚠️ **Currently hardcoded in code** - Achievements are defined in `shared/gamification.js`, not loaded from database
- Could be migrated to use this table for: Dynamic achievement management, admin panel, A/B testing

---

## Supporting Tables (Used Indirectly)

### 4. **learning_sessions**
Tracks each learning session with achievement-related data.

```sql
CREATE TABLE IF NOT EXISTS public.learning_sessions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  session_data jsonb NOT NULL DEFAULT jsonb_build_object(
    'questions_answered', 0,
    'correct_answers', 0,
    'points_earned', 0,
    'streak_count', 0,
    'topics_covered', ARRAY[]::text[],
    'levels_covered', ARRAY[]::text[],
    'achievements_unlocked', ARRAY[]::uuid[]         ← Achievement IDs
  ),
  metadata jsonb DEFAULT jsonb_build_object(
    'device_type', '',
    'browser', '',
    'ip_address', '',
    'location', jsonb_build_object()
  ),
  started_at timestamp with time zone DEFAULT now(),
  ended_at timestamp with time zone,
  duration_seconds integer,
  is_active boolean DEFAULT true,
  CONSTRAINT learning_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT learning_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
```

#### Purpose:
- Logs each learning session
- `session_data.achievements_unlocked` - Array of achievement IDs unlocked in this session
- Used for analytics and historical tracking

---

### 5. **user_interactions**
Records detailed interaction with questions and results.

```sql
CREATE TABLE IF NOT EXISTS public.user_interactions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  interaction_type text NOT NULL,
  target_type text,
  target_id uuid,
  session_id uuid,
  context jsonb DEFAULT jsonb_build_object(
    'site_url', '',
    'trigger_type', '',
    'device_info', jsonb_build_object(),
    'browser_info', jsonb_build_object()
  ),
  interaction_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb DEFAULT jsonb_build_object(
    'time_taken', 0,
    'attempts', 1,
    'hints_used', 0,
    'confidence_level', 0
  ),
  created_at timestamp with time zone DEFAULT now(),
  synced_at timestamp with time zone,
  schema_version integer DEFAULT 1,
  CONSTRAINT user_interactions_pkey PRIMARY KEY (id),
  CONSTRAINT user_interactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
```

#### Purpose:
- Each question answer creates a record here
- `metrics.time_taken` - Used for speed achievement checking
- `result` - Contains points earned, correctness, etc.
- Used for analytics and performance tracking

---

### 6. **questions**
Question database - provides questions that generate achievements.

```sql
CREATE TABLE IF NOT EXISTS public.questions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  content jsonb NOT NULL DEFAULT jsonb_build_object(
    'text', jsonb_build_object(),
    'media', jsonb_build_object(
      'images', ARRAY[]::text[],
      'audio', ARRAY[]::text[],
      'video', ARRAY[]::text[]
    ),
    'context', '',
    'instructions', jsonb_build_object(),
    'hints', ARRAY[]::jsonb[],
    'explanation', jsonb_build_object()
  ),
  answers jsonb NOT NULL,
  metadata jsonb NOT NULL DEFAULT jsonb_build_object(
    'level', 'A1',
    'topics', ARRAY[]::text[],
    'tags', ARRAY[]::text[],
    'type', 'multiple-choice',
    'difficulty', 5,
    'estimated_time', 30
  ),
  scoring jsonb NOT NULL DEFAULT jsonb_build_object(
    'base_points', 10,
    'time_bonus_enabled', true,
    'time_bonus_threshold', 10,
    'time_bonus_multiplier', 1.5,
    'difficulty_multiplier', 1.0,
    'streak_multiplier', 1.2,
    'perfect_bonus', 5
  ),
  statistics jsonb DEFAULT jsonb_build_object(
    'times_answered', 0,
    'times_correct', 0,
    'average_time', 0
  ),
  relations jsonb DEFAULT jsonb_build_object(
    'prerequisites', ARRAY[]::uuid[],
    'related_questions', ARRAY[]::uuid[],
    'next_questions', ARRAY[]::uuid[]
  ),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  is_active boolean DEFAULT true,
  is_public boolean DEFAULT true,
  version integer DEFAULT 1,
  schema_version integer DEFAULT 1,
  CONSTRAINT questions_pkey PRIMARY KEY (id),
  CONSTRAINT questions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
```

#### Purpose:
- `metadata.level` - Used to determine points for level-based achievements
- `scoring` - Points calculation for achievements
- Each question answered contributes to achievement progress

---

## Data Flow Through Tables

### When User Answers a Question:

```
Question Answered
       ↓
user_interactions TABLE
  ├─ Record interaction
  ├─ Store time_taken (for speed achievements)
  └─ Store result data
       ↓
users TABLE - Profile.Gamification (PRIMARY UPDATE)
  ├─ total_points += points_earned
  ├─ current_streak = correct ? streak + 1 : 0
  ├─ longest_streak = max(longest_streak, current_streak)
  ├─ total_questions_answered++
  ├─ total_correct_answers++ (if correct)
  └─ achievements = [..., new achievement] (if unlocked)
       ↓
user_achievements TABLE (OPTIONAL - could sync here)
  └─ INSERT (user_id, achievement_id, now()) if new unlock
       ↓
learning_sessions TABLE
  └─ Update session_data with achievements_unlocked array
```

---

## Summary Table

| Table | Purpose | Used In Achievement Flow | Status |
|-------|---------|--------------------------|--------|
| **users** | User profile + gamification stats | ✅ PRIMARY | Active |
| **user_achievements** | Achievement unlock mapping | ⚠️ OPTIONAL | Exists but not used |
| **achievements** | Master achievement list | ❌ NOT USED | Hardcoded instead |
| **learning_sessions** | Session tracking + unlocks | ✅ LOGGING | Active |
| **user_interactions** | Question interaction records | ✅ LOGGING | Active |
| **questions** | Question database | ✅ INDIRECT | Active |

---

## Key Insights

### ✅ What's Working Well:
1. **Embedded JSONB in users table** - Fast, atomic updates, no joins needed
2. **Denormalized achievements array** - Quick reads, all data in one place
3. **Immutable unlock timestamps** - Can always trace when achievements were earned

### ⚠️ What Could Be Improved:
1. **user_achievements table underutilized** - Exists but not synced in real-time
2. **achievements table not used** - All achievements hardcoded in JavaScript
3. **No achievement history** - Can only see current state, not unlock progression
4. **No atomic transactions** - Multiple operations aren't wrapped in transactions

### 🚀 Future Optimizations:
1. Sync unlocks to `user_achievements` table for easier querying
2. Load achievement definitions from `achievements` table
3. Add `achievement_progress` table for tracking partial progress
4. Implement transaction batching for multi-step updates
5. Add triggers for automatic notification updates

---

## Quick Reference: Achievement Data Location

```
To get all achievements for a user:
├─ Primary:   SELECT profile->>'gamification'->>'achievements' FROM users WHERE id = $1
├─ Backup:    SELECT * FROM user_achievements WHERE user_id = $1
└─ Config:    SELECT * FROM achievements WHERE is_active = true

To check if user has achievement:
├─ Current:   profile->>'gamification'->>'achievements' @> '[{"id":"first_correct"}]'
└─ Alternative: EXISTS (SELECT 1 FROM user_achievements WHERE user_id = $1 AND achievement_id = $2)

To update achievements:
├─ Current:   UPDATE users SET profile = jsonb_set(...) WHERE id = $1
└─ Better:    BEGIN; UPDATE users...; INSERT INTO user_achievements...; COMMIT;
```

---

## Dual-Write Implementation (v1.0.1+)

The system now implements **dual-write** for achievements:

### How It Works

1. **Primary Write (JSONB)**: Achievements saved to `users.profile.gamification.achievements` array
2. **Secondary Write (Table)**: Achievements also written to `user_achievements` table

### Automatic Behavior

When an achievement is unlocked:
```
Achievement Unlocked
       ↓
┌─────────────────────────────┐
│ 1. Update JSONB (Primary)   │  ← Fast, used by extension
│    users.profile...         │
└─────────────────────────────┘
       ↓
┌─────────────────────────────┐
│ 2. Ensure Achievement       │  ← Seeds achievements table if needed
│    in achievements table    │
└─────────────────────────────┘
       ↓
┌─────────────────────────────┐
│ 3. Insert user_achievements │  ← For analytics/querying
│    (user_id, achievement_id)│
└─────────────────────────────┘
```

### Console Commands

```javascript
// Seed all achievements to the achievements table (run once)
await window.gamificationManager.seedAchievementsTable();

// Sync existing unlocked achievements to user_achievements table
await window.gamificationManager.syncAchievementsToTable();

// Check an achievement's UUID
window.gamificationManager.achievements['first_correct'].uuid;
```

### UUID Mapping

Each achievement has a deterministic UUID generated from its string ID:

| String ID | Generated UUID |
|-----------|----------------|
| first_correct | (deterministic based on ID) |
| streak_3 | (deterministic based on ID) |
| ... | ... |

This allows the `user_achievements` table to maintain foreign key integrity with the `achievements` table.

### Analytics Queries (Now Possible)

```sql
-- Count users per achievement
SELECT 
  a.achievement_data->>'name'->'en' as achievement_name,
  COUNT(ua.user_id) as unlock_count
FROM achievements a
LEFT JOIN user_achievements ua ON a.id = ua.achievement_id
GROUP BY a.id
ORDER BY unlock_count DESC;

-- Get recent achievement unlocks
SELECT 
  u.username,
  a.achievement_data->>'name'->'en' as achievement,
  ua.unlocked_at
FROM user_achievements ua
JOIN users u ON ua.user_id = u.id
JOIN achievements a ON ua.achievement_id = a.id
ORDER BY ua.unlocked_at DESC
LIMIT 10;

-- Find users who haven't unlocked a specific achievement
SELECT u.id, u.username
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_achievements ua 
  WHERE ua.user_id = u.id 
  AND ua.achievement_id = '<achievement-uuid>'
);
```


