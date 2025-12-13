/**
 * Gamification system for VocabBreak extension
 * Handles points, streaks, achievements, levels, and user motivation
 * Completely overhauled to work with Supabase database
 */

class GamificationManager {
  constructor() {
    this.pointsConfig = {
      A1: 10, A2: 15, B1: 20, B2: 25, C1: 30, C2: 35
    };
    
    this.streakMultipliers = {
      1: 1.0,   // 1-2 correct
      3: 1.2,   // 3-5 correct
      6: 1.5,   // 6-10 correct
      11: 2.0   // 11+ correct
    };
    
    this.levelThresholds = [
      { level: 1, points: 0, name: 'Beginner' },
      { level: 2, points: 500, name: 'Elementary' },
      { level: 3, points: 1500, name: 'Intermediate' },
      { level: 4, points: 3500, name: 'Upper-Intermediate' },
      { level: 5, points: 7000, name: 'Advanced' },
      { level: 6, points: 13000, name: 'Expert' }
    ];
    
    this.achievements = this.initializeAchievements();
    
    // Cache for user stats - always sync with database
    this.cachedStats = null;
    this.lastSyncTime = 0;
    this.isInitialized = false;
    
    this.init();
  }

  async init() {
    try {
      // Wait for Supabase client to be ready
      await this.waitForSupabase();
      
      // Load user stats from database
      await this.loadUserStatsFromDatabase();
      
      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize gamification manager:', error);
      this.setEmptyStats();
      this.isInitialized = true;
    }
  }

  async waitForSupabase() {
    let attempts = 0;
    while (attempts < 50) {
      if (window.supabaseClient && window.supabaseClient.client) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    throw new Error('Supabase client not available for gamification');
  }

  setEmptyStats() {
    this.cachedStats = {
      gamification: {
        total_points: 0,
        current_level: 1,
        current_streak: 0,
        longest_streak: 0,
        // Duolingo-style day streak
        day_streak: 0,
        longest_day_streak: 0,
        last_active_date: null,
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
    };
  }

  // Generate deterministic UUID from string ID for database compatibility
  // Uses a namespace-based approach to create consistent UUIDs
  generateAchievementUUID(stringId) {
    // VocabBreak namespace UUID (generated once, fixed forever)
    const namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    
    // Simple hash function to create deterministic UUID from string
    let hash = 0;
    const str = namespace + stringId;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Create UUID-like string from hash (version 5 style)
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    const hex2 = Math.abs(hash * 31).toString(16).padStart(8, '0');
    const hex3 = Math.abs(hash * 17).toString(16).padStart(8, '0');
    const hex4 = Math.abs(hash * 13).toString(16).padStart(8, '0');
    
    return `${hex.slice(0, 8)}-${hex2.slice(0, 4)}-5${hex2.slice(5, 8)}-${hex3.slice(0, 4)}-${hex4.slice(0, 12)}`;
  }

  initializeAchievements() {
    const achievements = {
      // Consistency achievements
      first_correct: {
        id: 'first_correct',
        name: 'First Success',
        nameVi: 'Thành Công Đầu Tiên',
        description: 'Answer your first question correctly',
        descriptionVi: 'Trả lời đúng câu hỏi đầu tiên',
        icon: '🎯',
        category: 'consistency',
        tier: 'bronze',
        points: 50,
        unlocked: false,
        condition: (stats) => stats.correctAnswers >= 1
      },
      
      // NOTE: Day streak achievements removed - the streak itself is the reward (Duolingo-style)
      // The day_streak counter in gamification stats tracks consecutive days of activity
      
      // Mastery achievements
      perfect_10: {
        id: 'perfect_10',
        name: 'Perfect Ten',
        nameVi: 'Hoàn Hảo Mười',
        description: 'Answer 10 questions in a row correctly',
        descriptionVi: 'Trả lời đúng 10 câu hỏi liên tiếp',
        icon: '💯',
        category: 'mastery',
        tier: 'silver',
        points: 200,
        unlocked: false,
        condition: (stats) => stats.currentStreak >= 10
      },
      
      accuracy_master: {
        id: 'accuracy_master',
        name: 'Accuracy Master',
        nameVi: 'Bậc Thầy Chính Xác',
        description: 'Maintain 90% accuracy over 50 questions',
        descriptionVi: 'Duy trì độ chính xác 90% trong 50 câu hỏi',
        icon: '🎯',
        category: 'mastery',
        tier: 'gold',
        points: 300,
        unlocked: false,
        condition: (stats) => stats.totalQuestions >= 50 && (stats.correctAnswers / stats.totalQuestions) >= 0.9
      },
      
      // Volume achievements
      century_club: {
        id: 'century_club',
        name: 'Century Club',
        nameVi: 'Câu Lạc Bộ Trăm',
        description: 'Answer 100 questions correctly',
        descriptionVi: 'Trả lời đúng 100 câu hỏi',
        icon: '💪',
        category: 'volume',
        tier: 'silver',
        points: 500,
        unlocked: false,
        condition: (stats) => stats.correctAnswers >= 100
      },
      
      millennium_master: {
        id: 'millennium_master',
        name: 'Millennium Master',
        nameVi: 'Bậc Thầy Nghìn',
        description: 'Answer 1000 questions correctly',
        descriptionVi: 'Trả lời đúng 1000 câu hỏi',
        icon: '🏆',
        category: 'volume',
        tier: 'platinum',
        points: 2000,
        unlocked: false,
        condition: (stats) => stats.correctAnswers >= 1000
      },
      
      // Speed achievements
      lightning_fast: {
        id: 'lightning_fast',
        name: 'Lightning Fast',
        nameVi: 'Nhanh Như Chớp',
        description: 'Answer 10 questions correctly in under 5 seconds each',
        descriptionVi: 'Trả lời đúng 10 câu hỏi, mỗi câu dưới 5 giây',
        icon: '⚡',
        category: 'speed',
        tier: 'gold',
        points: 400,
        unlocked: false,
        condition: (stats) => this.checkSpeedRecord(10, 5000)
      },
      
      // Level achievements
      level_up_2: {
        id: 'level_up_2',
        name: 'Rising Star',
        nameVi: 'Ngôi Sao Mới',
        description: 'Reach Level 2',
        descriptionVi: 'Đạt cấp độ 2',
        icon: '⭐',
        category: 'level',
        tier: 'bronze',
        points: 100,
        unlocked: false,
        condition: (stats) => stats.currentLevel >= 2
      },
      
      level_up_5: {
        id: 'level_up_5',
        name: 'Language Expert',
        nameVi: 'Chuyên Gia Ngôn Ngữ',
        description: 'Reach Level 5',
        descriptionVi: 'Đạt cấp độ 5',
        icon: '🎓',
        category: 'level',
        tier: 'platinum',
        points: 1000,
        unlocked: false,
        condition: (stats) => stats.currentLevel >= 5
      }
    };

    // Add deterministic UUIDs to each achievement for database compatibility
    for (const [id, achievement] of Object.entries(achievements)) {
      achievement.uuid = this.generateAchievementUUID(id);
    }

    return achievements;
  }

  // Points calculation
  calculatePoints(question, correct, timeTaken, currentStreak) {
    if (!correct) return 0;
    
    let basePoints = this.pointsConfig[question.level] || 20;
    
    // Streak multiplier
    let streakMultiplier = 1.0;
    for (const [threshold, multiplier] of Object.entries(this.streakMultipliers).reverse()) {
      if (currentStreak >= parseInt(threshold)) {
        streakMultiplier = multiplier;
        break;
      }
    }
    
    // Speed bonus (50% bonus if answered within 10 seconds)
    const speedBonus = timeTaken <= 10000 ? 1.5 : 1.0;
    
    // First attempt bonus (25% bonus for correct answers without retries)
    const firstAttemptBonus = 1.25; // Assuming this is first attempt for now
    
    const totalPoints = Math.round(basePoints * streakMultiplier * speedBonus * firstAttemptBonus);
    
    return {
      basePoints,
      streakMultiplier,
      speedBonus: speedBonus > 1 ? 0.5 : 0,
      firstAttemptBonus: firstAttemptBonus > 1 ? 0.25 : 0,
      totalPoints
    };
  }

  // Level management
  calculateLevel(totalPoints) {
    for (let i = this.levelThresholds.length - 1; i >= 0; i--) {
      if (totalPoints >= this.levelThresholds[i].points) {
        return this.levelThresholds[i];
      }
    }
    return this.levelThresholds[0];
  }

  getProgressToNextLevel(totalPoints) {
    const currentLevel = this.calculateLevel(totalPoints);
    const nextLevelIndex = this.levelThresholds.findIndex(l => l.level === currentLevel.level) + 1;
    
    if (nextLevelIndex >= this.levelThresholds.length) {
      return { progress: 100, pointsNeeded: 0, nextLevel: null };
    }
    
    const nextLevel = this.levelThresholds[nextLevelIndex];
    const pointsInCurrentLevel = totalPoints - currentLevel.points;
    const pointsNeededForNextLevel = nextLevel.points - currentLevel.points;
    const progress = (pointsInCurrentLevel / pointsNeededForNextLevel) * 100;
    
    return {
      progress: Math.min(progress, 100),
      pointsNeeded: nextLevel.points - totalPoints,
      nextLevel: nextLevel
    };
  }

  // Achievement checking
  async checkAndUnlockAchievements() {
    if (!this.cachedStats) return [];
    
    const newAchievements = [];
    const currentAchievements = this.cachedStats.gamification.achievements || [];
    const unlockedIds = currentAchievements.map(a => a.id);
    
    // Check each achievement
    for (const [id, achievement] of Object.entries(this.achievements)) {
      if (unlockedIds.includes(id)) continue;
      
      let unlocked = false;
      const stats = this.getUserStats();
      
      switch (id) {
        case 'first_correct':
          unlocked = stats.correctAnswers >= 1;
          break;
        case 'perfect_10':
          unlocked = stats.currentStreak >= 10;
          break;
        case 'accuracy_master':
          unlocked = stats.totalQuestions >= 50 && 
                    (stats.correctAnswers / stats.totalQuestions) >= 0.9;
          break;
        case 'century_club':
          unlocked = stats.correctAnswers >= 100;
          break;
        case 'millennium_master':
          unlocked = stats.correctAnswers >= 1000;
          break;
        case 'lightning_fast':
          unlocked = stats.averageResponseTime > 0 && stats.averageResponseTime <= 5000 && stats.totalQuestions >= 10;
          break;
        case 'level_up_2':
          unlocked = stats.currentLevel >= 2;
          break;
        case 'level_up_5':
          unlocked = stats.currentLevel >= 5;
          break;
      }
      
      if (unlocked) {
        const unlockedAchievement = {
          id: id,
          uuid: achievement.uuid, // Include UUID for dual-write
          name: achievement.name,
          description: achievement.description,
          icon: achievement.icon,
          points: achievement.points,
          category: achievement.category,
          tier: achievement.tier,
          unlocked_at: new Date().toISOString()
        };
        
        // Add to cached stats
        this.cachedStats.gamification.achievements.push(unlockedAchievement);
        
        // Mark as unlocked in achievements object
        achievement.unlocked = true;
        achievement.unlocked_at = unlockedAchievement.unlocked_at;
        
        newAchievements.push(unlockedAchievement);
        
        
        // Trigger dual-write (async, non-blocking)
        this.saveAchievementUnlock(id).catch(err => {
          console.error('❌ Dual-write failed for achievement:', id, err);
        });
      }
    }
    
    return newAchievements;
  }

  /**
   * Update day streak (Duolingo-style)
   * Called when user answers a question correctly
   * - Same day: no change (already counted today)
   * - Next day: increment streak
   * - Gap > 1 day: reset streak to 1
   */
  updateDayStreak() {
    if (!this.cachedStats) return { streakChanged: false };
    
    const today = new Date().toDateString();
    const lastActive = this.cachedStats.gamification.last_active_date;
    const oldStreak = this.cachedStats.gamification.day_streak || 0;
    
    let newStreak = oldStreak;
    let streakLost = false;
    let streakExtended = false;
    
    if (!lastActive) {
      // First time ever - start streak at 1
      newStreak = 1;
      streakExtended = true;
    } else if (lastActive === today) {
      // Already practiced today, do nothing
      return { streakChanged: false, dayStreak: oldStreak };
    } else {
      // Check if it was yesterday
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      if (lastActive === yesterday) {
        // Streak continues!
        newStreak = oldStreak + 1;
        streakExtended = true;
      } else {
        // Streak broken (gap > 1 day), reset
        newStreak = 1;
        streakLost = oldStreak > 0;
      }
    }
    
    // Update stats
    this.cachedStats.gamification.day_streak = newStreak;
    this.cachedStats.gamification.last_active_date = today;
    this.cachedStats.gamification.longest_day_streak = Math.max(
      this.cachedStats.gamification.longest_day_streak || 0,
      newStreak
    );
    
    return {
      streakChanged: streakExtended || streakLost,
      streakExtended,
      streakLost,
      dayStreak: newStreak,
      previousStreak: oldStreak
    };
  }

  /**
   * Get current day streak info
   */
  getDayStreakInfo() {
    if (!this.cachedStats) {
      return { dayStreak: 0, longestDayStreak: 0, lastActiveDate: null, isActiveToday: false };
    }
    
    const today = new Date().toDateString();
    const lastActive = this.cachedStats.gamification.last_active_date;
    
    return {
      dayStreak: this.cachedStats.gamification.day_streak || 0,
      longestDayStreak: this.cachedStats.gamification.longest_day_streak || 0,
      lastActiveDate: lastActive,
      isActiveToday: lastActive === today
    };
  }

  async checkSpeedRecord(questionCount, maxTimePerQuestion) {
    return false; // Speed records not tracked without history
  }

  // User stats management - completely overhauled for database integration
  async updateStats(questionResult) {
    try {
      if (!this.isInitialized) {
        console.warn('⚠️ Gamification manager not initialized');
        return { pointsEarned: 0, levelUp: false, newAchievements: [] };
      }

      const { correct, pointsEarned, timeTaken, question } = questionResult;
      
      
      // Ensure we have cached stats
      if (!this.cachedStats) {
        await this.loadUserStatsFromDatabase();
      }
      
      // Update statistics
      this.cachedStats.statistics.total_questions_answered++;
      if (correct) {
        this.cachedStats.statistics.total_correct_answers++;
      }
      
      // Update response time average
      const totalQuestions = this.cachedStats.statistics.total_questions_answered;
      const currentAvg = this.cachedStats.statistics.average_response_time || 0;
      this.cachedStats.statistics.average_response_time = 
        ((currentAvg * (totalQuestions - 1)) + timeTaken) / totalQuestions;
      
      // Update gamification stats
      let dayStreakResult = { streakChanged: false, dayStreak: 0 };
      if (correct) {
        this.cachedStats.gamification.total_points += pointsEarned;
        this.cachedStats.gamification.experience_points += pointsEarned;
        this.cachedStats.gamification.current_streak++;
        this.cachedStats.gamification.longest_streak = Math.max(
          this.cachedStats.gamification.longest_streak,
          this.cachedStats.gamification.current_streak
        );
        
        // Update Duolingo-style day streak
        dayStreakResult = this.updateDayStreak();
      } else {
        this.cachedStats.gamification.current_streak = 0;
      }
      
      // Check for level up
      const newLevel = this.calculateLevel(this.cachedStats.gamification.total_points);
      const levelUp = newLevel.level > this.cachedStats.gamification.current_level;
      if (levelUp) {
        this.cachedStats.gamification.current_level = newLevel.level;
      }
      
      // Check for new achievements
      const newAchievements = await this.checkAndUnlockAchievements();
      
      // Save to database
      const saved = await this.saveUserStatsToDatabase();
      if (!saved) {
        console.warn('⚠️ Failed to save stats to database');
      }
      
      
      return {
        pointsEarned,
        levelUp,
        newLevel: levelUp ? newLevel : null,
        newAchievements,
        streakBonus: correct && this.cachedStats.gamification.current_streak > 1,
        totalPoints: this.cachedStats.gamification.total_points,
        // Duolingo-style day streak info
        dayStreak: dayStreakResult.dayStreak,
        dayStreakChanged: dayStreakResult.streakChanged,
        dayStreakExtended: dayStreakResult.streakExtended,
        dayStreakLost: dayStreakResult.streakLost,
        previousDayStreak: dayStreakResult.previousStreak
      };
      
    } catch (error) {
      console.error('❌ Failed to update stats:', error);
      return { pointsEarned: 0, levelUp: false, newAchievements: [] };
    }
  }

  async loadUserStatsFromDatabase() {
    try {
      if (!window.supabaseClient || !window.supabaseClient.isAuthenticated()) {
        this.setEmptyStats();
        return;
      }

      
      try {
        const userProfile = await window.supabaseClient.getUserProfile();
        
        if (userProfile && userProfile.profile) {
          this.cachedStats = {
            gamification: userProfile.profile.gamification || {
              total_points: 0,
              current_level: 1,
              current_streak: 0,
              longest_streak: 0,
              day_streak: 0,
              longest_day_streak: 0,
              last_active_date: null,
              achievements: [],
              badges: [],
              experience_points: 0
            },
            statistics: userProfile.profile.statistics || {
              total_questions_answered: 0,
              total_correct_answers: 0,
              average_response_time: 0,
              favorite_topics: [],
              weak_areas: []
            }
          };
          
          // Ensure day streak fields exist (for users upgrading from old version)
          if (this.cachedStats.gamification.day_streak === undefined) {
            this.cachedStats.gamification.day_streak = 0;
          }
          if (this.cachedStats.gamification.longest_day_streak === undefined) {
            this.cachedStats.gamification.longest_day_streak = 0;
          }
          if (this.cachedStats.gamification.last_active_date === undefined) {
            this.cachedStats.gamification.last_active_date = null;
          }
          
          // Mark achievements as unlocked
          const achievements = this.cachedStats.gamification.achievements || [];
          achievements.forEach(achievement => {
            if (this.achievements[achievement.id]) {
              this.achievements[achievement.id].unlocked = true;
              this.achievements[achievement.id].unlocked_at = achievement.unlocked_at;
            }
          });
          
          this.lastSyncTime = Date.now();
        } else {
          this.setEmptyStats();
        }
      } catch (profileError) {
        
        // Try to create profile if it doesn't exist
        try {
          await window.supabaseClient.createUserProfileWithRetry({
            displayName: window.supabaseClient.user?.email?.split('@')[0] || 'User'
          });
          
          
          // Retry loading profile
          const userProfile = await window.supabaseClient.getUserProfile();
          
          if (userProfile && userProfile.profile) {
            this.cachedStats = {
              gamification: userProfile.profile.gamification || {
                total_points: 0,
                current_level: 1,
                current_streak: 0,
                longest_streak: 0,
                day_streak: 0,
                longest_day_streak: 0,
                last_active_date: null,
                achievements: [],
                badges: [],
                experience_points: 0
              },
              statistics: userProfile.profile.statistics || {
                total_questions_answered: 0,
                total_correct_answers: 0,
                average_response_time: 0,
                favorite_topics: [],
                weak_areas: []
              }
            };
            
            this.lastSyncTime = Date.now();
          } else {
            this.setEmptyStats();
          }
        } catch (createError) {
          console.error('❌ Could not create user profile:', createError);
          this.setEmptyStats();
        }
      }
      
    } catch (error) {
      console.error('❌ Failed to load user stats from database:', error);
      this.setEmptyStats();
    }
  }

  async saveUserStatsToDatabase() {
    try {
      if (!window.supabaseClient || !window.supabaseClient.isAuthenticated()) {
        console.warn('⚠️ Cannot save stats - user not authenticated');
        return false;
      }

      if (!this.cachedStats) {
        console.warn('⚠️ No cached stats to save');
        return false;
      }

      
      // Update the user profile with new stats
      const updateData = {
        profile: {
          gamification: this.cachedStats.gamification,
          statistics: this.cachedStats.statistics
        },
        updated_at: new Date().toISOString()
      };

      await window.supabaseClient.updateUserProfile(updateData);
      this.lastSyncTime = Date.now();
      
      return true;
      
    } catch (error) {
      console.error('❌ Failed to save stats to database:', error);
      return false;
    }
  }

  /**
   * Dual-write achievement unlock:
   * 1. Primary: Save to users.profile.gamification.achievements (JSONB)
   * 2. Secondary: Save to user_achievements table (for analytics/querying)
   */
  async saveAchievementUnlock(achievementId) {
    try {
      if (!this.cachedStats) {
        console.warn('No cached stats available for saving achievement');
        return;
      }
      
      // Save the entire stats to database (includes the new achievement in JSONB)
      if (navigator.onLine && window.supabaseClient?.isAuthenticated()) {
        try {
          // PRIMARY WRITE: Save to users.profile.gamification.achievements
          await this.saveUserStatsToDatabase();
          
          // SECONDARY WRITE: Save to user_achievements table
          await this.saveToUserAchievementsTable(achievementId);
          
        } catch (error) {
          console.error('Failed to sync achievement to Supabase:', error);
        }
      }
    } catch (error) {
      console.error('Failed to save achievement unlock:', error);
    }
  }

  /**
   * Secondary write to user_achievements table for future analytics
   * Gracefully handles missing achievements in the achievements table
   */
  async saveToUserAchievementsTable(achievementId) {
    try {
      if (!window.supabaseClient?.client || !window.supabaseClient.isAuthenticated()) {
        return false;
      }

      const achievement = this.achievements[achievementId];
      if (!achievement) {
        console.warn(`⚠️ [Dual-Write] Achievement ${achievementId} not found`);
        return false;
      }

      const userId = window.supabaseClient.user?.id;
      if (!userId) {
        console.warn('⚠️ [Dual-Write] No user ID available');
        return false;
      }

      // First, ensure the achievement exists in the achievements table
      await this.ensureAchievementInDatabase(achievement);

      // Now insert into user_achievements
      const { data, error } = await window.supabaseClient.client
        .from('user_achievements')
        .upsert([{
          user_id: userId,
          achievement_id: achievement.uuid,
          unlocked_at: new Date().toISOString(),
          progress: { completed: true },
          notified: true
        }], {
          onConflict: 'user_id,achievement_id',
          ignoreDuplicates: true
        })
        .select();

      if (error) {
        // Ignore duplicate key errors (achievement already unlocked)
        if (error.code === '23505') {
          return true;
        }
        // Log foreign key errors but don't throw (achievements table may not be seeded)
        if (error.code === '23503') {
          console.warn(`⚠️ [Dual-Write] Foreign key error - achievements table may need seeding. Run seedAchievementsTable()`);
          return false;
        }
        console.error('❌ [Dual-Write] Secondary write failed:', error);
        return false;
      }

      return true;

    } catch (error) {
      console.error('❌ [Dual-Write] Error in secondary write:', error);
      return false;
    }
  }

  /**
   * Ensure achievement exists in the achievements table (upsert)
   * This populates the achievements table for foreign key compliance
   */
  async ensureAchievementInDatabase(achievement) {
    try {
      if (!window.supabaseClient?.client) return false;

      const achievementData = {
        name: { en: achievement.name, vi: achievement.nameVi || achievement.name },
        description: { en: achievement.description, vi: achievement.descriptionVi || achievement.description },
        icon: achievement.icon,
        category: achievement.category || 'general',
        tier: achievement.tier || 'bronze',
        points_value: achievement.points,
        requirements: {},
        rewards: { points: achievement.points }
      };

      const { error } = await window.supabaseClient.client
        .from('achievements')
        .upsert([{
          id: achievement.uuid,
          achievement_data: achievementData,
          metadata: { string_id: achievement.id },
          is_active: true,
          is_hidden: false
        }], {
          onConflict: 'id',
          ignoreDuplicates: true
        });

      if (error && error.code !== '23505') {
        console.warn(`⚠️ [Dual-Write] Could not ensure achievement ${achievement.id} in DB:`, error.message);
        return false;
      }

      return true;
    } catch (error) {
      console.warn('⚠️ [Dual-Write] Error ensuring achievement in database:', error);
      return false;
    }
  }

  /**
   * Seed all achievements to the achievements table
   * Call this once to populate the achievements table for full dual-write support
   * Can be called from console: window.gamificationManager.seedAchievementsTable()
   */
  async seedAchievementsTable() {
    try {
      if (!window.supabaseClient?.client || !window.supabaseClient.isAuthenticated()) {
        console.error('❌ Cannot seed achievements - Supabase client not available or not authenticated');
        return { success: false, error: 'Not authenticated' };
      }

      const results = { success: 0, failed: 0, errors: [] };

      for (const [id, achievement] of Object.entries(this.achievements)) {
        const achievementData = {
          name: { en: achievement.name, vi: achievement.nameVi || achievement.name },
          description: { en: achievement.description, vi: achievement.descriptionVi || achievement.description },
          icon: achievement.icon,
          category: achievement.category || 'general',
          tier: achievement.tier || 'bronze',
          points_value: achievement.points,
          requirements: {},
          rewards: { points: achievement.points }
        };

        const { error } = await window.supabaseClient.client
          .from('achievements')
          .upsert([{
            id: achievement.uuid,
            achievement_data: achievementData,
            metadata: { string_id: id },
            is_active: true,
            is_hidden: false
          }], {
            onConflict: 'id'
          });

        if (error) {
          results.failed++;
          results.errors.push({ id, error: error.message });
          console.error(`❌ Failed to seed ${id}:`, error.message);
        } else {
          results.success++;
        }
      }

      return results;
    } catch (error) {
      console.error('❌ Error seeding achievements table:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync all unlocked achievements from JSONB to user_achievements table
   * Call this to backfill user_achievements for existing users
   * Can be called from console: window.gamificationManager.syncAchievementsToTable()
   */
  async syncAchievementsToTable() {
    try {
      if (!this.cachedStats || !window.supabaseClient?.isAuthenticated()) {
        console.error('❌ Cannot sync - no cached stats or not authenticated');
        return { success: false, error: 'Not ready' };
      }

      // First, seed the achievements table
      await this.seedAchievementsTable();

      const unlockedAchievements = this.cachedStats.gamification.achievements || [];
      const results = { success: 0, failed: 0, errors: [] };

      for (const unlocked of unlockedAchievements) {
        const achievement = this.achievements[unlocked.id];
        if (!achievement) {
          results.failed++;
          results.errors.push({ id: unlocked.id, error: 'Achievement not found in definitions' });
          continue;
        }

        const success = await this.saveToUserAchievementsTable(unlocked.id);
        if (success) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push({ id: unlocked.id, error: 'Insert failed' });
        }
      }

      return results;
    } catch (error) {
      console.error('❌ Error syncing achievements to table:', error);
      return { success: false, error: error.message };
    }
  }

  // Getters - updated for database structure
  getUserStats() {
    if (!this.cachedStats) {
      return {
        totalPoints: 0,
        currentStreak: 0,
        longestStreak: 0,
        dayStreak: 0,
        longestDayStreak: 0,
        lastActiveDate: null,
        totalQuestions: 0,
        correctAnswers: 0,
        currentLevel: 1
      };
    }
    
    const gamification = this.cachedStats.gamification;
    const statistics = this.cachedStats.statistics;
    const today = new Date().toDateString();
    
    return {
      totalPoints: gamification.total_points || 0,
      currentStreak: gamification.current_streak || 0,
      longestStreak: gamification.longest_streak || 0,
      // Duolingo-style day streak
      dayStreak: gamification.day_streak || 0,
      longestDayStreak: gamification.longest_day_streak || 0,
      lastActiveDate: gamification.last_active_date || null,
      isActiveToday: gamification.last_active_date === today,
      totalQuestions: statistics.total_questions_answered || 0,
      correctAnswers: statistics.total_correct_answers || 0,
      currentLevel: gamification.current_level || 1,
      experiencePoints: gamification.experience_points || 0,
      averageResponseTime: statistics.average_response_time || 0
    };
  }

  getAchievements() {
    return { ...this.achievements };
  }

  getUnlockedAchievements() {
    return Object.values(this.achievements).filter(a => a.unlocked);
  }

  getLockedAchievements() {
    return Object.values(this.achievements).filter(a => !a.unlocked);
  }

  getCurrentLevel() {
    const stats = this.getUserStats();
    return this.calculateLevel(stats.totalPoints);
  }

  getNextLevelProgress() {
    const stats = this.getUserStats();
    return this.getProgressToNextLevel(stats.totalPoints);
  }

  // Motivation messages
  getMotivationMessage(result) {
    const messages = {
      correct: {
        en: [
          'Excellent work! Keep it up!',
          'Great job! You\'re on fire!',
          'Perfect! Your vocabulary is growing!',
          'Outstanding! Well done!',
          'Fantastic! You\'re making progress!'
        ],
        vi: [
          'Xuất sắc! Tiếp tục như vậy!',
          'Làm tốt lắm! Bạn đang rất giỏi!',
          'Hoàn hảo! Từ vựng của bạn đang phát triển!',
          'Tuyệt vời! Làm rất tốt!',
          'Tuyệt vời! Bạn đang tiến bộ!'
        ]
      },
      incorrect: {
        en: [
          'Don\'t worry, learning takes time!',
          'Keep trying, you\'ll get it next time!',
          'Every mistake is a learning opportunity!',
          'Stay positive, you\'re improving!',
          'Practice makes perfect!'
        ],
        vi: [
          'Đừng lo, học tập cần thời gian!',
          'Tiếp tục cố gắng, lần sau bạn sẽ làm được!',
          'Mỗi lỗi sai là một cơ hội học tập!',
          'Hãy tích cực, bạn đang tiến bộ!',
          'Luyện tập sẽ hoàn thiện!'
        ]
      }
    };
    
    const locale = window.i18n?.getCurrentLocale() || 'en';
    const messageType = result.correct ? 'correct' : 'incorrect';
    const messageList = messages[messageType][locale] || messages[messageType]['en'];
    
    return messageList[Math.floor(Math.random() * messageList.length)];
  }
}

// Global instance
const gamificationManager = new GamificationManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GamificationManager;
} else if (typeof window !== 'undefined') {
  window.gamificationManager = gamificationManager;
}

