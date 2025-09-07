/**
 * Supabase client configuration and database operations for VocabBreak
 * Handles authentication, data storage, and real-time synchronization
 * Optimized for the flexible JSONB-based schema
 */

// Supabase client for browser extension
// Note: Supabase client will be loaded via CDN in HTML files or bundled

// Get credentials from chrome storage (set from .env during build)
let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = '';

// Initialize credentials from storage
async function initializeCredentials() {
  try {
    // First try to get credentials from chrome storage
    const result = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey']);
    if (result.supabaseUrl && result.supabaseKey && 
        result.supabaseUrl !== 'YOUR_SUPABASE_URL' && 
        result.supabaseKey !== 'YOUR_SUPABASE_ANON_KEY') {
      
      SUPABASE_URL = result.supabaseUrl;
      SUPABASE_ANON_KEY = result.supabaseKey;
      // console.log('✅ Supabase credentials loaded from storage');
      return true;
    }
    
    // If not in storage, use the hardcoded values (injected by setup script)
    if (SUPABASE_URL && SUPABASE_URL !== 'YOUR_SUPABASE_URL' && 
        SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY') {
      // console.log('✅ Using hardcoded Supabase credentials');
      return true;
    }
    
    const credError = new Error('Missing Supabase credentials: set via setup-credentials or chrome.storage');
    if (typeof window !== 'undefined' && window.errorHandler) {
      window.errorHandler.handleDatabaseError(credError, { stage: 'credentials' });
    } else {
      console.error(credError);
    }
    throw credError;
  } catch (error) {
    if (typeof window !== 'undefined' && window.errorHandler) {
      window.errorHandler.handleDatabaseError(error, { stage: 'credentials-load' });
    } else {
      console.error('Could not load credentials from storage:', error);
    }
    
    // Fallback to hardcoded values
    if (SUPABASE_URL && SUPABASE_URL !== 'YOUR_SUPABASE_URL' && 
        SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY') {
      // console.log('✅ Using hardcoded Supabase credentials (fallback)');
      return true;
    }
    
    throw new Error('Missing Supabase credentials after storage load failure');
  }
}

class SupabaseClient {
  constructor() {
    this.client = null;
    this.user = null;
    this.sessionId = null;
    this.initialized = false;
    this._initializing = null;
    this.initClient();
  }

  async initClient() {
    try {
      // Initialize credentials first
      await initializeCredentials();
      
      // Check if Supabase is available globally (loaded via CDN)
      if (!(typeof window !== 'undefined' && window.supabase)) {
        await this.loadSupabaseLibrary();
      }

      if (typeof window !== 'undefined' && window.supabase) {
        this.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false // Disable for extension
          }
        });
        // console.log('✅ Supabase client created successfully');
        
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
        // console.log('✅ Supabase client initialized successfully');
      } else {
        const libError = new Error('Supabase library not loaded after attempt');
        if (typeof window !== 'undefined' && window.errorHandler) {
          window.errorHandler.handleDatabaseError(libError, { stage: 'library' });
        } else {
          console.error(libError);
        }
        throw libError;
      }
    } catch (error) {
      if (typeof window !== 'undefined' && window.errorHandler) {
        window.errorHandler.handleDatabaseError(error, { stage: 'init' });
      } else {
        console.error('Failed to initialize Supabase client:', error);
      }
    }
  }

  async loadSupabaseLibrary() {
    try {
      // In MV3 service worker or worker-like contexts
      if (typeof window === 'undefined' && typeof self !== 'undefined' && typeof importScripts === 'function') {
        const url = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
          ? chrome.runtime.getURL('shared/supabase.js')
          : 'shared/supabase.js';
        importScripts(url);
        console.log('📦 Supabase library loaded via importScripts');
        return true;
      }

      // In windowed contexts
      if (typeof window !== 'undefined' && !window.supabase) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL('shared/supabase.js')
            : '../shared/supabase.js';
          script.onload = () => resolve(true);
          script.onerror = () => reject(new Error('Failed to load supabase.js'));
          document.head.appendChild(script);
        });
        console.log('📦 Supabase library injected dynamically');
        return true;
      }
    } catch (e) {
      if (typeof window !== 'undefined' && window.errorHandler) {
        window.errorHandler.handleDatabaseError(e, { stage: 'library-load' });
      } else {
        console.error('Failed to load Supabase library:', e);
      }
      throw e;
    }
    return false;
  }

  async waitForInitialization(timeoutMs = 8000) {
    if (this.initialized && this.client) return true;
    if (!this._initializing) {
      this._initializing = this.initClient();
    }
    await this.withTimeout(this._initializing, timeoutMs, 'initialization');
    if (!this.client) {
      const initError = new Error('Supabase client not available after initialization');
      if (typeof window !== 'undefined' && window.errorHandler) {
        window.errorHandler.handleDatabaseError(initError, { stage: 'post-init' });
      }
      throw initError;
    }
    return true;
  }

  assertClient(context = 'unknown') {
    if (!this.client) {
      const err = new Error(`Supabase client is not initialized for ${context}`);
      if (typeof window !== 'undefined' && window.errorHandler) {
        window.errorHandler.handleDatabaseError(err, { stage: 'assert', context });
      }
      throw err;
    }
  }

  async withTimeout(promise, ms = 10000, context = 'operation') {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const toErr = new Error(`Supabase ${context} timed out after ${ms}ms`);
        if (typeof window !== 'undefined' && window.errorHandler) {
          window.errorHandler.handleNetworkError(toErr, { stage: 'timeout', context, ms });
        }
        reject(toErr);
      }, ms);
    });
    try {
      const result = await Promise.race([promise, timeoutPromise]);
      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  getDebugInfo() {
    return {
      initialized: this.initialized,
      hasClient: !!this.client,
      hasUser: !!this.user,
      sessionId: this.sessionId,
      libraryLoaded: typeof window !== 'undefined' ? !!window.supabase : typeof self !== 'undefined',
      credentials: {
        urlSet: !!SUPABASE_URL && SUPABASE_URL !== 'YOUR_SUPABASE_URL',
        keySet: !!SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY'
      }
    };
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
    await this.waitForInitialization();
    this.assertClient('signUp');
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
    await this.waitForInitialization();
    this.assertClient('signIn');
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
    await this.waitForInitialization();
    this.assertClient('signOut');
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
    await this.waitForInitialization();
    this.assertClient('createUserProfile');
    const op = this.client
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
    const { data, error } = await this.withTimeout(op, 12000, 'createUserProfile');
    
    if (error) throw error;
    return data[0];
  }

  async getUserProfile() {
    await this.waitForInitialization();
    this.assertClient('getUserProfile');
    const op = this.client
      .from('users')
      .select('*')
      .eq('id', this.user.id)
      .single();
    const { data, error } = await this.withTimeout(op, 8000, 'getUserProfile');
    
    if (error) throw error;
    return data;
  }

  async updateUserProfile(updates) {
    await this.waitForInitialization();
    this.assertClient('updateUserProfile');
    // Get current profile for deep merge
    const { data: currentProfile } = await this.getUserProfile();
    
    // Deep merge updates into existing profile
    const mergedProfile = this.deepMerge(currentProfile.profile, updates.profile || {});
    
    const op = this.client
      .from('users')
      .update({
        ...updates,
        profile: mergedProfile,
        updated_at: new Date().toISOString()
      })
      .eq('id', this.user.id)
      .select();
    const { data, error } = await this.withTimeout(op, 12000, 'updateUserProfile');
    
    if (error) throw error;
    return data[0];
  }

  // =====================================================
  // QUESTION OPERATIONS
  // =====================================================

  async getQuestions(filters = {}) {
    await this.waitForInitialization();
    this.assertClient('getQuestions');
    
    // console.log('🔍 getQuestions called with filters:', JSON.stringify(filters, null, 2));
    
    let query = this.client
      .from('questions')
      .select('*')
      .eq('is_active', true)
      .eq('is_public', true);
    
    // Filter by level using JSONB operators
    if (filters.level) {
      const levels = Array.isArray(filters.level) ? filters.level : [filters.level];
      // console.log('🔍 Filtering by levels:', levels);
      query = query.in('metadata->>level', levels);
    }
    
    // Filter by topics using JSONB overlap (any topic in the array matches)
    if (filters.topics && filters.topics.length > 0) {
      // console.log('🔍 Filtering by topics:', filters.topics);
      // Use overlaps to check if any topic in the filter matches any topic in the question
      query = query.overlaps('metadata->topics', filters.topics);
    }
    
    // Filter by type
    if (filters.type) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      // console.log('🔍 Filtering by types:', types);
      query = query.in('metadata->>type', types);
    }
    
    // Filter by difficulty - handle both exact value and range
    if (filters.difficulty !== undefined) {
      if (typeof filters.difficulty === 'object' && (filters.difficulty.min !== undefined || filters.difficulty.max !== undefined)) {
        // Range filtering
        if (filters.difficulty.min !== undefined) {
          // console.log('🔍 Filtering by difficulty min:', filters.difficulty.min);
          query = query.gte('metadata->>difficulty', filters.difficulty.min);
        }
        if (filters.difficulty.max !== undefined) {
          // console.log('🔍 Filtering by difficulty max:', filters.difficulty.max);
          query = query.lte('metadata->>difficulty', filters.difficulty.max);
        }
      } else if (typeof filters.difficulty === 'number') {
        // Exact difficulty value
        // console.log('🔍 Filtering by exact difficulty:', filters.difficulty);
        query = query.eq('metadata->>difficulty', filters.difficulty);
      }
    }
    
    // Filter by tags using overlap
    if (filters.tags && filters.tags.length > 0) {
      // console.log('🔍 Filtering by tags:', filters.tags);
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
    
    // console.log('🔍 Executing query with filters applied');
    const { data, error } = await this.withTimeout(query, 10000, 'getQuestions');
    
    if (error) {
      console.error('❌ Error in getQuestions:', error);
      throw error;
    }
    
    // console.log(`✅ getQuestions returned ${data?.length || 0} questions`);
    if (data && data.length > 0) {
      // console.log('🔍 Sample question metadata:', data[0].metadata);
    }
    
    return data;
  }

  async getRandomQuestion(filters = {}) {
    await this.waitForInitialization();
    // console.log('🎲 getRandomQuestion called with filters:', JSON.stringify(filters, null, 2));
    
    // Get all matching questions
    const questions = await this.getQuestions(filters);
    
    // console.log(`🎲 Found ${questions.length} matching questions`);
    
    if (questions.length === 0) {
      console.log('❌ No questions found matching the filters');
      return null;
    }
    
    // Return random question
    const randomIndex = Math.floor(Math.random() * questions.length);
    const selectedQuestion = questions[randomIndex];
    
    // console.log(`🎲 Selected question ${randomIndex + 1}/${questions.length}:`, {
    //   id: selectedQuestion.id,
    //   level: selectedQuestion.metadata?.level,
    //   type: selectedQuestion.metadata?.type,
    //   topics: selectedQuestion.metadata?.topics,
    //   difficulty: selectedQuestion.metadata?.difficulty
    // });
    
    return selectedQuestion;
  }

  async createQuestion(questionData) {
    await this.waitForInitialization();
    this.assertClient('createQuestion');
    const op = this.client
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
    const { data, error } = await this.withTimeout(op, 12000, 'createQuestion');
    
    if (error) throw error;
    return data[0];
  }

  // =====================================================
  // INTERACTION TRACKING
  // =====================================================

  async recordInteraction(interactionData) {
    await this.waitForInitialization();
    this.assertClient('recordInteraction');
    const op = this.client
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
    const { data, error } = await this.withTimeout(op, 10000, 'recordInteraction');
    
    if (error) throw error;
    
    // Update user gamification stats if it's a question answer
    if (interactionData.type === 'question_answer' && interactionData.correct) {
      await this.updateGamificationStats(interactionData.pointsEarned, interactionData.streakAtTime);
    }
    
    return data[0];
  }

  async updateGamificationStats(pointsEarned, currentStreak) {
    await this.waitForInitialization();
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
    await this.waitForInitialization();
    this.sessionId = this.generateUUID();
    
    const op = this.client
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
    const { data, error } = await this.withTimeout(op, 10000, 'startLearningSession');
    
    if (error) console.error('Failed to start learning session:', error);
    return data?.[0];
  }

  async updateLearningSession(updates) {
    if (!this.sessionId) return;
    
    await this.waitForInitialization();
    const op = this.client
      .from('learning_sessions')
      .update({
        session_data: updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', this.sessionId)
      .select();
    const { data, error } = await this.withTimeout(op, 8000, 'updateLearningSession');
    
    if (error) console.error('Failed to update learning session:', error);
    return data?.[0];
  }

  async endLearningSession() {
    if (!this.sessionId) return;
    
    await this.waitForInitialization();
    const op = this.client
      .from('learning_sessions')
      .update({
        ended_at: new Date().toISOString(),
        is_active: false
      })
      .eq('id', this.sessionId)
      .select();
    const { data, error } = await this.withTimeout(op, 8000, 'endLearningSession');
    
    if (error) console.error('Failed to end learning session:', error);
    
    this.sessionId = null;
    return data?.[0];
  }

  // =====================================================
  // CONFIGURATION MANAGEMENT
  // =====================================================

  async getConfiguration(scope, scopeId = null, category = null, key = null) {
    await this.waitForInitialization();
    this.assertClient('getConfiguration');
    let query = this.client
      .from('configurations')
      .select('*')
      .eq('is_active', true)
      .eq('scope', scope);
    
    if (scopeId) query = query.eq('scope_id', scopeId);
    if (category) query = query.eq('category', category);
    if (key) query = query.eq('config_key', key);
    
    const { data, error } = await this.withTimeout(query, 8000, 'getConfiguration');
    if (error) throw error;
    
    // Return single config if key specified, otherwise return array
    if (key && data.length > 0) {
      return data[0].config_value;
    }
    
    return data;
  }

  async setConfiguration(scope, scopeId, category, key, value, metadata = {}) {
    await this.waitForInitialization();
    this.assertClient('setConfiguration');
    const op = this.client
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
    const { data, error } = await this.withTimeout(op, 10000, 'setConfiguration');
    
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
    await this.waitForInitialization();
    const op = this.client
      .from('achievements')
      .select('*')
      .eq('is_active', true)
      .order('achievement_data->points_value', { ascending: false });
    
    const { data, error } = await this.withTimeout(op, 8000, 'getAchievements');
    if (error) throw error;
    return data;
  }

  async getUserAchievements() {
    await this.waitForInitialization();
    const op = this.client
      .from('user_achievements')
      .select('*, achievements(*)')
      .eq('user_id', this.user.id)
      .order('unlocked_at', { ascending: false });
    
    const { data, error } = await this.withTimeout(op, 8000, 'getUserAchievements');
    if (error) throw error;
    return data;
  }

  async unlockAchievement(achievementId) {
    await this.waitForInitialization();
    const op = this.client
      .from('user_achievements')
      .insert([{
        user_id: this.user.id,
        achievement_id: achievementId
      }])
      .select();
    const { data, error } = await this.withTimeout(op, 8000, 'unlockAchievement');
    
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
    await this.waitForInitialization();
    const op = this.client
      .from('analytics_events')
      .insert([{
        user_id: this.user.id,
        event_type: eventType,
        event_category: eventCategory,
        event_data: eventData,
        metadata: metadata
      }])
      .select();
    
    const { data, error } = await this.withTimeout(op, 8000, 'trackEvent');
    if (error) console.error('Failed to track event:', error);
    return data?.[0];
  }

  async getUserStatistics() {
    await this.waitForInitialization();
    const op = this.client
      .from('user_statistics')
      .select('*')
      .eq('id', this.user.id)
      .single();
    
    const { data, error } = await this.withTimeout(op, 8000, 'getUserStatistics');
    if (error) throw error;
    return data;
  }

  // =====================================================
  // FEEDBACK
  // =====================================================

  async submitFeedback(feedbackData) {
    await this.waitForInitialization();
    const op = this.client
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
    
    const { data, error } = await this.withTimeout(op, 8000, 'submitFeedback');
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
// Expose a readiness promise for consumers to await
if (typeof window !== 'undefined') {
  window.supabaseReadyPromise = (async () => {
    try {
      await supabaseClient.waitForInitialization();
      return true;
    } catch (e) {
      return false;
    }
  })();
}

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
