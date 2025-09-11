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
      console.log('✅ Gamification manager initialized with database connection');
    } catch (error) {
      console.error('❌ Failed to initialize gamification manager:', error);
      // Initialize with defaults if database fails
      this.initializeDefaultStats();
      this.isInitialized = true;
    }
  }

  async waitForSupabase() {
    let attempts = 0;
    while (attempts < 50) {
      if (window.supabaseClient && window.supabaseClient.client) {
        console.log('✅ Supabase client ready for gamification');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    throw new Error('Supabase client not available for gamification');
  }

  initializeDefaultStats() {
    this.cachedStats = {
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
    };
    console.log('📊 Initialized default stats (offline mode)');
  }

  initializeAchievements() {
    return {
      // Consistency achievements
      first_correct: {
        id: 'first_correct',
        name: 'First Success',
        nameVi: 'Thành Công Đầu Tiên',
        description: 'Answer your first question correctly',
        descriptionVi: 'Trả lời đúng câu hỏi đầu tiên',
        icon: '🎯',
        points: 50,
        unlocked: false,
        condition: (stats) => stats.correctAnswers >= 1
      },
      
      streak_3: {
        id: 'streak_3',
        name: '3-Day Streak',
        nameVi: 'Chuỗi 3 Ngày',
        description: 'Answer questions correctly for 3 consecutive days',
        descriptionVi: 'Trả lời đúng câu hỏi trong 3 ngày liên tiếp',
        icon: '🔥',
        points: 100,
        unlocked: false,
        condition: (stats) => this.checkConsecutiveDays(3)
      },
      
      streak_7: {
        id: 'streak_7',
        name: 'Week Warrior',
        nameVi: 'Chiến Binh Tuần',
        description: 'Answer questions correctly for 7 consecutive days',
        descriptionVi: 'Trả lời đúng câu hỏi trong 7 ngày liên tiếp',
        icon: '⚔️',
        points: 250,
        unlocked: false,
        condition: (stats) => this.checkConsecutiveDays(7)
      },
      
      streak_30: {
        id: 'streak_30',
        name: 'Monthly Master',
        nameVi: 'Bậc Thầy Tháng',
        description: 'Answer questions correctly for 30 consecutive days',
        descriptionVi: 'Trả lời đúng câu hỏi trong 30 ngày liên tiếp',
        icon: '👑',
        points: 1000,
        unlocked: false,
        condition: (stats) => this.checkConsecutiveDays(30)
      },
      
      // Mastery achievements
      perfect_10: {
        id: 'perfect_10',
        name: 'Perfect Ten',
        nameVi: 'Hoàn Hảo Mười',
        description: 'Answer 10 questions in a row correctly',
        descriptionVi: 'Trả lời đúng 10 câu hỏi liên tiếp',
        icon: '💯',
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
        points: 1000,
        unlocked: false,
        condition: (stats) => stats.currentLevel >= 5
      }
    };
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
        case 'streak_3':
          unlocked = stats.currentStreak >= 3;
          break;
        case 'streak_7':
          unlocked = stats.currentStreak >= 7;
          break;
        case 'streak_30':
          unlocked = stats.currentStreak >= 30;
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
          name: achievement.name,
          description: achievement.description,
          icon: achievement.icon,
          points: achievement.points,
          unlocked_at: new Date().toISOString()
        };
        
        // Add to cached stats
        this.cachedStats.gamification.achievements.push(unlockedAchievement);
        
        // Mark as unlocked in achievements object
        achievement.unlocked = true;
        achievement.unlocked_at = unlockedAchievement.unlocked_at;
        
        newAchievements.push(unlockedAchievement);
        
        console.log('🏆 Achievement unlocked:', unlockedAchievement.name);
      }
    }
    
    return newAchievements;
  }

  async checkConsecutiveDays(days) {
    try {
      const progress = await window.offlineManager.getProgress();
      if (progress.length === 0) return false;
      
      // Group progress by date
      const dateGroups = {};
      progress.filter(p => p.correct).forEach(p => {
        const date = new Date(p.answeredAt).toDateString();
        if (!dateGroups[date]) {
          dateGroups[date] = [];
        }
        dateGroups[date].push(p);
      });
      
      const dates = Object.keys(dateGroups).sort((a, b) => new Date(b) - new Date(a));
      
      // Check for consecutive days
      let consecutiveDays = 0;
      const today = new Date().toDateString();
      let currentDate = new Date();
      
      for (let i = 0; i < days; i++) {
        const dateString = currentDate.toDateString();
        if (dateGroups[dateString]) {
          consecutiveDays++;
        } else {
          break;
        }
        currentDate.setDate(currentDate.getDate() - 1);
      }
      
      return consecutiveDays >= days;
    } catch (error) {
      console.error('Error checking consecutive days:', error);
      return false;
    }
  }

  async checkSpeedRecord(questionCount, maxTimePerQuestion) {
    try {
      const progress = await window.offlineManager.getProgress({ 
        correct: true, 
        limit: questionCount 
      });
      
      if (progress.length < questionCount) return false;
      
      const fastQuestions = progress.filter(p => p.timeTaken <= maxTimePerQuestion);
      return fastQuestions.length >= questionCount;
    } catch (error) {
      console.error('Error checking speed record:', error);
      return false;
    }
  }

  // User stats management - completely overhauled for database integration
  async updateStats(questionResult) {
    try {
      if (!this.isInitialized) {
        console.warn('⚠️ Gamification manager not initialized');
        return { pointsEarned: 0, levelUp: false, newAchievements: [] };
      }

      const { correct, pointsEarned, timeTaken, question } = questionResult;
      
      console.log('📊 Updating stats:', { correct, pointsEarned, timeTaken });
      
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
      if (correct) {
        this.cachedStats.gamification.total_points += pointsEarned;
        this.cachedStats.gamification.experience_points += pointsEarned;
        this.cachedStats.gamification.current_streak++;
        this.cachedStats.gamification.longest_streak = Math.max(
          this.cachedStats.gamification.longest_streak,
          this.cachedStats.gamification.current_streak
        );
      } else {
        this.cachedStats.gamification.current_streak = 0;
      }
      
      // Check for level up
      const newLevel = this.calculateLevel(this.cachedStats.gamification.total_points);
      const levelUp = newLevel.level > this.cachedStats.gamification.current_level;
      if (levelUp) {
        this.cachedStats.gamification.current_level = newLevel.level;
        console.log('🎉 Level up!', newLevel);
      }
      
      // Check for new achievements
      const newAchievements = await this.checkAndUnlockAchievements();
      
      // Save to database
      const saved = await this.saveUserStatsToDatabase();
      if (!saved) {
        console.warn('⚠️ Failed to save stats to database');
      }
      
      console.log('✅ Stats updated successfully');
      
      return {
        pointsEarned,
        levelUp,
        newLevel: levelUp ? newLevel : null,
        newAchievements,
        streakBonus: correct && this.cachedStats.gamification.current_streak > 1,
        totalPoints: this.cachedStats.gamification.total_points
      };
      
    } catch (error) {
      console.error('❌ Failed to update stats:', error);
      return { pointsEarned: 0, levelUp: false, newAchievements: [] };
    }
  }

  async loadUserStatsFromDatabase() {
    try {
      if (!window.supabaseClient || !window.supabaseClient.isAuthenticated()) {
        console.log('📊 User not authenticated, using default stats');
        this.initializeDefaultStats();
        return;
      }

      console.log('📊 Loading user stats from database...');
      
      try {
        const userProfile = await window.supabaseClient.getUserProfile();
        
        if (userProfile && userProfile.profile) {
          this.cachedStats = {
            gamification: userProfile.profile.gamification || {
              total_points: 0,
              current_level: 1,
              current_streak: 0,
              longest_streak: 0,
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
          
          // Mark achievements as unlocked
          const achievements = this.cachedStats.gamification.achievements || [];
          achievements.forEach(achievement => {
            if (this.achievements[achievement.id]) {
              this.achievements[achievement.id].unlocked = true;
              this.achievements[achievement.id].unlocked_at = achievement.unlocked_at;
            }
          });
          
          this.lastSyncTime = Date.now();
          console.log('✅ Loaded stats from database:', this.cachedStats);
        } else {
          console.log('📊 No profile found, initializing default stats');
          this.initializeDefaultStats();
        }
      } catch (profileError) {
        console.log('📝 User profile not found, attempting to create...');
        
        // Try to create profile if it doesn't exist
        try {
          await window.supabaseClient.createUserProfileWithRetry({
            displayName: window.supabaseClient.user?.email?.split('@')[0] || 'User'
          });
          
          console.log('✅ User profile created, retrying stats load...');
          
          // Retry loading profile
          const userProfile = await window.supabaseClient.getUserProfile();
          
          if (userProfile && userProfile.profile) {
            this.cachedStats = {
              gamification: userProfile.profile.gamification || {
                total_points: 0,
                current_level: 1,
                current_streak: 0,
                longest_streak: 0,
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
            console.log('✅ Loaded stats from newly created profile:', this.cachedStats);
          } else {
            console.log('⚠️ Profile creation succeeded but could not load stats');
            this.initializeDefaultStats();
          }
        } catch (createError) {
          console.error('❌ Could not create user profile:', createError);
          console.log('📊 Falling back to default stats');
          this.initializeDefaultStats();
        }
      }
      
    } catch (error) {
      console.error('❌ Failed to load user stats from database:', error);
      this.initializeDefaultStats();
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

      console.log('💾 Saving stats to database...');
      
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
      
      console.log('✅ Stats saved to database successfully');
      return true;
      
    } catch (error) {
      console.error('❌ Failed to save stats to database:', error);
      return false;
    }
  }

  async saveAchievementUnlock(achievementId) {
    try {
      if (!this.cachedStats) {
        console.warn('No cached stats available for saving achievement');
        return;
      }
      
      // Get list of unlocked achievement IDs
      const unlockedIds = this.cachedStats.gamification.achievements.map(a => a.id);
      
      // Save locally
      await window.offlineManager.saveSetting('unlockedAchievements', unlockedIds);
      
      // Save the entire stats to database (includes the new achievement)
      if (navigator.onLine && window.supabaseClient?.isAuthenticated()) {
        try {
          await this.saveUserStatsToDatabase();
        } catch (error) {
          console.error('Failed to sync achievement to Supabase:', error);
        }
      }
    } catch (error) {
      console.error('Failed to save achievement unlock:', error);
    }
  }

  // Getters - updated for database structure
  getUserStats() {
    if (!this.cachedStats) {
      return {
        totalPoints: 0,
        currentStreak: 0,
        longestStreak: 0,
        totalQuestions: 0,
        correctAnswers: 0,
        currentLevel: 1
      };
    }
    
    const gamification = this.cachedStats.gamification;
    const statistics = this.cachedStats.statistics;
    
    return {
      totalPoints: gamification.total_points || 0,
      currentStreak: gamification.current_streak || 0,
      longestStreak: gamification.longest_streak || 0,
      totalQuestions: statistics.total_questions_answered || 0,
      correctAnswers: statistics.total_correct_answers || 0,
      currentLevel: gamification.current_level || 1,
      experiencePoints: gamification.experience_points || 0,
      averageResponseTime: statistics.average_response_time || 0
    };
  }

  // Debug method to initialize test stats with database structure
  async initializeTestStats() {
    console.log('🧪 Initializing test stats for debugging...');
    
    this.cachedStats = {
      gamification: {
        total_points: 150,
        current_level: 2,
        current_streak: 3,
        longest_streak: 5,
        achievements: [{
          id: 'first_correct',
          name: 'First Success',
          description: 'Answer your first question correctly',
          icon: '🎯',
          points: 50,
          unlocked_at: new Date().toISOString()
        }],
        badges: [],
        experience_points: 150
      },
      statistics: {
        total_questions_answered: 12,
        total_correct_answers: 9,
        average_response_time: 15000,
        favorite_topics: [],
        weak_areas: []
      }
    };
    
    // Mark first achievement as unlocked
    if (this.achievements.first_correct) {
      this.achievements.first_correct.unlocked = true;
    }
    
    // Save to database
    await this.saveUserStatsToDatabase();
    console.log('✅ Test stats initialized with database structure:', this.cachedStats);
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



