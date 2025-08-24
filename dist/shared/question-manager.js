/**
 * Question management system for VocabBreak extension
 * Handles question selection, difficulty matching, and answer validation
 */

class QuestionManager {
  constructor() {
    this.currentQuestion = null;
    this.userSettings = {
      difficultyLevels: ['A1', 'A2'],
      topics: ['general'],
      questionTypes: ['multiple-choice', 'text-input'],
      interfaceLanguage: 'en'
    };
    
    this.defaultQuestions = this.generateSampleQuestions();
    this.init();
  }

  async init() {
    await this.loadUserSettings();
  }

  generateSampleQuestions() {
    // Sample questions for testing when no cache is available
    return [
      {
        id: 'sample_1',
        level: 'A1',
        topic: 'colors',
        type: 'multiple-choice',
        questionText: {
          en: 'What color is the sky on a clear day?',
          vi: 'Bầu trời có màu gì vào ngày trong xanh?'
        },
        correctAnswer: 'blue',
        options: ['red', 'blue', 'green', 'yellow'],
        explanation: {
          en: 'The sky appears blue due to the scattering of sunlight by air molecules.',
          vi: 'Bầu trời có màu xanh do ánh sáng mặt trời bị tán xạ bởi các phân tử không khí.'
        },
        pointsValue: 10,
        difficulty: 1
      },
      {
        id: 'sample_2',
        level: 'A1',
        topic: 'numbers',
        type: 'text-input',
        questionText: {
          en: 'Write the number that comes after "nine":',
          vi: 'Viết số đứng sau "nine" (chín):'
        },
        correctAnswer: 'ten',
        explanation: {
          en: 'Ten comes after nine in the counting sequence.',
          vi: 'Ten (mười) đứng sau nine (chín) trong dãy số đếm.'
        },
        pointsValue: 10,
        difficulty: 1
      },
      {
        id: 'sample_3',
        level: 'A2',
        topic: 'family',
        type: 'multiple-choice',
        questionText: {
          en: 'What do you call your father\'s brother?',
          vi: 'Bạn gọi anh trai của bố bạn là gì?'
        },
        correctAnswer: 'uncle',
        options: ['cousin', 'uncle', 'nephew', 'grandfather'],
        explanation: {
          en: 'Your father\'s brother is your uncle.',
          vi: 'Anh trai của bố bạn là chú/bác của bạn (uncle).'
        },
        pointsValue: 15,
        difficulty: 2
      },
      {
        id: 'sample_4',
        level: 'B1',
        topic: 'emotions',
        type: 'text-input',
        questionText: {
          en: 'Complete: "I feel _____ when I accomplish my goals." (synonym for happy)',
          vi: 'Hoàn thành: "I feel _____ when I accomplish my goals." (từ đồng nghĩa với happy)'
        },
        correctAnswer: 'satisfied',
        alternativeAnswers: ['pleased', 'content', 'fulfilled', 'proud'],
        explanation: {
          en: 'Satisfied, pleased, content, fulfilled, or proud are all appropriate synonyms for happy in this context.',
          vi: 'Satisfied, pleased, content, fulfilled, hoặc proud đều là từ đồng nghĩa phù hợp với happy trong ngữ cảnh này.'
        },
        pointsValue: 20,
        difficulty: 4
      }
    ];
  }

  async loadUserSettings() {
    try {
      const settings = await window.offlineManager?.getAllSettings() || {};
      this.userSettings = {
        ...this.userSettings,
        ...settings.userSettings
      };
    } catch (error) {
      console.error('Failed to load user settings:', error);
    }
  }

  async getNextQuestion() {
    try {
      // Try to get question from cache first
      const cachedQuestions = await this.getCachedQuestions();
      
      if (cachedQuestions.length > 0) {
        this.currentQuestion = this.selectRandomQuestion(cachedQuestions);
        return this.currentQuestion;
      }
      
      // Fallback to sample questions
      console.log('Using sample questions (no cache available)');
      const filteredSamples = this.filterQuestionsBySettings(this.defaultQuestions);
      
      if (filteredSamples.length > 0) {
        this.currentQuestion = this.selectRandomQuestion(filteredSamples);
        return this.currentQuestion;
      }
      
      // Last resort: return first sample question
      this.currentQuestion = this.defaultQuestions[0];
      return this.currentQuestion;
      
    } catch (error) {
      console.error('Failed to get next question:', error);
      this.currentQuestion = this.defaultQuestions[0];
      return this.currentQuestion;
    }
  }

  async getCachedQuestions() {
    if (!window.offlineManager) {
      return [];
    }
    
    const filters = {
      level: this.userSettings.difficultyLevels,
      topic: this.userSettings.topics,
      type: this.userSettings.questionTypes,
      limit: 50,
      shuffle: true
    };
    
    return await window.offlineManager.getCachedQuestions(filters);
  }

  filterQuestionsBySettings(questions) {
    return questions.filter(question => {
      // Filter by difficulty level
      if (this.userSettings.difficultyLevels.length > 0 && 
          !this.userSettings.difficultyLevels.includes(question.level)) {
        return false;
      }
      
      // Filter by topic
      if (this.userSettings.topics.length > 0 && 
          !this.userSettings.topics.includes(question.topic)) {
        return false;
      }
      
      // Filter by question type
      if (this.userSettings.questionTypes.length > 0 && 
          !this.userSettings.questionTypes.includes(question.type)) {
        return false;
      }
      
      return true;
    });
  }

  selectRandomQuestion(questions) {
    if (questions.length === 0) {
      return null;
    }
    
    const randomIndex = Math.floor(Math.random() * questions.length);
    return questions[randomIndex];
  }

  validateAnswer(userAnswer, question = null) {
    const q = question || this.currentQuestion;
    if (!q) {
      return { isCorrect: false, feedback: 'No question available' };
    }
    
    const userAnswerNormalized = this.normalizeAnswer(userAnswer);
    const correctAnswerNormalized = this.normalizeAnswer(q.correctAnswer);
    
    let isCorrect = false;
    
    if (q.type === 'multiple-choice') {
      isCorrect = userAnswerNormalized === correctAnswerNormalized;
    } else if (q.type === 'text-input') {
      // Check main answer
      isCorrect = userAnswerNormalized === correctAnswerNormalized;
      
      // Check alternative answers if available
      if (!isCorrect && q.alternativeAnswers) {
        isCorrect = q.alternativeAnswers.some(alt => 
          this.normalizeAnswer(alt) === userAnswerNormalized
        );
      }
      
      // Fuzzy matching for slight typos (optional)
      if (!isCorrect && this.userSettings.allowFuzzyMatching) {
        isCorrect = this.fuzzyMatch(userAnswerNormalized, correctAnswerNormalized);
      }
    }
    
    return {
      isCorrect: isCorrect,
      correctAnswer: q.correctAnswer,
      explanation: this.getExplanation(q),
      feedback: this.generateFeedback(isCorrect, q)
    };
  }

  normalizeAnswer(answer) {
    if (typeof answer !== 'string') {
      return '';
    }
    
    return answer
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' '); // Normalize spaces
  }

  fuzzyMatch(userAnswer, correctAnswer, threshold = 0.8) {
    // Simple Levenshtein distance-based fuzzy matching
    const distance = this.levenshteinDistance(userAnswer, correctAnswer);
    const maxLength = Math.max(userAnswer.length, correctAnswer.length);
    const similarity = (maxLength - distance) / maxLength;
    
    return similarity >= threshold;
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  getExplanation(question) {
    const lang = this.userSettings.interfaceLanguage || 'en';
    return question.explanation && question.explanation[lang] 
      ? question.explanation[lang] 
      : question.explanation?.en || '';
  }

  generateFeedback(isCorrect, question) {
    const lang = this.userSettings.interfaceLanguage || 'en';
    
    if (isCorrect) {
      const correctMessages = {
        en: [
          'Excellent! Well done!',
          'Perfect! Keep it up!',
          'Great job! You got it right!',
          'Outstanding! Correct answer!'
        ],
        vi: [
          'Xuất sắc! Làm tốt lắm!',
          'Hoàn hảo! Tiếp tục như vậy!',
          'Làm tốt lắm! Bạn đã trả lời đúng!',
          'Tuyệt vời! Đáp án chính xác!'
        ]
      };
      
      const messages = correctMessages[lang] || correctMessages.en;
      return messages[Math.floor(Math.random() * messages.length)];
    } else {
      const incorrectMessages = {
        en: [
          'Not quite right. The correct answer is: ',
          'Close, but the answer is: ',
          'Good try! The correct answer is: ',
          'Keep learning! The right answer is: '
        ],
        vi: [
          'Chưa đúng. Đáp án chính xác là: ',
          'Gần đúng rồi, nhưng đáp án là: ',
          'Cố gắng tốt! Đáp án đúng là: ',
          'Tiếp tục học nhé! Đáp án đúng là: '
        ]
      };
      
      const messages = incorrectMessages[lang] || incorrectMessages.en;
      const randomMessage = messages[Math.floor(Math.random() * messages.length)];
      return randomMessage + question.correctAnswer;
    }
  }

  getCurrentQuestion() {
    return this.currentQuestion;
  }

  getQuestionText(question = null) {
    const q = question || this.currentQuestion;
    if (!q) return '';
    
    const lang = this.userSettings.interfaceLanguage || 'en';
    return q.questionText[lang] || q.questionText.en || '';
  }

  getQuestionOptions(question = null) {
    const q = question || this.currentQuestion;
    if (!q || q.type !== 'multiple-choice') return [];
    
    return q.options || [];
  }

  async updateSettings(newSettings) {
    this.userSettings = { ...this.userSettings, ...newSettings };
    
    try {
      await window.offlineManager?.saveSetting('userSettings', this.userSettings);
    } catch (error) {
      console.error('Failed to save user settings:', error);
    }
  }

  // Statistics and analytics
  async getQuestionStats() {
    try {
      const progress = await window.offlineManager?.getProgress() || [];
      
      const stats = {
        totalAnswered: progress.length,
        correctAnswers: progress.filter(p => p.correct).length,
        accuracy: 0,
        averageTime: 0,
        levelBreakdown: {},
        topicBreakdown: {},
        typeBreakdown: {}
      };
      
      if (stats.totalAnswered > 0) {
        stats.accuracy = (stats.correctAnswers / stats.totalAnswered * 100).toFixed(1);
        stats.averageTime = Math.round(
          progress.reduce((sum, p) => sum + p.timeTaken, 0) / progress.length / 1000
        );
        
        // Breakdown by categories
        progress.forEach(p => {
          // This would require storing question metadata with progress
          // For now, we'll use placeholder data
          const level = 'A1'; // Would get from question data
          const topic = 'general'; // Would get from question data
          const type = 'multiple-choice'; // Would get from question data
          
          stats.levelBreakdown[level] = (stats.levelBreakdown[level] || 0) + 1;
          stats.topicBreakdown[topic] = (stats.topicBreakdown[topic] || 0) + 1;
          stats.typeBreakdown[type] = (stats.typeBreakdown[type] || 0) + 1;
        });
      }
      
      return stats;
    } catch (error) {
      console.error('Failed to get question stats:', error);
      return {
        totalAnswered: 0,
        correctAnswers: 0,
        accuracy: 0,
        averageTime: 0,
        levelBreakdown: {},
        topicBreakdown: {},
        typeBreakdown: {}
      };
    }
  }

  // Question difficulty adjustment
  getDifficultyRecommendation() {
    // This would analyze user performance and suggest difficulty adjustments
    // For now, return current settings
    return {
      currentLevels: this.userSettings.difficultyLevels,
      recommendedLevels: this.userSettings.difficultyLevels,
      reason: 'Maintaining current difficulty based on performance'
    };
  }

  // Voice input placeholder methods
  async startVoiceRecognition() {
    // Placeholder for future voice input implementation
    console.log('Voice recognition not yet implemented');
    return null;
  }

  async stopVoiceRecognition() {
    // Placeholder for future voice input implementation
    console.log('Voice recognition not yet implemented');
    return null;
  }

  validatePronunciation(audioData, correctAnswer) {
    // Placeholder for future pronunciation validation
    console.log('Pronunciation validation not yet implemented');
    return { isCorrect: false, confidence: 0 };
  }
}

// Global instance
const questionManager = new QuestionManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = QuestionManager;
} else if (typeof window !== 'undefined') {
  window.questionManager = questionManager;
}



