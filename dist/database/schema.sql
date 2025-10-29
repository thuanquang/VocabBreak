-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.achievements (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  achievement_data jsonb NOT NULL DEFAULT jsonb_build_object('name', jsonb_build_object('en', '', 'vi', ''), 'description', jsonb_build_object('en', '', 'vi', ''), 'icon', '', 'category', '', 'tier', 'bronze', 'points_value', 0, 'requirements', jsonb_build_object(), 'rewards', jsonb_build_object()),
  metadata jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  is_hidden boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT achievements_pkey PRIMARY KEY (id)
);
CREATE TABLE public.analytics_events (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  event_type text NOT NULL,
  event_category text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT analytics_events_pkey PRIMARY KEY (id),
  CONSTRAINT analytics_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.backup_questions (
  id uuid,
  content jsonb,
  answers jsonb,
  metadata jsonb,
  scoring jsonb,
  statistics jsonb,
  relations jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  created_by uuid,
  is_active boolean,
  is_public boolean,
  version integer,
  schema_version integer
);
CREATE TABLE public.backup_users (
  id uuid,
  username text,
  profile jsonb,
  metadata jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  last_active_at timestamp with time zone,
  is_active boolean,
  is_premium boolean,
  subscription_tier text,
  schema_version integer
);
CREATE TABLE public.configurations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  scope text NOT NULL,
  scope_id uuid,
  category text NOT NULL,
  config_key text NOT NULL,
  config_value jsonb NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  priority integer DEFAULT 0,
  valid_from timestamp with time zone DEFAULT now(),
  valid_until timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  CONSTRAINT configurations_pkey PRIMARY KEY (id),
  CONSTRAINT configurations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.feedback (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  feedback_type text NOT NULL,
  target_type text,
  target_id uuid,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'pending'::text,
  admin_notes text,
  created_at timestamp with time zone DEFAULT now(),
  resolved_at timestamp with time zone,
  CONSTRAINT feedback_pkey PRIMARY KEY (id),
  CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.learning_sessions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  session_data jsonb NOT NULL DEFAULT jsonb_build_object('questions_answered', 0, 'correct_answers', 0, 'points_earned', 0, 'streak_count', 0, 'topics_covered', ARRAY[]::text[], 'levels_covered', ARRAY[]::text[], 'achievements_unlocked', ARRAY[]::uuid[]),
  metadata jsonb DEFAULT jsonb_build_object('device_type', '', 'browser', '', 'ip_address', '', 'location', jsonb_build_object()),
  started_at timestamp with time zone DEFAULT now(),
  ended_at timestamp with time zone,
  duration_seconds integer,
  is_active boolean DEFAULT true,
  CONSTRAINT learning_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT learning_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.question_set_items (
  set_id uuid NOT NULL,
  question_id uuid NOT NULL,
  order_index integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT question_set_items_pkey PRIMARY KEY (set_id, question_id),
  CONSTRAINT question_set_items_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.question_sets(id),
  CONSTRAINT question_set_items_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id)
);
CREATE TABLE public.question_sets (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  set_data jsonb NOT NULL DEFAULT jsonb_build_object('name', jsonb_build_object(), 'description', jsonb_build_object(), 'type', 'standard', 'difficulty_range', jsonb_build_object('min', 1, 'max', 10), 'time_limit', 0, 'pass_threshold', 0.7, 'order_type', 'random'),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  is_public boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT question_sets_pkey PRIMARY KEY (id),
  CONSTRAINT question_sets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.questions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  content jsonb NOT NULL DEFAULT jsonb_build_object('text', jsonb_build_object(), 'media', jsonb_build_object('images', ARRAY[]::text[], 'audio', ARRAY[]::text[], 'video', ARRAY[]::text[]), 'context', '', 'instructions', jsonb_build_object(), 'hints', ARRAY[]::jsonb[], 'explanation', jsonb_build_object()),
  answers jsonb NOT NULL DEFAULT jsonb_build_object('correct', ARRAY[]::text[], 'options', ARRAY[]::jsonb[], 'alternatives', ARRAY[]::text[], 'validation_rules', jsonb_build_object('case_sensitive', false, 'trim_whitespace', true, 'fuzzy_match', false, 'fuzzy_threshold', 0.8)),
  metadata jsonb NOT NULL DEFAULT jsonb_build_object('level', 'A1', 'topics', ARRAY[]::text[], 'tags', ARRAY[]::text[], 'type', 'multiple-choice', 'difficulty', 5, 'estimated_time', 30, 'categories', ARRAY[]::text[], 'skills', ARRAY[]::text[], 'source', '', 'author', '', 'review_status', 'pending'),
  scoring jsonb NOT NULL DEFAULT jsonb_build_object('base_points', 10, 'time_bonus_enabled', true, 'time_bonus_threshold', 10, 'time_bonus_multiplier', 1.5, 'difficulty_multiplier', 1.0, 'streak_multiplier', 1.2, 'perfect_bonus', 5),
  statistics jsonb DEFAULT jsonb_build_object('times_answered', 0, 'times_correct', 0, 'average_time', 0, 'difficulty_rating', 0, 'user_ratings', ARRAY[]::jsonb[]),
  relations jsonb DEFAULT jsonb_build_object('prerequisites', ARRAY[]::uuid[], 'related_questions', ARRAY[]::uuid[], 'next_questions', ARRAY[]::uuid[], 'question_set_id', NULL::unknown),
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
CREATE TABLE public.user_achievements (
  user_id uuid NOT NULL,
  achievement_id uuid NOT NULL,
  unlocked_at timestamp with time zone DEFAULT now(),
  progress jsonb DEFAULT '{}'::jsonb,
  notified boolean DEFAULT false,
  CONSTRAINT user_achievements_pkey PRIMARY KEY (user_id, achievement_id),
  CONSTRAINT user_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievements(id),
  CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_interactions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  interaction_type text NOT NULL,
  target_type text,
  target_id uuid,
  session_id uuid,
  context jsonb DEFAULT jsonb_build_object('site_url', '', 'trigger_type', '', 'device_info', jsonb_build_object(), 'browser_info', jsonb_build_object()),
  interaction_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb DEFAULT jsonb_build_object('time_taken', 0, 'attempts', 1, 'hints_used', 0, 'confidence_level', 0),
  created_at timestamp with time zone DEFAULT now(),
  synced_at timestamp with time zone,
  schema_version integer DEFAULT 1,
  CONSTRAINT user_interactions_pkey PRIMARY KEY (id),
  CONSTRAINT user_interactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL,
  username text UNIQUE,
  profile jsonb NOT NULL DEFAULT jsonb_build_object('display_name', '', 'avatar_url', '', 'bio', '', 'preferences', jsonb_build_object('interface_language', 'en', 'question_language', 'en', 'theme', 'light', 'notifications_enabled', true, 'sound_enabled', true), 'learning_config', jsonb_build_object('difficulty_levels', ARRAY['A1'::text], 'topics', ARRAY[]::text[], 'question_types', ARRAY['multiple-choice'::text], 'daily_goal', 10, 'session_length', 30), 'gamification', jsonb_build_object('total_points', 0, 'current_level', 1, 'current_streak', 0, 'longest_streak', 0, 'achievements', ARRAY[]::jsonb[], 'badges', ARRAY[]::jsonb[], 'experience_points', 0), 'statistics', jsonb_build_object('total_questions_answered', 0, 'total_correct_answers', 0, 'average_response_time', 0, 'favorite_topics', ARRAY[]::text[], 'weak_areas', ARRAY[]::jsonb[])),
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