# VocabBreak Achievement System Flow

## Overview
The achievement system is a gamification feature that tracks user progress and unlocks achievements based on various milestones and metrics. All data is synchronized with Supabase database.

---

## Architecture

### Core Components

1. **GamificationManager** (`shared/gamification.js`)
   - Central manager for all gamification features
   - Handles achievement initialization, checking, and unlocking
   - Manages points, levels, streaks, and stats
   - Syncs with Supabase database

2. **Content Blocker** (`content/blocker.js`)
   - Displays achievement unlock notifications
   - Shows feedback when user answers questions

3. **Options Page** (`options/options.js`)
   - Displays all achievements grid (unlocked first, then locked)
   - Shows achievement details with localization support
   - Updates periodically as user progresses

---

## Achievement Types (8 Total)

### Consistency Achievements
- **first_correct** (🎯 50pts) - Answer your first question correctly

### Mastery Achievements
- **perfect_10** (💯 200pts) - Answer 10 questions in a row correctly
- **accuracy_master** (🎯 300pts) - Maintain 90% accuracy over 50 questions

### Volume Achievements
- **century_club** (💪 500pts) - Answer 100 questions correctly
- **millennium_master** (🏆 2000pts) - Answer 1000 questions correctly

### Speed Achievements
- **lightning_fast** (⚡ 400pts) - Answer 10 questions correctly in under 5 seconds each

### Level Achievements
- **level_up_2** (⭐ 100pts) - Reach Level 2
- **level_up_5** (🎓 1000pts) - Reach Level 5

---

## Day Streak System (Duolingo-Style)

The day streak system replaces the previous streak_3, streak_7, and streak_30 achievements. Instead of achievements, the streak itself is the reward.

### How It Works
- **day_streak**: Number of consecutive days the user has answered at least one question correctly
- **last_active_date**: The date of the user's last correct answer
- **longest_day_streak**: The highest day streak ever achieved

### Streak Logic
```
Day 1: User answers correctly → day_streak = 1, last_active_date = today
Day 2: User answers correctly → day_streak = 2, last_active_date = today  
Day 3: User skips → (nothing happens yet)
Day 4: User answers correctly → day_streak RESETS to 1 (gap detected)
```

### Streak Feedback
When a user answers a question correctly:
- **Streak extended**: "🔥 Day X! Keep it up!"
- **Streak lost**: "💔 Streak reset (was Y days)"

### UI Display
- **Popup**: Shows current day streak with 🔥 icon
- **Active today indicator**: Green checkmark when user has already practiced today
- **Blocker overlay**: Shows streak feedback after correct answers

---

## Data Flow

### 1. User Answers a Question
```
User answers question → Content Blocker (blocker.js)
                     ↓
              QuestionManager processes answer
                     ↓
              Sends result to background.js
```

### 2. Stats Update (updateStats)
**Location:** `shared/gamification.js` → `updateStats()` method

```
updateStats(questionResult)
    ↓
1. Load cached stats from database (if needed)
    ↓
2. Update statistics:
   - Increment total_questions_answered
   - Increment total_correct_answers (if correct)
   - Update average_response_time
    ↓
3. Update gamification stats:
   - Add pointsEarned to total_points
   - Increment/reset current_streak
   - Track longest_streak
    ↓
4. Check for level up:
   - Calculate new level based on total_points
   - Update current_level if changed
    ↓
5. CHECK FOR ACHIEVEMENTS:
   → checkAndUnlockAchievements()
    ↓
6. Save all changes to Supabase database
    ↓
7. Return result:
   {
     pointsEarned,
     levelUp,
     newLevel,
     newAchievements,  ← Newly unlocked achievements
     streakBonus,
     totalPoints
   }
```

### 3. Achievement Checking (checkAndUnlockAchievements)
**Location:** `shared/gamification.js` → `checkAndUnlockAchievements()` method

```
For each achievement not yet unlocked:
    ↓
Check condition based on achievement ID:
    ↓
    ├─ first_correct: stats.correctAnswers >= 1
    ├─ streak_3: stats.currentStreak >= 3
    ├─ streak_7: stats.currentStreak >= 7
    ├─ streak_30: stats.currentStreak >= 30
    ├─ perfect_10: stats.currentStreak >= 10
    ├─ accuracy_master: stats.totalQuestions >= 50 AND accuracy >= 90%
    ├─ century_club: stats.correctAnswers >= 100
    ├─ millennium_master: stats.correctAnswers >= 1000
    ├─ lightning_fast: stats.averageResponseTime <= 5000 AND stats.totalQuestions >= 10
    ├─ level_up_2: stats.currentLevel >= 2
    └─ level_up_5: stats.currentLevel >= 5
    ↓
If condition met:
    ↓
    ├─ Create unlockedAchievement object
    ├─ Add to cachedStats.gamification.achievements array
    ├─ Mark as unlocked in achievements object
    ├─ Add to newAchievements return array
    └─ Log achievement unlock
    ↓
Return array of newly unlocked achievements
```

### 4. Display Achievement Unlock (Content Blocker)
**Location:** `content/blocker.js` → Feedback display

```
After question is answered:
    ↓
Display feedback modal with:
    ├─ Points earned: "+{pointsEarned} XP"
    ├─ Level up notification (if levelUp is true): "🎉 Level up! Now {newLevel.name}"
    ├─ Streak bonus (if applicable): "🔥 Streak bonus!"
    └─ Achievement unlocks (if newAchievements.length > 0):
       For each achievement:
           "🏆 {achievement.icon} {achievement.name}"
    ↓
Show overlay for 3 seconds or until user clicks "Continue"
```

### 5. Display All Achievements (Options Page)
**Location:** `options/options.js` → `updateAchievements()` method

```
When options page loads or updates:
    ↓
1. Wait for gamificationManager to initialize
    ↓
2. Check if stats need reloading from database
    ↓
3. Get all achievements from gamificationManager
    ↓
4. Sort achievements: unlocked first, then locked
    ↓
5. For each achievement, render card:
   ├─ Icon: {achievement.icon}
   ├─ Name: {name in current locale}
   ├─ Description: {description in current locale}
   ├─ Points: {points} (shown as "+points" if unlocked, just "points" if locked)
   ├─ Unlock date: {date if unlocked_at exists}
   └─ CSS class: 'unlocked' or 'locked' (for styling)
    ↓
Display achievements grid (supports both EN and VI locales)
```

---

## Database Schema

### User Profile Storage
```javascript
profile: {
  gamification: {
    total_points: Number,
    current_level: Number,
    current_streak: Number,
    longest_streak: Number,
    achievements: [  // Array of unlocked achievements
      {
        id: String,
        name: String,
        description: String,
        icon: String,
        points: Number,
        unlocked_at: ISO String
      }
    ],
    badges: Array,
    experience_points: Number
  },
  statistics: {
    total_questions_answered: Number,
    total_correct_answers: Number,
    average_response_time: Number,
    favorite_topics: Array,
    weak_areas: Array
  }
}
```

### Tables
- **users** - User authentication and profile
- **user_achievements** - Mapping of users to unlocked achievements
- **achievements** - Master list of all available achievements (for future database-driven achievements)

---

## Key Methods

### GamificationManager Methods

| Method | Purpose | Returns |
|--------|---------|---------|
| `init()` | Initialize manager, load from DB | Promise |
| `updateStats(questionResult)` | Update user stats after answer | `{ pointsEarned, levelUp, newLevel, newAchievements, ... }` |
| `checkAndUnlockAchievements()` | Check conditions and unlock | Array of newly unlocked achievements |
| `loadUserStatsFromDatabase()` | Fetch stats from Supabase | Promise |
| `saveUserStatsToDatabase()` | Save stats to Supabase | Promise<Boolean> |
| `getAchievements()` | Get all achievements object | Object |
| `getUnlockedAchievements()` | Get only unlocked achievements | Array |
| `getLockedAchievements()` | Get only locked achievements | Array |

---

## Localization

All achievement text supports both **English (en)** and **Vietnamese (vi)**:

```javascript
{
  id: 'streak_3',
  name: '3-Day Streak',
  nameVi: 'Chuỗi 3 Ngày',
  description: 'Answer questions correctly for 3 consecutive days',
  descriptionVi: 'Trả lời đúng câu hỏi trong 3 ngày liên tiếp',
  icon: '🔥',
  points: 100
}
```

---

## Conditions Not Yet Fully Implemented

⚠️ **Note:** The following achievement condition is currently stubbed:

- **lightning_fast** - Currently checks average response time instead of consecutive fast answers

This would require:
1. Tracking a "fast answer streak" counter
2. Resetting when an answer takes > 5 seconds

### Day Streak System
The day streak system (streak_3, streak_7, streak_30 achievements) has been **replaced** with a Duolingo-style day streak counter. See "Day Streak System" section above for details.

---

## Future Enhancements

1. **Database-Driven Achievements** - Load achievement definitions from `achievements` table
2. **Real-time Notifications** - Supabase real-time updates for achievements
3. **Achievement Categories** - Filter/sort by category
4. **Badges** - Separate badge system for milestone clusters
5. **Achievement Sharing** - Share unlocks on social media
6. **Leaderboards** - Compare achievements with other users

---

## Debugging Tips

1. **Check Console Logs** - Look for `🏆 Achievement unlocked:` messages
2. **Inspect Cached Stats** - `window.gamificationManager.cachedStats`
3. **Force Database Sync** - `await window.gamificationManager.saveUserStatsToDatabase()`
4. **Reload Achievements** - `await window.gamificationManager.loadUserStatsFromDatabase()`
5. **Get All Achievements** - `window.gamificationManager.getAchievements()`
6. **Check Dual-Write Logs** - Look for `✅ [Dual-Write]` messages

---

## Dual-Write Implementation (v1.0.1+)

The achievement system now implements a **dual-write pattern** for future analytics:

### What is Dual-Write?

When an achievement is unlocked, it's written to **two locations**:
1. **Primary**: `users.profile.gamification.achievements` (JSONB array) - Used by the extension
2. **Secondary**: `user_achievements` table - For analytics and querying

### Flow Diagram

```
Achievement Condition Met
         ↓
checkAndUnlockAchievements()
         ↓
saveAchievementUnlock(achievementId)
         ↓
┌─────────────────────────────────────┐
│ PRIMARY WRITE                       │
│ saveUserStatsToDatabase()           │
│ → UPDATE users SET profile = ...    │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│ SECONDARY WRITE                     │
│ saveToUserAchievementsTable()       │
│ → ensureAchievementInDatabase()     │
│   → UPSERT achievements table       │
│ → INSERT user_achievements          │
└─────────────────────────────────────┘
```

### UUID Generation

Each achievement has a **deterministic UUID** generated from its string ID:

```javascript
// Example: 'first_correct' → consistent UUID every time
achievement.uuid = gamificationManager.generateAchievementUUID('first_correct');
```

This ensures:
- Foreign key compliance with `achievements` table
- Consistent IDs across sessions and devices
- No need for a central ID registry

### Console Commands

```javascript
// Seed all achievements to the achievements table
// Run this once to enable full dual-write support
await window.gamificationManager.seedAchievementsTable();

// Backfill: Sync existing unlocked achievements to user_achievements table
await window.gamificationManager.syncAchievementsToTable();

// Check a specific achievement's UUID
console.log(window.gamificationManager.achievements['first_correct'].uuid);

// View all achievement UUIDs
Object.entries(window.gamificationManager.achievements).forEach(([id, a]) => {
  console.log(`${id}: ${a.uuid}`);
});
```

### Benefits

| Feature | Before | After (Dual-Write) |
|---------|--------|-------------------|
| Fast reads | ✅ JSONB | ✅ JSONB (unchanged) |
| Cross-user queries | ❌ Hard | ✅ Easy SQL |
| Leaderboards | ❌ Complex | ✅ Simple JOIN |
| Analytics | ❌ Scan all users | ✅ Efficient queries |
| Achievement stats | ❌ Manual | ✅ COUNT/GROUP BY |

### Graceful Degradation

If the secondary write fails (e.g., network issue, table not seeded):
- Primary write still succeeds
- Error is logged but doesn't block user experience
- Can be backfilled later using `syncAchievementsToTable()`


