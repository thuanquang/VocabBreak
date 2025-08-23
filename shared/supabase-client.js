/**
 * Supabase client configuration and database operations for VocabBreak
 * Handles authentication, data storage, and real-time synchronization
 * Optimized for the flexible JSONB-based schema
 */

// Supabase client for browser extension
// Note: Supabase client will be loaded via CDN in HTML files or bundled

// Get credentials from chrome storage (set from .env during build)
let SUPABASE_URL = 'YOUR_SUPABASE_URL';
let SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Initialize credentials from storage
async function initializeCredentials() {
  try {
    const result = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey']);
    if (result.supabaseUrl && result.supabaseKey) {
      // Check if credentials are still placeholder values
      if (result.supabaseUrl === 'YOUR_SUPABASE_URL' || result.supabaseKey === 'YOUR_SUPABASE_ANON_KEY') {
        console.warn('⚠️ Supabase credentials are still placeholder values');
        console.log('📝 Please set your actual Supabase credentials using:');
        console.log('   window.setSupabaseCredentials("your_url", "your_key")');
        return false;
      }
      
      SUPABASE_URL = result.supabaseUrl;
      SUPABASE_ANON_KEY = result.supabaseKey;
      console.log('✅ Supabase credentials loaded from storage');
      return true;
    } else {
      console.warn('⚠️ No Supabase credentials found in storage');
      console.log('📝 Please set your Supabase credentials using:');
      console.log('   window.setSupabaseCredentials("your_url", "your_key")');
      return false;
    }
  } catch (error) {
    console.warn('Could not load credentials from storage:', error);
    return false;
  }
}

class SupabaseClient {
  constructor() {
    this.client = null;
    this.user = null;
    this.sessionId = null;
    this.initialized = false;
    this.initClient();
  }

  async initClient() {
    try {
      // Initialize credentials first
      const credentialsLoaded = await initializeCredentials();
      
      if (!credentialsLoaded) {
        console.warn('⚠️ Supabase client not initialized - no valid credentials');
        return;
      }
      
      // Check if we're in a context that supports Supabase
      const isServiceWorker = typeof window === 'undefined' && typeof self !== 'undefined';
      
      if (isServiceWorker) {
        console.log('📝 Service worker context detected - Supabase not available');
        return;
      }
      
      // Check if Supabase is available globally (loaded via CDN)
      if (typeof window !== 'undefined' && window.supabase) {
        this.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false // Disable for extension
          }
        });
        console.log('✅ Supabase client created successfully');
        
        // Get current user session
        const { data: { user } } = await this.client.auth.getUser();
        this.user = user;
        
        // Generate session ID for tracking
        this.sessionId = this.generateUUID();
        
        // Listen for auth changes
        this.client.auth.onAuthStateChange((event, session) => {
          this.user = session?.user || null;
          this.handleAuthChange(event, session);
        });
        
        this.initialized = true;
        console.log('✅ Supabase client initialized successfully');
      } else {
        console.warn('⚠️ Supabase CDN not loaded. Please include the Supabase JS library.');
      }
    } catch (error) {
      console.error('Failed to initialize Supabase client:', error);
    }
  }

  handleAuthChange(event, session) {
    // Notify other parts of the extension about auth changes
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'AUTH_STATE_CHANGED',
        event: event,
        user: session?.user || null
      });

      // Store user session locally for offline access
      if (session) {
        chrome.storage.local.set({
          userSession: {
            user: session.user,
            access_token: session.access_token,
            expires_at: session.expires_at
          }
        });
      } else {
        chrome.storage.local.remove('userSession');
      }
    }
  }

  // =====================================================
  // AUTHENTICATION METHODS
  // =====================================================

  async signUp(email, password, additionalData = {}) {
    const { data, error } = await this.client.auth.signUp({
      email: email,
      password: password,
      options: {
        data: additionalData
      }
    });
    
    if (error) throw error;
    
    // Create user profile after successful signup
    if (data.user) {
      this.user = data.user;
      await this.createUserProfile(additionalData);
    }
    
    return data;
  }

  async signIn(email, password) {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: email,
      password: password
    });
    
    if (error) throw error;
    
    // Start a new learning session
    if (data.user) {
      await this.startLearningSession();
    }
    
    return data;
  }

  async signOut() {
    // End current learning session
    await this.endLearningSession();
    
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  getCurrentUser() {
    return this.user;
  }

  isAuthenticated() {
    return !!this.user;
  }

  // =====================================================
  // USER PROFILE OPERATIONS
  // =====================================================

  async createUserProfile(userData = {}) {
    const { data, error } = await this.client
      .from('users')
      .insert([{
        id: this.user.id,
        username: userData.username || this.user.email.split('@')[0],
        profile: {
          display_name: userData.displayName || '',
          avatar_url: userData.avatarUrl || '',
          bio: userData.bio || '',
          preferences: {
            interface_language: userData.interfaceLanguage || 'en',
            question_language: userData.questionLanguage || 'en',
            theme: userData.theme || 'light',
            notifications_enabled: userData.notificationsEnabled !== false,
            sound_enabled: userData.soundEnabled !== false
          },
          learning_config: {
            difficulty_levels: userData.difficultyLevels || ['A1'],
            topics: userData.topics || [],
            question_types: userData.questionTypes || ['multiple-choice'],
            daily_goal: userData.dailyGoal || 10,
            session_length: userData.sessionLength || 30
          },
          gamification: {
            total_points: 0,
            current_level: 1,
            current_streak: 0,
            longest_streak: 0,
            achievements: [],
            badges: [],
            experience_points: 0
          },
          statistics: {
            total_questions_answered: 0,
            total_correct_answers: 0,
            average_response_time: 0,
            favorite_topics: [],
            weak_areas: []
          }
        },
        metadata: userData.metadata || {}
      }])
      .select();
    
    if (error) throw error;
    return data[0];
  }

  async getUserProfile() {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('id', this.user.id)
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateUserProfile(updates) {
    // Get current profile for deep merge
    const { data: currentProfile } = await this.getUserProfile();
    
    // Deep merge updates into existing profile
    const mergedProfile = this.deepMerge(currentProfile.profile, updates.profile || {});
    
    const { data, error } = await this.client
      .from('users')
      .update({
        ...updates,
        profile: mergedProfile,
        updated_at: new Date().toISOString()
      })
      .eq('id', this.user.id)
      .select();
    
    if (error) throw error;
    return data[0];
  }

  // =====================================================
  // QUESTION OPERATIONS
  // =====================================================

  async getQuestions(filters = {}) {
    let query = this.client
      .from('questions')
      .select('*')
      .eq('is_active', true)
      .eq('is_public', true);
    
    // Filter by level using JSONB operators
    if (filters.level) {
      const levels = Array.isArray(filters.level) ? filters.level : [filters.level];
      query = query.in('metadata->>level', levels);
    }
    
    // Filter by topics using JSONB containment
    if (filters.topics && filters.topics.length > 0) {
      query = query.contains('metadata', { topics: filters.topics });
    }
    
    // Filter by type
    if (filters.type) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      query = query.in('metadata->>type', types);
    }
    
    // Filter by difficulty range
    if (filters.difficulty) {
      if (filters.difficulty.min !== undefined) {
        query = query.gte('metadata->>difficulty', filters.difficulty.min);
      }
      if (filters.difficulty.max !== undefined) {
        query = query.lte('metadata->>difficulty', filters.difficulty.max);
      }
    }
    
    // Filter by tags
    if (filters.tags && filters.tags.length > 0) {
      query = query.overlaps('metadata->tags', filters.tags);
    }
    
    // Order by creation date or custom order
    if (filters.orderBy) {
      query = query.order(filters.orderBy, { ascending: filters.ascending !== false });
    } else {
      query = query.order('created_at', { ascending: false });
    }
    
    // Limit results
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    
    // Offset for pagination
    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async getRandomQuestion(filters = {}) {
    // Get all matching questions
    const questions = await this.getQuestions(filters);
    
    if (questions.length === 0) return null;
    
    // Return random question
    const randomIndex = Math.floor(Math.random() * questions.length);
    return questions[randomIndex];
  }

  async createQuestion(questionData) {
    const { data, error } = await this.client
      .from('questions')
      .insert([{
        content: {
          text: questionData.text || {},
          media: questionData.media || { images: [], audio: [], video: [] },
          context: questionData.context || '',
          instructions: questionData.instructions || {},
          hints: questionData.hints || [],
          explanation: questionData.explanation || {}
        },
        answers: {
          correct: questionData.correctAnswers || [questionData.correctAnswer],
          options: questionData.options || [],
          alternatives: questionData.alternatives || [],
          validation_rules: {
            case_sensitive: questionData.caseSensitive || false,
            trim_whitespace: questionData.trimWhitespace !== false,
            fuzzy_match: questionData.fuzzyMatch || false,
            fuzzy_threshold: questionData.fuzzyThreshold || 0.8
          }
        },
        metadata: {
          level: questionData.level || 'A1',
          topics: questionData.topics || [],
          tags: questionData.tags || [],
          type: questionData.type || 'multiple-choice',
          difficulty: questionData.difficulty || 5,
          estimated_time: questionData.estimatedTime || 30,
          categories: questionData.categories || [],
          skills: questionData.skills || [],
          source: questionData.source || '',
          author: questionData.author || this.user.id,
          review_status: 'pending'
        },
        scoring: {
          base_points: questionData.basePoints || 10,
          time_bonus_enabled: questionData.timeBonusEnabled !== false,
          time_bonus_threshold: questionData.timeBonusThreshold || 10,
          time_bonus_multiplier: questionData.timeBonusMultiplier || 1.5,
          difficulty_multiplier: questionData.difficultyMultiplier || 1.0,
          streak_multiplier: questionData.streakMultiplier || 1.2,
          perfect_bonus: questionData.perfectBonus || 5
        },
        created_by: this.user.id
      }])
      .select();
    
    if (error) throw error;
    return data[0];
  }

  // =====================================================
  // INTERACTION TRACKING
  // =====================================================

  async recordInteraction(interactionData) {
    const { data, error } = await this.client
      .from('user_interactions')
      .insert([{
        user_id: this.user.id,
        interaction_type: interactionData.type || 'question_answer',
        target_type: interactionData.targetType || 'question',
        target_id: interactionData.targetId,
        session_id: this.sessionId,
        context: {
          site_url: interactionData.siteUrl || '',
          trigger_type: interactionData.triggerType || '',
          device_info: interactionData.deviceInfo || {},
          browser_info: interactionData.browserInfo || {}
        },
        interaction_data: interactionData.data || {},
        result: {
          correct: interactionData.correct,
          answer_given: interactionData.answerGiven,
          correct_answer: interactionData.correctAnswer,
          points_earned: interactionData.pointsEarned || 0,
          streak_at_time: interactionData.streakAtTime || 0
        },
        metrics: {
          time_taken: interactionData.timeTaken || 0,
          attempts: interactionData.attempts || 1,
          hints_used: interactionData.hintsUsed || 0,
          confidence_level: interactionData.confidenceLevel || 0
        }
      }])
      .select();
    
    if (error) throw error;
    
    // Update user gamification stats if it's a question answer
    if (interactionData.type === 'question_answer' && interactionData.correct) {
      await this.updateGamificationStats(interactionData.pointsEarned, interactionData.streakAtTime);
    }
    
    return data[0];
  }

  async updateGamificationStats(pointsEarned, currentStreak) {
    const { data: user } = await this.getUserProfile();
    
    const updatedGamification = {
      ...user.profile.gamification,
      total_points: user.profile.gamification.total_points + pointsEarned,
      current_streak: currentStreak,
      longest_streak: Math.max(user.profile.gamification.longest_streak, currentStreak),
      experience_points: user.profile.gamification.experience_points + pointsEarned
    };
    
    // Calculate new level
    updatedGamification.current_level = this.calculateLevel(updatedGamification.total_points);
    
    await this.updateUserProfile({
      profile: {
        gamification: updatedGamification
      }
    });
  }

  // =====================================================
  // LEARNING SESSIONS
  // =====================================================

  async startLearningSession() {
    this.sessionId = this.generateUUID();
    
    const { data, error } = await this.client
      .from('learning_sessions')
      .insert([{
        id: this.sessionId,
        user_id: this.user.id,
        session_data: {
          questions_answered: 0,
          correct_answers: 0,
          points_earned: 0,
          streak_count: 0,
          topics_covered: [],
          levels_covered: [],
          achievements_unlocked: []
        },
        metadata: {
          device_type: this.getDeviceType(),
          browser: this.getBrowserInfo(),
          ip_address: '',
          location: {}
        }
      }])
      .select();
    
    if (error) console.error('Failed to start learning session:', error);
    return data?.[0];
  }

  async updateLearningSession(updates) {
    if (!this.sessionId) return;
    
    const { data, error } = await this.client
      .from('learning_sessions')
      .update({
        session_data: updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', this.sessionId)
      .select();
    
    if (error) console.error('Failed to update learning session:', error);
    return data?.[0];
  }

  async endLearningSession() {
    if (!this.sessionId) return;
    
    const { data, error } = await this.client
      .from('learning_sessions')
      .update({
        ended_at: new Date().toISOString(),
        is_active: false
      })
      .eq('id', this.sessionId)
      .select();
    
    if (error) console.error('Failed to end learning session:', error);
    
    this.sessionId = null;
    return data?.[0];
  }

  // =====================================================
  // CONFIGURATION MANAGEMENT
  // =====================================================

  async getConfiguration(scope, scopeId = null, category = null, key = null) {
    let query = this.client
      .from('configurations')
      .select('*')
      .eq('is_active', true)
      .eq('scope', scope);
    
    if (scopeId) query = query.eq('scope_id', scopeId);
    if (category) query = query.eq('category', category);
    if (key) query = query.eq('config_key', key);
    
    const { data, error } = await query;
    if (error) throw error;
    
    // Return single config if key specified, otherwise return array
    if (key && data.length > 0) {
      return data[0].config_value;
    }
    
    return data;
  }

  async setConfiguration(scope, scopeId, category, key, value, metadata = {}) {
    const { data, error } = await this.client
      .from('configurations')
      .upsert([{
        scope: scope,
        scope_id: scopeId,
        category: category,
        config_key: key,
        config_value: value,
        metadata: metadata
      }], {
        onConflict: 'scope,scope_id,category,config_key',
        ignoreDuplicates: false
      })
      .select();
    
    if (error) throw error;
    return data[0];
  }

  async getUserSettings() {
    return await this.getConfiguration('user', this.user.id);
  }

  async updateUserSettings(category, key, value) {
    return await this.setConfiguration('user', this.user.id, category, key, value);
  }

  // =====================================================
  // ACHIEVEMENTS
  // =====================================================

  async getAchievements() {
    const { data, error } = await this.client
      .from('achievements')
      .select('*')
      .eq('is_active', true)
      .order('achievement_data->points_value', { ascending: false });
    
    if (error) throw error;
    return data;
  }

  async getUserAchievements() {
    const { data, error } = await this.client
      .from('user_achievements')
      .select('*, achievements(*)')
      .eq('user_id', this.user.id)
      .order('unlocked_at', { ascending: false });
    
    if (error) throw error;
    return data;
  }

  async unlockAchievement(achievementId) {
    const { data, error } = await this.client
      .from('user_achievements')
      .insert([{
        user_id: this.user.id,
        achievement_id: achievementId
      }])
      .select();
    
    if (error && error.code !== '23505') throw error; // Ignore duplicate key errors
    
    // Record achievement unlock interaction
    if (data) {
      await this.recordInteraction({
        type: 'achievement_unlock',
        targetType: 'achievement',
        targetId: achievementId
      });
    }
    
    return data?.[0];
  }

  // =====================================================
  // ANALYTICS
  // =====================================================

  async trackEvent(eventType, eventCategory, eventData = {}, metadata = {}) {
    const { data, error } = await this.client
      .from('analytics_events')
      .insert([{
        user_id: this.user.id,
        event_type: eventType,
        event_category: eventCategory,
        event_data: eventData,
        metadata: metadata
      }])
      .select();
    
    if (error) console.error('Failed to track event:', error);
    return data?.[0];
  }

  async getUserStatistics() {
    const { data, error } = await this.client
      .from('user_statistics')
      .select('*')
      .eq('id', this.user.id)
      .single();
    
    if (error) throw error;
    return data;
  }

  // =====================================================
  // FEEDBACK
  // =====================================================

  async submitFeedback(feedbackData) {
    const { data, error } = await this.client
      .from('feedback')
      .insert([{
        user_id: this.user.id,
        feedback_type: feedbackData.type,
        target_type: feedbackData.targetType,
        target_id: feedbackData.targetId,
        content: feedbackData.content,
        metadata: feedbackData.metadata || {}
      }])
      .select();
    
    if (error) throw error;
    return data[0];
  }

  // =====================================================
  // UTILITY METHODS
  // =====================================================

  calculateLevel(points) {
    if (points < 500) return 1;
    if (points < 1500) return 2;
    if (points < 3500) return 3;
    if (points < 7000) return 4;
    if (points < 13000) return 5;
    return 6;
  }

  deepMerge(target, source) {
    const output = Object.assign({}, target);
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target))
            Object.assign(output, { [key]: source[key] });
          else
            output[key] = this.deepMerge(target[key], source[key]);
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }

  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  getDeviceType() {
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      return 'tablet';
    }
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
      return 'mobile';
    }
    return 'desktop';
  }

  getBrowserInfo() {
    const ua = navigator.userAgent;
    let browserName = 'Unknown';
    let browserVersion = 'Unknown';
    
    if (ua.indexOf('Firefox') > -1) {
      browserName = 'Firefox';
      browserVersion = ua.match(/Firefox\/(\d+)/)?.[1] || 'Unknown';
    } else if (ua.indexOf('Chrome') > -1) {
      browserName = 'Chrome';
      browserVersion = ua.match(/Chrome\/(\d+)/)?.[1] || 'Unknown';
    } else if (ua.indexOf('Safari') > -1) {
      browserName = 'Safari';
      browserVersion = ua.match(/Version\/(\d+)/)?.[1] || 'Unknown';
    } else if (ua.indexOf('Edge') > -1) {
      browserName = 'Edge';
      browserVersion = ua.match(/Edge\/(\d+)/)?.[1] || 'Unknown';
    }
    
    return {
      name: browserName,
      version: browserVersion,
      userAgent: ua
    };
  }

  // Utility method to handle offline scenarios
  async executeWithFallback(operation, fallbackData = null) {
    try {
      return await operation();
    } catch (error) {
      console.error('Supabase operation failed:', error);
      
      // Check if we're offline
      if (!navigator.onLine) {
        console.log('Working offline, using fallback data');
        return fallbackData;
      }
      
      throw error;
    }
  }
}

// Global instance
const supabaseClient = new SupabaseClient();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SupabaseClient;
  module.exports.default = SupabaseClient;
} else if (typeof window !== 'undefined') {
  window.SupabaseClient = SupabaseClient;
  window.supabaseClient = supabaseClient;
}

// ES6 export for dynamic imports
if (typeof globalThis !== 'undefined') {
  globalThis.SupabaseClient = SupabaseClient;
}
