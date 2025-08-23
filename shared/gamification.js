/**
 * Gamification system for VocabBreak extension
 * Handles points, streaks, achievements, levels, and user motivation
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
    this.userStats = {
      totalPoints: 0,
      currentStreak: 0,
      longestStreak: 0,
      totalQuestions: 0,
      correctAnswers: 0,
      currentLevel: 1,
      unlockedAchievements: []
    };
    
    this.init();
  }

  async init() {
    await this.loadUserStats();
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
  async checkAchievements() {
    const newAchievements = [];
    
    for (const [id, achievement] of Object.entries(this.achievements)) {
      if (!achievement.unlocked && !this.userStats.unlockedAchievements.includes(id)) {
        if (await achievement.condition(this.userStats)) {
          achievement.unlocked = true;
          this.userStats.unlockedAchievements.push(id);
          this.userStats.totalPoints += achievement.points;
          newAchievements.push(achievement);
          
          // Save achievement unlock
          await this.saveAchievementUnlock(id);
        }
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

  // User stats management
  async updateStats(questionResult) {
    this.userStats.totalQuestions++;
    
    if (questionResult.correct) {
      this.userStats.correctAnswers++;
      this.userStats.currentStreak++;
      this.userStats.longestStreak = Math.max(this.userStats.longestStreak, this.userStats.currentStreak);
    } else {
      this.userStats.currentStreak = 0;
    }
    
    // Add points
    if (questionResult.pointsEarned) {
      this.userStats.totalPoints += questionResult.pointsEarned;
    }
    
    // Update level
    const newLevel = this.calculateLevel(this.userStats.totalPoints);
    const oldLevel = this.userStats.currentLevel;
    this.userStats.currentLevel = newLevel.level;
    
    // Save stats
    await this.saveUserStats();
    
    // Check for achievements
    const newAchievements = await this.checkAchievements();
    
    // Return feedback
    return {
      levelUp: newLevel.level > oldLevel,
      newLevel: newLevel,
      oldLevel: { level: oldLevel },
      newAchievements: newAchievements,
      streakBonus: questionResult.correct && this.userStats.currentStreak > 1,
      totalPoints: this.userStats.totalPoints
    };
  }

  async loadUserStats() {
    try {
      // Load from offline storage first
      const offlineStats = await window.offlineManager.getAllSettings();
      
      if (offlineStats.userStats) {
        this.userStats = { ...this.userStats, ...offlineStats.userStats };
      }
      
      // Load unlocked achievements
      const achievements = await window.offlineManager.getSetting('unlockedAchievements', []);
      this.userStats.unlockedAchievements = achievements;
      
      // Mark achievements as unlocked
      achievements.forEach(id => {
        if (this.achievements[id]) {
          this.achievements[id].unlocked = true;
        }
      });
      
      // Try to sync with Supabase if online
      if (navigator.onLine && window.supabaseClient?.isAuthenticated()) {
        try {
          const profile = await window.supabaseClient.getUserProfile();
          if (profile) {
            this.userStats.totalPoints = Math.max(this.userStats.totalPoints, profile.total_points || 0);
            this.userStats.currentLevel = Math.max(this.userStats.currentLevel, profile.current_level || 1);
            this.userStats.currentStreak = Math.max(this.userStats.currentStreak, profile.current_streak || 0);
          }
        } catch (error) {
          console.error('Failed to sync stats from Supabase:', error);
        }
      }
      
    } catch (error) {
      console.error('Failed to load user stats:', error);
    }
  }

  async saveUserStats() {
    try {
      // Save to offline storage
      await window.offlineManager.saveSetting('userStats', this.userStats);
      await window.offlineManager.saveSetting('unlockedAchievements', this.userStats.unlockedAchievements);
      
      // Sync to Supabase if online
      if (navigator.onLine && window.supabaseClient?.isAuthenticated()) {
        try {
          await window.supabaseClient.updateUserProfile({
            total_points: this.userStats.totalPoints,
            current_level: this.userStats.currentLevel,
            current_streak: this.userStats.currentStreak
          });
        } catch (error) {
          console.error('Failed to sync stats to Supabase:', error);
        }
      }
    } catch (error) {
      console.error('Failed to save user stats:', error);
    }
  }

  async saveAchievementUnlock(achievementId) {
    try {
      // Save locally
      await window.offlineManager.saveSetting('unlockedAchievements', this.userStats.unlockedAchievements);
      
      // Sync to Supabase if online
      if (navigator.onLine && window.supabaseClient?.isAuthenticated()) {
        try {
          await window.supabaseClient.updateUserSettings({
            unlockedAchievements: this.userStats.unlockedAchievements
          });
        } catch (error) {
          console.error('Failed to sync achievement to Supabase:', error);
        }
      }
    } catch (error) {
      console.error('Failed to save achievement unlock:', error);
    }
  }

  // Getters
  getUserStats() {
    return { ...this.userStats };
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
    return this.calculateLevel(this.userStats.totalPoints);
  }

  getNextLevelProgress() {
    return this.getProgressToNextLevel(this.userStats.totalPoints);
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



