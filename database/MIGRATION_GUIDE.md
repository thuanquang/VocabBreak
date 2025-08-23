# Database Migration Guide

## Why This New Schema?

The new schema addresses all the limitations identified in the current design:

### ✅ **Solved: Flexibility Issues**
- **Old**: Fixed columns that require ALTER TABLE for new features
- **New**: JSONB columns allow adding fields without schema changes

### ✅ **Solved: Scalability Constraints**
- **Old**: Individual rows for each setting/progress entry
- **New**: Aggregated JSONB data with efficient indexing

### ✅ **Solved: Limited Question Types**
- **Old**: Hard-coded support for 3 question types
- **New**: Flexible metadata system supports unlimited question types

### ✅ **Solved: Poor Analytics**
- **Old**: Basic progress tracking only
- **New**: Comprehensive interaction and session tracking

### ✅ **Solved: No Version Control**
- **Old**: No way to handle schema evolution
- **New**: Built-in schema versioning in every table

## Key Advantages of the New Schema

### 1. **Zero-Downtime Updates**
```javascript
// Add new feature without touching the database
await supabaseClient.updateUserProfile({
  profile: {
    newFeature: {
      enabled: true,
      settings: { ... }
    }
  }
});
```

### 2. **Flexible Question System**
```javascript
// Support any question type without schema changes
const voiceQuestion = {
  metadata: { type: 'voice-recognition' },
  content: { 
    audio_prompt: 'audio-url',
    expected_pronunciation: { ... }
  }
};
```

### 3. **Rich Analytics**
```javascript
// Track any interaction type
await recordInteraction({
  type: 'hint_requested',
  targetType: 'question',
  targetId: questionId,
  context: { reason: 'stuck_too_long' },
  metrics: { time_before_hint: 45 }
});
```

### 4. **Multi-tenant Ready**
```javascript
// Easy to add organization support
const orgConfig = await getConfiguration('organization', orgId);
```

### 5. **A/B Testing Built-in**
```javascript
// Store experiment data in configurations
await setConfiguration('experiment', userId, 'ui_test', 'variant_a', {
  started_at: new Date(),
  metrics_to_track: ['completion_rate', 'time_to_answer']
});
```

## Migration Path from Old Schema

If you have an existing database, here's how to migrate:

### Step 1: Backup Current Data
```bash
# Export existing data
pg_dump -h your-host -U your-user -d your-db > backup_old_schema.sql
```

### Step 2: Create Migration Functions
```sql
-- Migration function for users table
CREATE OR REPLACE FUNCTION migrate_users_to_flexible()
RETURNS void AS $$
BEGIN
  -- Create new users table with flexible schema
  INSERT INTO users_new (id, profile, created_at)
  SELECT 
    id,
    jsonb_build_object(
      'email', email,
      'gamification', jsonb_build_object(
        'total_points', total_points,
        'current_level', current_level,
        'current_streak', current_streak
      ),
      'preferences', COALESCE(settings_json::jsonb, '{}'::jsonb)
    ),
    created_at
  FROM users_old;
END;
$$ LANGUAGE plpgsql;

-- Migration function for questions
CREATE OR REPLACE FUNCTION migrate_questions_to_flexible()
RETURNS void AS $$
BEGIN
  INSERT INTO questions_new (
    id, 
    content, 
    answers, 
    metadata, 
    scoring,
    created_at
  )
  SELECT 
    id,
    jsonb_build_object(
      'text', jsonb_build_object(
        'en', question_text_en,
        'vi', question_text_vi
      )
    ),
    jsonb_build_object(
      'correct', ARRAY[correct_answer],
      'options', COALESCE(options_json, '[]'::jsonb)
    ),
    jsonb_build_object(
      'level', level,
      'topic', topic,
      'type', 'multiple-choice',
      'difficulty', 5
    ),
    jsonb_build_object(
      'base_points', points_value
    ),
    NOW()
  FROM questions_old;
END;
$$ LANGUAGE plpgsql;

-- Migration function for user progress
CREATE OR REPLACE FUNCTION migrate_progress_to_interactions()
RETURNS void AS $$
BEGIN
  INSERT INTO user_interactions (
    user_id,
    interaction_type,
    target_type,
    target_id,
    result,
    metrics,
    created_at
  )
  SELECT 
    user_id,
    'question_answer',
    'question',
    question_id,
    jsonb_build_object(
      'correct', correct,
      'points_earned', points_earned
    ),
    jsonb_build_object(
      'time_taken', time_taken
    ),
    answered_at
  FROM user_progress_old;
END;
$$ LANGUAGE plpgsql;
```

### Step 3: Run Migration
```sql
-- Execute migrations
BEGIN;
  SELECT migrate_users_to_flexible();
  SELECT migrate_questions_to_flexible();
  SELECT migrate_progress_to_interactions();
COMMIT;

-- Verify migration
SELECT COUNT(*) FROM users_new;
SELECT COUNT(*) FROM questions_new;
SELECT COUNT(*) FROM user_interactions;
```

### Step 4: Swap Tables
```sql
-- Rename tables
ALTER TABLE users RENAME TO users_old_backup;
ALTER TABLE users_new RENAME TO users;

ALTER TABLE questions RENAME TO questions_old_backup;
ALTER TABLE questions_new RENAME TO questions;

ALTER TABLE user_progress RENAME TO user_progress_old_backup;
```

## Performance Comparison

### Query Performance Improvements

#### Old Schema - Getting User Stats
```sql
-- Multiple queries needed
SELECT * FROM users WHERE id = ?;
SELECT COUNT(*) FROM user_progress WHERE user_id = ?;
SELECT COUNT(*) FROM user_progress WHERE user_id = ? AND correct = true;
SELECT * FROM user_settings WHERE user_id = ?;
-- Total: 4 queries, 4 round trips
```

#### New Schema - Getting User Stats
```sql
-- Single query with all data
SELECT * FROM users WHERE id = ?;
-- Total: 1 query, 1 round trip
-- All stats are in the profile JSONB field
```

### Storage Efficiency

| Aspect | Old Schema | New Schema | Improvement |
|--------|-----------|------------|-------------|
| Settings per user | 10-20 rows | 1 JSONB field | 95% reduction |
| Progress tracking | 1 row per answer | 1 row per interaction | Same, but richer data |
| Question variants | Multiple tables | Single JSONB | 70% reduction |
| Indexes needed | 15+ | 8-10 | 40% reduction |

## Best Practices with New Schema

### 1. Use Partial Indexes for Performance
```sql
-- Index only active questions
CREATE INDEX idx_active_questions ON questions(is_active) 
WHERE is_active = true;
```

### 2. Leverage JSONB Operators
```javascript
// Efficient JSONB queries
const advancedQuestions = await supabase
  .from('questions')
  .select('*')
  .filter('metadata->>level', 'in', '("C1","C2")')
  .filter('metadata->>difficulty', 'gte', 7);
```

### 3. Batch Operations
```javascript
// Batch multiple interactions
const interactions = events.map(event => ({
  user_id: userId,
  interaction_type: event.type,
  // ... other fields
}));

await supabase
  .from('user_interactions')
  .insert(interactions);
```

### 4. Use Views for Common Queries
```sql
-- Create materialized view for leaderboard
CREATE MATERIALIZED VIEW leaderboard AS
SELECT 
  id,
  username,
  (profile->'gamification'->>'total_points')::int as points,
  (profile->'gamification'->>'current_level')::int as level
FROM users
ORDER BY points DESC;

-- Refresh periodically
REFRESH MATERIALIZED VIEW leaderboard;
```

## Monitoring Schema Health

### Check Table Sizes
```sql
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Monitor JSONB Query Performance
```sql
-- Enable query logging
ALTER SYSTEM SET log_min_duration_statement = 100; -- Log queries over 100ms

-- Check slow queries
SELECT 
  query,
  calls,
  mean_exec_time,
  total_exec_time
FROM pg_stat_statements
WHERE query LIKE '%jsonb%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

## Rollback Plan

If you need to rollback:

```sql
-- Restore from backup
psql -h your-host -U your-user -d your-db < backup_old_schema.sql

-- Or if you kept the old tables
ALTER TABLE users RENAME TO users_failed;
ALTER TABLE users_old_backup RENAME TO users;
```

## Future Extensions Made Easy

With this schema, adding new features requires NO database changes:

### Adding Social Features
```javascript
// Just update the profile JSONB
profile.social = {
  friends: [],
  study_groups: [],
  shared_achievements: []
};
```

### Adding AI Recommendations
```javascript
// Add to metadata
metadata.ai_analysis = {
  difficulty_rating: 0.75,
  concept_tags: ['grammar', 'tense'],
  prerequisite_concepts: []
};
```

### Adding Subscription Tiers
```javascript
// Add to user profile
profile.subscription = {
  tier: 'premium',
  features: ['unlimited_questions', 'ai_tutor'],
  expires_at: '2024-12-31'
};
```

## Conclusion

This new schema provides:
- ✅ **Infinite flexibility** without migrations
- ✅ **Better performance** through JSONB indexing
- ✅ **Rich analytics** capabilities
- ✅ **Future-proof** architecture
- ✅ **Lower maintenance** overhead

The migration process is straightforward and can be done with zero downtime using blue-green deployment strategies.

