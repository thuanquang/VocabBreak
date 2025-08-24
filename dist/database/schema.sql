-- =====================================================
-- VocabBreak Database Schema - Optimized for Flexibility
-- =====================================================
-- This schema is designed to be highly flexible and extensible,
-- allowing for future additions without schema migrations.
-- Using JSONB columns for dynamic data and proper indexing for performance.

-- Enable necessary PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text matching

-- =====================================================
-- CORE TABLES
-- =====================================================

-- Users table with flexible profile storage
CREATE TABLE users (
  id UUID REFERENCES auth.users PRIMARY KEY,
  username TEXT UNIQUE,
  profile JSONB NOT NULL DEFAULT jsonb_build_object(
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
      'difficulty_levels', ARRAY['A1'],
      'topics', ARRAY[]::TEXT[],
      'question_types', ARRAY['multiple-choice'],
      'daily_goal', 10,
      'session_length', 30
    ),
    'gamification', jsonb_build_object(
      'total_points', 0,
      'current_level', 1,
      'current_streak', 0,
      'longest_streak', 0,
      'achievements', ARRAY[]::JSONB[],
      'badges', ARRAY[]::JSONB[],
      'experience_points', 0
    ),
    'statistics', jsonb_build_object(
      'total_questions_answered', 0,
      'total_correct_answers', 0,
      'average_response_time', 0,
      'favorite_topics', ARRAY[]::TEXT[],
      'weak_areas', ARRAY[]::JSONB[]
    )
  ),
  metadata JSONB DEFAULT '{}', -- For any additional user data
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  is_premium BOOLEAN DEFAULT false,
  subscription_tier TEXT DEFAULT 'free', -- 'free', 'basic', 'premium', 'enterprise'
  schema_version INTEGER DEFAULT 1
);

-- Create indexes for user queries
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_active ON users(is_active);
CREATE INDEX idx_users_profile_gin ON users USING gin(profile);
CREATE INDEX idx_users_last_active ON users(last_active_at DESC);

-- Questions table with maximum flexibility
CREATE TABLE questions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  content JSONB NOT NULL DEFAULT jsonb_build_object(
    'text', jsonb_build_object(),
    'media', jsonb_build_object(
      'images', ARRAY[]::TEXT[],
      'audio', ARRAY[]::TEXT[],
      'video', ARRAY[]::TEXT[]
    ),
    'context', '',
    'instructions', jsonb_build_object(),
    'hints', ARRAY[]::JSONB[],
    'explanation', jsonb_build_object()
  ),
  answers JSONB NOT NULL DEFAULT jsonb_build_object(
    'correct', ARRAY[]::TEXT[], -- Support multiple correct answers
    'options', ARRAY[]::JSONB[],
    'alternatives', ARRAY[]::TEXT[],
    'validation_rules', jsonb_build_object(
      'case_sensitive', false,
      'trim_whitespace', true,
      'fuzzy_match', false,
      'fuzzy_threshold', 0.8
    )
  ),
  metadata JSONB NOT NULL DEFAULT jsonb_build_object(
    'level', 'A1',
    'topics', ARRAY[]::TEXT[],
    'tags', ARRAY[]::TEXT[],
    'type', 'multiple-choice',
    'difficulty', 5,
    'estimated_time', 30,
    'categories', ARRAY[]::TEXT[],
    'skills', ARRAY[]::TEXT[], -- 'vocabulary', 'grammar', 'reading', 'listening'
    'source', '',
    'author', '',
    'review_status', 'pending' -- 'pending', 'approved', 'rejected'
  ),
  scoring JSONB NOT NULL DEFAULT jsonb_build_object(
    'base_points', 10,
    'time_bonus_enabled', true,
    'time_bonus_threshold', 10,
    'time_bonus_multiplier', 1.5,
    'difficulty_multiplier', 1.0,
    'streak_multiplier', 1.2,
    'perfect_bonus', 5
  ),
  statistics JSONB DEFAULT jsonb_build_object(
    'times_answered', 0,
    'times_correct', 0,
    'average_time', 0,
    'difficulty_rating', 0,
    'user_ratings', ARRAY[]::JSONB[]
  ),
  relations JSONB DEFAULT jsonb_build_object(
    'prerequisites', ARRAY[]::UUID[],
    'related_questions', ARRAY[]::UUID[],
    'next_questions', ARRAY[]::UUID[],
    'question_set_id', NULL
  ),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,
  schema_version INTEGER DEFAULT 1
);

-- Create comprehensive indexes for questions
CREATE INDEX idx_questions_active ON questions(is_active);
CREATE INDEX idx_questions_metadata_gin ON questions USING gin(metadata);
CREATE INDEX idx_questions_level ON questions((metadata->>'level'));
CREATE INDEX idx_questions_type ON questions((metadata->>'type'));
CREATE INDEX idx_questions_topics ON questions USING gin((metadata->'topics'));
CREATE INDEX idx_questions_tags ON questions USING gin((metadata->'tags'));
CREATE INDEX idx_questions_difficulty ON questions((metadata->'difficulty'));
CREATE INDEX idx_questions_created_at ON questions(created_at DESC);

-- User interactions table (replaces user_progress)
CREATE TABLE user_interactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL, -- 'question_answer', 'question_skip', 'achievement_unlock', etc.
  target_type TEXT, -- 'question', 'achievement', 'level', etc.
  target_id UUID,
  session_id UUID, -- Group interactions by session
  context JSONB DEFAULT jsonb_build_object(
    'site_url', '',
    'trigger_type', '', -- 'timer', 'new_site', 'manual'
    'device_info', jsonb_build_object(),
    'browser_info', jsonb_build_object()
  ),
  interaction_data JSONB NOT NULL DEFAULT '{}',
  result JSONB NOT NULL DEFAULT '{}',
  metrics JSONB DEFAULT jsonb_build_object(
    'time_taken', 0,
    'attempts', 1,
    'hints_used', 0,
    'confidence_level', 0
  ),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ,
  schema_version INTEGER DEFAULT 1
);

-- Create indexes for interactions
CREATE INDEX idx_interactions_user ON user_interactions(user_id);
CREATE INDEX idx_interactions_type ON user_interactions(interaction_type);
CREATE INDEX idx_interactions_target ON user_interactions(target_type, target_id);
CREATE INDEX idx_interactions_session ON user_interactions(session_id);
CREATE INDEX idx_interactions_created ON user_interactions(created_at DESC);
CREATE INDEX idx_interactions_synced ON user_interactions(synced_at) WHERE synced_at IS NULL;

-- Learning sessions table
CREATE TABLE learning_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_data JSONB NOT NULL DEFAULT jsonb_build_object(
    'questions_answered', 0,
    'correct_answers', 0,
    'points_earned', 0,
    'streak_count', 0,
    'topics_covered', ARRAY[]::TEXT[],
    'levels_covered', ARRAY[]::TEXT[],
    'achievements_unlocked', ARRAY[]::UUID[]
  ),
  metadata JSONB DEFAULT jsonb_build_object(
    'device_type', '',
    'browser', '',
    'ip_address', '',
    'location', jsonb_build_object()
  ),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_sessions_user ON learning_sessions(user_id);
CREATE INDEX idx_sessions_active ON learning_sessions(is_active);
CREATE INDEX idx_sessions_started ON learning_sessions(started_at DESC);

-- Flexible configuration table
CREATE TABLE configurations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  scope TEXT NOT NULL, -- 'global', 'user', 'group', 'feature'
  scope_id UUID, -- NULL for global configs
  category TEXT NOT NULL, -- 'site_rules', 'gamification', 'learning', etc.
  config_key TEXT NOT NULL,
  config_value JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0, -- Higher priority configs override lower ones
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  UNIQUE(scope, scope_id, category, config_key)
);

CREATE INDEX idx_config_scope ON configurations(scope, scope_id);
CREATE INDEX idx_config_category ON configurations(category);
CREATE INDEX idx_config_key ON configurations(config_key);
CREATE INDEX idx_config_active ON configurations(is_active);
CREATE INDEX idx_config_validity ON configurations(valid_from, valid_until);

-- Achievements and gamification
CREATE TABLE achievements (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  achievement_data JSONB NOT NULL DEFAULT jsonb_build_object(
    'name', jsonb_build_object('en', '', 'vi', ''),
    'description', jsonb_build_object('en', '', 'vi', ''),
    'icon', '',
    'category', '', -- 'streak', 'accuracy', 'speed', 'volume', 'special'
    'tier', 'bronze', -- 'bronze', 'silver', 'gold', 'platinum', 'diamond'
    'points_value', 0,
    'requirements', jsonb_build_object(),
    'rewards', jsonb_build_object()
  ),
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  is_hidden BOOLEAN DEFAULT false, -- For secret achievements
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_achievements_active ON achievements(is_active);
CREATE INDEX idx_achievements_category ON achievements((achievement_data->>'category'));

-- User achievements junction table
CREATE TABLE user_achievements (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  achievement_id UUID REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  progress JSONB DEFAULT '{}', -- For progressive achievements
  notified BOOLEAN DEFAULT false,
  PRIMARY KEY (user_id, achievement_id)
);

CREATE INDEX idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX idx_user_achievements_unlocked ON user_achievements(unlocked_at DESC);

-- Question sets/collections
CREATE TABLE question_sets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  set_data JSONB NOT NULL DEFAULT jsonb_build_object(
    'name', jsonb_build_object(),
    'description', jsonb_build_object(),
    'type', 'standard', -- 'standard', 'exam', 'challenge', 'custom'
    'difficulty_range', jsonb_build_object('min', 1, 'max', 10),
    'time_limit', 0,
    'pass_threshold', 0.7,
    'order_type', 'random' -- 'random', 'sequential', 'adaptive'
  ),
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  is_public BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_question_sets_creator ON question_sets(created_by);
CREATE INDEX idx_question_sets_public ON question_sets(is_public);
CREATE INDEX idx_question_sets_active ON question_sets(is_active);

-- Question set items junction table
CREATE TABLE question_set_items (
  set_id UUID REFERENCES question_sets(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  order_index INTEGER,
  metadata JSONB DEFAULT '{}',
  PRIMARY KEY (set_id, question_id)
);

CREATE INDEX idx_set_items_set ON question_set_items(set_id);
CREATE INDEX idx_set_items_order ON question_set_items(set_id, order_index);

-- Analytics events table
CREATE TABLE analytics_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_category TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partition by month for better performance
CREATE INDEX idx_analytics_user ON analytics_events(user_id);
CREATE INDEX idx_analytics_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_category ON analytics_events(event_category);
CREATE INDEX idx_analytics_created ON analytics_events(created_at DESC);

-- Feedback and reports
CREATE TABLE feedback (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL, -- 'bug', 'suggestion', 'question_error', 'compliment'
  target_type TEXT,
  target_id UUID,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending', -- 'pending', 'reviewing', 'resolved', 'rejected'
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_feedback_user ON feedback(user_id);
CREATE INDEX idx_feedback_type ON feedback(feedback_type);
CREATE INDEX idx_feedback_status ON feedback(status);
CREATE INDEX idx_feedback_created ON feedback(created_at DESC);

-- =====================================================
-- FUNCTIONS AND TRIGGERS
-- =====================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_questions_updated_at BEFORE UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_configurations_updated_at BEFORE UPDATE ON configurations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_question_sets_updated_at BEFORE UPDATE ON question_sets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_achievements_updated_at BEFORE UPDATE ON achievements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate user level based on points
CREATE OR REPLACE FUNCTION calculate_user_level(points INTEGER)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE
    WHEN points < 500 THEN 1
    WHEN points < 1500 THEN 2
    WHEN points < 3500 THEN 3
    WHEN points < 7000 THEN 4
    WHEN points < 13000 THEN 5
    ELSE 6
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update user statistics after interaction
CREATE OR REPLACE FUNCTION update_user_stats_after_interaction()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.interaction_type = 'question_answer' THEN
    UPDATE users
    SET profile = jsonb_set(
      jsonb_set(
        profile,
        '{statistics, total_questions_answered}',
        to_jsonb(COALESCE((profile->'statistics'->>'total_questions_answered')::INTEGER, 0) + 1)
      ),
      '{statistics, total_correct_answers}',
      to_jsonb(
        CASE 
          WHEN (NEW.result->>'correct')::BOOLEAN 
          THEN COALESCE((profile->'statistics'->>'total_correct_answers')::INTEGER, 0) + 1
          ELSE COALESCE((profile->'statistics'->>'total_correct_answers')::INTEGER, 0)
        END
      )
    ),
    last_active_at = NOW()
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_stats
AFTER INSERT ON user_interactions
FOR EACH ROW EXECUTE FUNCTION update_user_stats_after_interaction();

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_set_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY users_select_own ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY users_update_own ON users FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY users_insert_own ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Questions policies (public read, authenticated write)
CREATE POLICY questions_select_public ON questions FOR SELECT
  USING (is_public = true AND is_active = true);

CREATE POLICY questions_select_own ON questions FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY questions_insert_authenticated ON questions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY questions_update_own ON questions FOR UPDATE
  USING (created_by = auth.uid());

-- User interactions policies
CREATE POLICY interactions_select_own ON user_interactions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY interactions_insert_own ON user_interactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Learning sessions policies
CREATE POLICY sessions_select_own ON learning_sessions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY sessions_insert_own ON learning_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY sessions_update_own ON learning_sessions FOR UPDATE
  USING (user_id = auth.uid());

-- Configurations policies
CREATE POLICY config_select_global ON configurations FOR SELECT
  USING (scope = 'global' OR (scope = 'user' AND scope_id = auth.uid()));

CREATE POLICY config_insert_user ON configurations FOR INSERT
  WITH CHECK (scope = 'user' AND scope_id = auth.uid());

CREATE POLICY config_update_own ON configurations FOR UPDATE
  USING (scope = 'user' AND scope_id = auth.uid());

-- Achievements policies (public read)
CREATE POLICY achievements_select_all ON achievements FOR SELECT
  USING (is_active = true);

-- User achievements policies
CREATE POLICY user_achievements_select_own ON user_achievements FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY user_achievements_insert_own ON user_achievements FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Question sets policies
CREATE POLICY sets_select_public ON question_sets FOR SELECT
  USING (is_public = true AND is_active = true);

CREATE POLICY sets_select_own ON question_sets FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY sets_insert_authenticated ON question_sets FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY sets_update_own ON question_sets FOR UPDATE
  USING (created_by = auth.uid());

-- Analytics events policies
CREATE POLICY analytics_insert_own ON analytics_events FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY analytics_select_own ON analytics_events FOR SELECT
  USING (user_id = auth.uid());

-- Feedback policies
CREATE POLICY feedback_select_own ON feedback FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY feedback_insert_own ON feedback FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- =====================================================
-- INITIAL DATA SEEDING
-- =====================================================

-- Insert default achievements
INSERT INTO achievements (achievement_data) VALUES
  (jsonb_build_object(
    'name', jsonb_build_object('en', 'First Steps', 'vi', 'Bước Đầu Tiên'),
    'description', jsonb_build_object('en', 'Answer your first question correctly', 'vi', 'Trả lời đúng câu hỏi đầu tiên'),
    'icon', '🎯',
    'category', 'milestone',
    'tier', 'bronze',
    'points_value', 10,
    'requirements', jsonb_build_object('correct_answers', 1)
  )),
  (jsonb_build_object(
    'name', jsonb_build_object('en', 'Week Warrior', 'vi', 'Chiến Binh Tuần'),
    'description', jsonb_build_object('en', 'Maintain a 7-day streak', 'vi', 'Duy trì chuỗi 7 ngày'),
    'icon', '🔥',
    'category', 'streak',
    'tier', 'silver',
    'points_value', 50,
    'requirements', jsonb_build_object('streak_days', 7)
  )),
  (jsonb_build_object(
    'name', jsonb_build_object('en', 'Speed Demon', 'vi', 'Tốc Độ Thần Sầu'),
    'description', jsonb_build_object('en', 'Answer 10 questions correctly in under 5 seconds each', 'vi', 'Trả lời đúng 10 câu hỏi, mỗi câu dưới 5 giây'),
    'icon', '⚡',
    'category', 'speed',
    'tier', 'gold',
    'points_value', 100,
    'requirements', jsonb_build_object('fast_answers', 10, 'time_limit', 5)
  ));

-- Insert default global configurations
INSERT INTO configurations (scope, scope_id, category, config_key, config_value) VALUES
  ('global', NULL, 'gamification', 'points_system', jsonb_build_object(
    'base_points_by_level', jsonb_build_object(
      'A1', 10, 'A2', 15, 'B1', 20, 'B2', 25, 'C1', 30, 'C2', 35
    ),
    'multipliers', jsonb_build_object(
      'streak', ARRAY[1.0, 1.0, 1.2, 1.5, 2.0],
      'speed_bonus', 1.5,
      'first_attempt', 1.25
    )
  )),
  ('global', NULL, 'site_rules', 'default_exclusions', jsonb_build_object(
    'patterns', ARRAY[
      'localhost*',
      'file://*',
      'chrome://*',
      'chrome-extension://*',
      '*.google.com/docs/*',
      '*.github.com',
      '*.gitlab.com',
      '*.bitbucket.org'
    ]
  )),
  ('global', NULL, 'learning', 'timing_defaults', jsonb_build_object(
    'new_site_delay', 0,
    'periodic_interval', 1800,
    'wrong_answer_penalty', 30,
    'hint_penalty', 5,
    'skip_penalty', 10
  ));

-- =====================================================
-- UTILITY VIEWS
-- =====================================================

-- User statistics view
CREATE OR REPLACE VIEW user_statistics AS
SELECT 
  u.id,
  u.username,
  (u.profile->'gamification'->>'total_points')::INTEGER as total_points,
  (u.profile->'gamification'->>'current_level')::INTEGER as current_level,
  (u.profile->'gamification'->>'current_streak')::INTEGER as current_streak,
  (u.profile->'statistics'->>'total_questions_answered')::INTEGER as total_questions,
  (u.profile->'statistics'->>'total_correct_answers')::INTEGER as correct_answers,
  CASE 
    WHEN (u.profile->'statistics'->>'total_questions_answered')::INTEGER > 0 
    THEN ROUND(((u.profile->'statistics'->>'total_correct_answers')::NUMERIC / 
                (u.profile->'statistics'->>'total_questions_answered')::NUMERIC) * 100, 2)
    ELSE 0 
  END as accuracy_percentage,
  u.created_at,
  u.last_active_at
FROM users u;

-- Active questions view
CREATE OR REPLACE VIEW active_questions AS
SELECT 
  q.*,
  (q.metadata->>'level') as level,
  (q.metadata->>'type') as question_type,
  (q.metadata->'difficulty')::INTEGER as difficulty,
  (q.metadata->'topics') as topics,
  (q.metadata->'tags') as tags
FROM questions q
WHERE q.is_active = true AND q.is_public = true;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Additional performance indexes
CREATE INDEX idx_interactions_result_correct ON user_interactions((result->>'correct')) 
  WHERE interaction_type = 'question_answer';

CREATE INDEX idx_users_points ON users(((profile->'gamification'->>'total_points')::int) DESC);
CREATE INDEX idx_users_level ON users(((profile->'gamification'->>'current_level')::int));
CREATE INDEX idx_users_streak ON users(((profile->'gamification'->>'current_streak')::int) DESC);

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE users IS 'Core user table with flexible JSONB profile for extensibility';
COMMENT ON TABLE questions IS 'Questions table with flexible content and metadata storage';
COMMENT ON TABLE user_interactions IS 'Tracks all user interactions for analytics and progress';
COMMENT ON TABLE configurations IS 'Flexible configuration system for global and user-specific settings';
COMMENT ON TABLE achievements IS 'Gamification achievements definitions';
COMMENT ON TABLE learning_sessions IS 'Tracks learning sessions for analytics and progress';
COMMENT ON COLUMN users.profile IS 'JSONB field containing all user preferences, stats, and gamification data';
COMMENT ON COLUMN questions.content IS 'JSONB field with multilingual question content and media';
COMMENT ON COLUMN questions.metadata IS 'JSONB field with question categorization and properties';
