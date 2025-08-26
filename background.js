/**
 * Background service worker for VocabBreak extension
 * Handles tab tracking, question scheduling (30-minute intervals), and cross-component communication
 */

// Import shared modules for service worker
// Note: Service workers cannot use Supabase CDN, so database operations are handled by content scripts

// Initialize Supabase client for background script
async function initializeSupabase() {
  try {
    // Service workers can't use CDN scripts, so we'll skip Supabase initialization here
    // Questions will be handled through content script communication
    console.log('📝 Background script will use local question bank');
    console.log('📝 Supabase operations will be handled by content scripts when needed');
  } catch (error) {
    console.warn('⚠️ Supabase client not available in background:', error);
    console.log('📝 Extension will work with local question bank instead');
  }
}

class BackgroundManager {
  constructor() {
    this.tabTimers = new Map(); // tabId -> timer info
    this.tabStates = new Map(); // tabId -> state info
    this.periodicInterval = 30 * 60 * 1000; // 30 minutes in milliseconds
    this.wrongAnswerPenalty = 30 * 1000; // 30 seconds in milliseconds
    this.isInitialized = false;
    
    this.init();
  }

  async init() {
    console.log('VocabBreak background script initializing...');
    
    // Initialize Supabase client
    await initializeSupabase();
    
    // Initialize question manager if available
    if (typeof QuestionManager !== 'undefined') {
      window.questionManager = new QuestionManager();
      console.log('✅ Question manager initialized in background');
    }
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Load persisted timer states
    await this.loadPersistedStates();
    
    // Initialize existing tabs
    await this.initializeExistingTabs();
    
    this.isInitialized = true;
    console.log('VocabBreak background script initialized');
  }

  setupEventListeners() {
    // Tab events
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.handleTabActivated(activeInfo.tabId);
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.handleTabUpdated(tabId, tab.url);
      }
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      this.handleTabRemoved(tabId);
    });

    // Runtime messages
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });

    // Extension startup
    chrome.runtime.onStartup.addListener(() => {
      this.handleExtensionStartup();
    });

    chrome.runtime.onInstalled.addListener((details) => {
      this.handleExtensionInstalled(details);
    });

    // Alarm events for persistent timers
    chrome.alarms.onAlarm.addListener((alarm) => {
      this.handleAlarm(alarm);
    });
  }

  async initializeExistingTabs() {
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.url && !tab.url.startsWith('chrome://')) {
          await this.initializeTab(tab.id, tab.url);
        }
      }
    } catch (error) {
      console.error('Failed to initialize existing tabs:', error);
    }
  }

  async initializeTab(tabId, url) {
    if (!url || !this.shouldBlockUrl(url)) {
      return;
    }

    // Check if tab already has a timer
    if (this.tabTimers.has(tabId)) {
      return;
    }

    // Create new tab state
    const tabState = {
      url: url,
      lastQuestionTime: 0,
      questionCount: 0,
      isBlocked: false,
      blockReason: null,
      penaltyEndTime: 0
    };

    this.tabStates.set(tabId, tabState);

    // Set up periodic timer
    this.schedulePeriodicQuestion(tabId);

    console.log(`Initialized tab ${tabId} for URL: ${url}`);
  }

  shouldBlockUrl(url) {
    // Basic URL filtering - in production this would use siteFilter
    if (!url) return false;
    
    const excludePatterns = [
      'chrome://',
      'chrome-extension://',
      'moz-extension://',
      'edge://',
      'about:',
      'file://',
      'localhost'
    ];
    
    return !excludePatterns.some(pattern => url.startsWith(pattern));
  }

  async handleTabActivated(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url) {
        await this.initializeTab(tabId, tab.url);
      }
    } catch (error) {
      console.error('Failed to handle tab activation:', error);
    }
  }

  async handleTabUpdated(tabId, url) {
    try {
      // Clear existing timer if any
      this.clearTabTimer(tabId);

      if (!this.shouldBlockUrl(url)) {
        this.tabStates.delete(tabId);
        return;
      }

      // Initialize/update tab - questions only appear every 30 minutes, not on new site visits
      await this.initializeTab(tabId, url);

    } catch (error) {
      console.error('Failed to handle tab update:', error);
    }
  }

  handleTabRemoved(tabId) {
    this.clearTabTimer(tabId);
    this.tabStates.delete(tabId);
    console.log(`Cleaned up tab ${tabId}`);
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.type) {
        case 'GET_QUESTION':
          try {
            // Background script uses local question bank only
            // Content scripts can handle Supabase integration if needed
            const question = this.getRandomLocalQuestion();
            sendResponse({ success: true, question: question });
          } catch (error) {
            console.error('Error getting question:', error);
            // Final fallback to sample question
            const sampleQuestion = this.getRandomLocalQuestion();
            sendResponse({ success: true, question: sampleQuestion });
          }
          break;

        case 'SUBMIT_ANSWER':
          await this.handleAnswerSubmission(message, sender, sendResponse);
          break;

        case 'REQUEST_BLOCK_CHECK':
          const shouldBlock = await this.shouldBlockTab(sender.tab.id, sender.tab.url);
          sendResponse({ shouldBlock: shouldBlock });
          break;

        case 'GET_TAB_STATE':
          const tabState = this.tabStates.get(sender.tab.id) || null;
          sendResponse({ tabState: tabState });
          break;

        case 'CLEAR_PENALTY':
          await this.clearPenalty(sender.tab.id);
          sendResponse({ success: true });
          break;

        case 'UPDATE_SETTINGS':
          await this.handleSettingsUpdate(message.settings);
          sendResponse({ success: true });
          break;

        case 'GET_STATS':
          const stats = await this.getStats();
          sendResponse({ stats: stats });
          break;

        case 'GET_ACHIEVEMENTS':
          const achievements = await this.getAchievements();
          sendResponse({ achievements: achievements });
          break;

        default:
          console.warn('Unknown message type:', message.type);
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleAnswerSubmission(message, sender, sendResponse) {
    const { questionId, userAnswer, timeTaken } = message;
    const tabId = sender.tab.id;

    try {
      // Get the question that was asked (we need to store this temporarily)
      // For now, we'll validate against the question ID pattern
      let isCorrect = false;
      let correctAnswer = '';
      let explanation = '';
      let feedback = '';
      let pointsEarned = 0;

      // Validate answer based on question ID pattern
      if (questionId.startsWith('local_')) {
        const questionNumber = parseInt(questionId.replace('local_', ''));
        const question = this.getQuestionById(questionNumber);
        
        if (question) {
          correctAnswer = question.correctAnswer;
          isCorrect = userAnswer.toLowerCase().trim() === correctAnswer.toLowerCase().trim();
          pointsEarned = isCorrect ? question.pointsValue : 0;
          
          // Generate feedback based on question
          if (isCorrect) {
            feedback = 'Correct! Well done!';
            explanation = 'Great job! You got it right.';
          } else {
            feedback = `Not quite right. The correct answer is: ${correctAnswer}`;
            explanation = this.getExplanationForQuestion(questionNumber);
          }
        }
      } else {
        // For non-local questions (like Supabase questions), we need to validate properly
        // This should rarely happen since content script should handle Supabase validation
        console.warn('Background script received non-local question ID:', questionId);
        isCorrect = false;
        correctAnswer = 'unknown';
        pointsEarned = 0;
        feedback = 'Question validation failed. Please try again.';
        explanation = 'The question could not be validated properly.';
      }

      // Update tab state
      const tabState = this.tabStates.get(tabId);
      if (tabState) {
        tabState.lastQuestionTime = Date.now();
        tabState.questionCount++;
        
        if (isCorrect) {
          tabState.isBlocked = false;
          tabState.blockReason = null;
          tabState.penaltyEndTime = 0;
        } else {
          tabState.isBlocked = true;
          tabState.blockReason = 'wrong_answer';
          tabState.penaltyEndTime = Date.now() + this.wrongAnswerPenalty;
          
          // Set up penalty timer
          this.schedulePenaltyEnd(tabId);
        }
      }

      // Reschedule periodic question
      if (isCorrect) {
        this.schedulePeriodicQuestion(tabId);
      }

      // Send response
      sendResponse({
        success: true,
        validation: {
          isCorrect: isCorrect,
          correctAnswer: correctAnswer,
          explanation: explanation,
          feedback: feedback
        },
        points: { totalPoints: pointsEarned },
        penaltyEndTime: tabState?.penaltyEndTime || 0
      });

    } catch (error) {
      console.error('Failed to handle answer submission:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async shouldBlockTab(tabId, url) {
    if (!url || !this.shouldBlockUrl(url)) {
      return false;
    }

    const tabState = this.tabStates.get(tabId);
    if (!tabState) {
      return false;
    }

    // Check if currently in penalty period
    if (tabState.penaltyEndTime > Date.now()) {
      return true;
    }

    // Check if question is due
    const timeSinceLastQuestion = Date.now() - tabState.lastQuestionTime;
    const isQuestionDue = timeSinceLastQuestion >= this.periodicInterval;

    return tabState.isBlocked || isQuestionDue;
  }

  async triggerQuestion(tabId, reason) {
    const tabState = this.tabStates.get(tabId);
    if (!tabState) return;

    tabState.isBlocked = true;
    tabState.blockReason = reason;

    // Inject content script if needed
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          if (window.vocabBreakBlocker) {
            window.vocabBreakBlocker.showQuestion();
          }
        }
      });
    } catch (error) {
      console.error('Failed to trigger question display:', error);
    }

    console.log(`Triggered question for tab ${tabId}, reason: ${reason}`);
  }

  schedulePeriodicQuestion(tabId) {
    this.clearTabTimer(tabId);

    const alarmName = `vocabbreak_tab_${tabId}`;
    chrome.alarms.create(alarmName, {
      delayInMinutes: this.periodicInterval / 60000
    });

    this.tabTimers.set(tabId, {
      alarmName: alarmName,
      type: 'periodic',
      scheduledTime: Date.now() + this.periodicInterval
    });

    console.log(`Scheduled periodic question for tab ${tabId} in ${this.periodicInterval / 60000} minutes`);
  }

  schedulePenaltyEnd(tabId) {
    const alarmName = `vocabbreak_penalty_${tabId}`;
    chrome.alarms.create(alarmName, {
      delayInMinutes: this.wrongAnswerPenalty / 60000
    });

    this.tabTimers.set(tabId, {
      alarmName: alarmName,
      type: 'penalty',
      scheduledTime: Date.now() + this.wrongAnswerPenalty
    });

    console.log(`Scheduled penalty end for tab ${tabId} in ${this.wrongAnswerPenalty / 1000} seconds`);
  }

  clearTabTimer(tabId) {
    const timer = this.tabTimers.get(tabId);
    if (timer) {
      chrome.alarms.clear(timer.alarmName);
      this.tabTimers.delete(tabId);
    }
  }

  async handleAlarm(alarm) {
    const alarmName = alarm.name;
    
    if (alarmName.startsWith('vocabbreak_tab_')) {
      const tabId = parseInt(alarmName.replace('vocabbreak_tab_', ''));
      await this.triggerQuestion(tabId, 'periodic');
      
    } else if (alarmName.startsWith('vocabbreak_penalty_')) {
      const tabId = parseInt(alarmName.replace('vocabbreak_penalty_', ''));
      await this.clearPenalty(tabId);
    }
  }

  async clearPenalty(tabId) {
    const tabState = this.tabStates.get(tabId);
    if (tabState) {
      tabState.isBlocked = false;
      tabState.blockReason = null;
      tabState.penaltyEndTime = 0;
    }

    this.clearTabTimer(tabId);
    this.schedulePeriodicQuestion(tabId);

    // Notify content script
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'PENALTY_CLEARED'
      });
    } catch (error) {
      // Tab might be closed or not ready
      console.log('Could not notify tab about penalty clearance:', error.message);
    }

    console.log(`Cleared penalty for tab ${tabId}`);
  }

  async handleSettingsUpdate(settings) {
    // Update periodic interval if changed
    if (settings.timingConfig && settings.timingConfig.periodicInterval) {
      this.periodicInterval = settings.timingConfig.periodicInterval * 1000;
    }

    if (settings.timingConfig && settings.timingConfig.wrongAnswerPenalty) {
      this.wrongAnswerPenalty = settings.timingConfig.wrongAnswerPenalty * 1000;
    }

    // Reinitialize tabs with new settings
    await this.initializeExistingTabs();
  }

  async getStats() {
    try {
      return {
        activeTabs: this.tabStates.size,
        activeTimers: this.tabTimers.size,
        periodicInterval: this.periodicInterval,
        wrongAnswerPenalty: this.wrongAnswerPenalty
      };
    } catch (error) {
      console.error('Failed to get stats:', error);
      return null;
    }
  }

  getRandomLocalQuestion() {
    // Local question bank for when Supabase is not available
    const questions = [
      {
        id: 'local_1',
        level: 'A1',
        type: 'multiple-choice',
        questionText: { en: 'What color is the sky?', vi: 'Bầu trời có màu gì?' },
        correctAnswer: 'blue',
        options: ['red', 'blue', 'green', 'yellow'],
        pointsValue: 10
      },
      {
        id: 'local_2',
        level: 'A1',
        type: 'multiple-choice',
        questionText: { en: 'How many days are in a week?', vi: 'Có bao nhiêu ngày trong một tuần?' },
        correctAnswer: 'seven',
        options: ['five', 'six', 'seven', 'eight'],
        pointsValue: 10
      },
      {
        id: 'local_3',
        level: 'A1',
        type: 'multiple-choice',
        questionText: { en: 'What is the opposite of "hot"?', vi: 'Từ trái nghĩa của "nóng" là gì?' },
        correctAnswer: 'cold',
        options: ['warm', 'cold', 'cool', 'freezing'],
        pointsValue: 10
      },
      {
        id: 'local_4',
        level: 'A2',
        type: 'multiple-choice',
        questionText: { en: 'Which season comes after summer?', vi: 'Mùa nào đến sau mùa hè?' },
        correctAnswer: 'autumn',
        options: ['spring', 'autumn', 'winter', 'summer'],
        pointsValue: 15
      },
      {
        id: 'local_5',
        level: 'A2',
        type: 'multiple-choice',
        questionText: { en: 'What do you use to write on paper?', vi: 'Bạn dùng gì để viết trên giấy?' },
        correctAnswer: 'pen',
        options: ['pen', 'fork', 'book', 'phone'],
        pointsValue: 15
      },
      {
        id: 'local_6',
        level: 'B1',
        type: 'multiple-choice',
        questionText: { en: 'What is the capital of England?', vi: 'Thủ đô của nước Anh là gì?' },
        correctAnswer: 'london',
        options: ['paris', 'london', 'berlin', 'madrid'],
        pointsValue: 20
      },
      {
        id: 'local_7',
        level: 'B1',
        type: 'multiple-choice',
        questionText: { en: 'Which planet is closest to the Sun?', vi: 'Hành tinh nào gần Mặt Trời nhất?' },
        correctAnswer: 'mercury',
        options: ['venus', 'mercury', 'earth', 'mars'],
        pointsValue: 20
      },
      {
        id: 'local_8',
        level: 'A1',
        type: 'text-input',
        questionText: { en: 'Complete the sentence: "The sun is ___."', vi: 'Hoàn thành câu: "Mặt trời ___."' },
        correctAnswer: 'bright',
        pointsValue: 10
      },
      {
        id: 'local_9',
        level: 'A2',
        type: 'text-input',
        questionText: { en: 'What is the opposite of "big"?', vi: 'Từ trái nghĩa của "to" là gì?' },
        correctAnswer: 'small',
        pointsValue: 15
      },
      {
        id: 'local_10',
        level: 'B1',
        type: 'text-input',
        questionText: { en: 'What is the past tense of "go"?', vi: 'Thì quá khứ của "đi" là gì?' },
        correctAnswer: 'went',
        pointsValue: 20
      }
    ];

    // Return a random question
    const randomIndex = Math.floor(Math.random() * questions.length);
    return questions[randomIndex];
  }

  getQuestionById(questionNumber) {
    const questions = [
      {
        id: 'local_1',
        level: 'A1',
        type: 'multiple-choice',
        questionText: { en: 'What color is the sky?', vi: 'Bầu trời có màu gì?' },
        correctAnswer: 'blue',
        options: ['red', 'blue', 'green', 'yellow'],
        pointsValue: 10
      },
      {
        id: 'local_2',
        level: 'A1',
        type: 'multiple-choice',
        questionText: { en: 'How many days are in a week?', vi: 'Có bao nhiêu ngày trong một tuần?' },
        correctAnswer: 'seven',
        options: ['five', 'six', 'seven', 'eight'],
        pointsValue: 10
      },
      {
        id: 'local_3',
        level: 'A1',
        type: 'multiple-choice',
        questionText: { en: 'What is the opposite of "hot"?', vi: 'Từ trái nghĩa của "nóng" là gì?' },
        correctAnswer: 'cold',
        options: ['warm', 'cold', 'cool', 'freezing'],
        pointsValue: 10
      },
      {
        id: 'local_4',
        level: 'A2',
        type: 'multiple-choice',
        questionText: { en: 'Which season comes after summer?', vi: 'Mùa nào đến sau mùa hè?' },
        correctAnswer: 'autumn',
        options: ['spring', 'autumn', 'winter', 'summer'],
        pointsValue: 15
      },
      {
        id: 'local_5',
        level: 'A2',
        type: 'multiple-choice',
        questionText: { en: 'What do you use to write on paper?', vi: 'Bạn dùng gì để viết trên giấy?' },
        correctAnswer: 'pen',
        options: ['pen', 'fork', 'book', 'phone'],
        pointsValue: 15
      },
      {
        id: 'local_6',
        level: 'B1',
        type: 'multiple-choice',
        questionText: { en: 'What is the capital of England?', vi: 'Thủ đô của nước Anh là gì?' },
        correctAnswer: 'london',
        options: ['paris', 'london', 'berlin', 'madrid'],
        pointsValue: 20
      },
      {
        id: 'local_7',
        level: 'B1',
        type: 'multiple-choice',
        questionText: { en: 'Which planet is closest to the Sun?', vi: 'Hành tinh nào gần Mặt Trời nhất?' },
        correctAnswer: 'mercury',
        options: ['venus', 'mercury', 'earth', 'mars'],
        pointsValue: 20
      },
      {
        id: 'local_8',
        level: 'A1',
        type: 'text-input',
        questionText: { en: 'Complete the sentence: "The sun is ___."', vi: 'Hoàn thành câu: "Mặt trời ___."' },
        correctAnswer: 'bright',
        pointsValue: 10
      },
      {
        id: 'local_9',
        level: 'A2',
        type: 'text-input',
        questionText: { en: 'What is the opposite of "big"?', vi: 'Từ trái nghĩa của "to" là gì?' },
        correctAnswer: 'small',
        pointsValue: 15
      },
      {
        id: 'local_10',
        level: 'B1',
        type: 'text-input',
        questionText: { en: 'What is the past tense of "go"?', vi: 'Thì quá khứ của "đi" là gì?' },
        correctAnswer: 'went',
        pointsValue: 20
      }
    ];

    return questions[questionNumber - 1] || null;
  }

  getExplanationForQuestion(questionNumber) {
    const explanations = {
      1: 'The sky appears blue due to light scattering in the atmosphere.',
      2: 'There are seven days in a week: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, and Sunday.',
      3: 'The opposite of "hot" is "cold". Hot means high temperature, cold means low temperature.',
      4: 'The seasons in order are: spring, summer, autumn, winter. Autumn comes after summer.',
      5: 'A pen is a writing instrument used to write on paper.',
      6: 'London is the capital city of England and the United Kingdom.',
      7: 'Mercury is the closest planet to the Sun in our solar system.',
      8: 'The sun is bright because it emits light and heat.',
      9: 'The opposite of "big" is "small". Big means large in size, small means little in size.',
      10: 'The past tense of "go" is "went". For example: I go to school (present) → I went to school (past).'
    };

    return explanations[questionNumber] || 'This is the correct answer.';
  }

  async loadPersistedStates() {
    try {
      const stored = await chrome.storage.local.get(['tabStates', 'tabTimers']);
      
      if (stored.tabStates) {
        for (const [tabId, state] of Object.entries(stored.tabStates)) {
          this.tabStates.set(parseInt(tabId), state);
        }
      }

      if (stored.tabTimers) {
        for (const [tabId, timer] of Object.entries(stored.tabTimers)) {
          // Recreate alarms for active timers
          const timerId = parseInt(tabId);
          const timeLeft = timer.scheduledTime - Date.now();
          
          if (timeLeft > 0) {
            if (timer.type === 'periodic') {
              chrome.alarms.create(timer.alarmName, {
                delayInMinutes: timeLeft / 60000
              });
            } else if (timer.type === 'penalty') {
              chrome.alarms.create(timer.alarmName, {
                delayInMinutes: timeLeft / 60000
              });
            }
            this.tabTimers.set(timerId, timer);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load persisted states:', error);
    }
  }

  async persistStates() {
    try {
      const tabStatesObj = {};
      const tabTimersObj = {};

      for (const [tabId, state] of this.tabStates) {
        tabStatesObj[tabId] = state;
      }

      for (const [tabId, timer] of this.tabTimers) {
        tabTimersObj[tabId] = timer;
      }

      await chrome.storage.local.set({
        tabStates: tabStatesObj,
        tabTimers: tabTimersObj
      });
    } catch (error) {
      console.error('Failed to persist states:', error);
    }
  }

  async handleExtensionStartup() {
    console.log('Extension startup detected');
    await this.loadPersistedStates();
  }

  async handleExtensionInstalled(details) {
    console.log('Extension installed:', details.reason);
    
    if (details.reason === 'install') {
      // First time installation
      chrome.tabs.create({
        url: chrome.runtime.getURL('options/options.html')
      });
    }
  }



  async getStats() {
    try {
      let stats = {
        totalPoints: 0,
        currentStreak: 0,
        longestStreak: 0,
        questionsAnswered: 0,
        correctAnswers: 0,
        accuracyRate: 0,
        currentLevel: 1,
        levelName: 'Beginner',
        levelProgress: 0,
        pointsToNextLevel: 500
      };

      // Background script doesn't have access to Supabase (service worker limitation)
      // Stats will be handled by popup and content scripts
      if (false) { // Disabled for service worker
        try {
          const userProfile = null; // await supabaseClient.getUserProfile();
          if (userProfile && userProfile.profile) {
            const profile = userProfile.profile;
            
            stats.totalPoints = profile.gamification?.total_points || 0;
            stats.currentStreak = profile.gamification?.current_streak || 0;
            stats.longestStreak = profile.gamification?.longest_streak || 0;
            stats.currentLevel = profile.gamification?.current_level || 1;
            
            stats.questionsAnswered = profile.statistics?.total_questions_answered || 0;
            stats.correctAnswers = profile.statistics?.total_correct_answers || 0;
            
            if (stats.questionsAnswered > 0) {
              stats.accuracyRate = Math.round((stats.correctAnswers / stats.questionsAnswered) * 100);
            }

            // Calculate level progress
            const levelThresholds = [0, 500, 1500, 3500, 7000, 13000];
            const currentLevelIndex = Math.min(stats.currentLevel - 1, levelThresholds.length - 1);
            const currentLevelMin = levelThresholds[currentLevelIndex];
            const nextLevelMin = levelThresholds[Math.min(currentLevelIndex + 1, levelThresholds.length - 1)];
            
            stats.pointsToNextLevel = nextLevelMin;
            if (nextLevelMin > currentLevelMin) {
              stats.levelProgress = Math.round(((stats.totalPoints - currentLevelMin) / (nextLevelMin - currentLevelMin)) * 100);
            }

            // Level names
            const levelNames = ['Beginner', 'Elementary', 'Intermediate', 'Upper-Intermediate', 'Advanced', 'Expert'];
            stats.levelName = levelNames[Math.min(stats.currentLevel - 1, levelNames.length - 1)];
          }
        } catch (dbError) {
          console.warn('Failed to get stats from database, using offline data:', dbError);
        }
      }

      // Fallback to offline data if no database stats
      if (stats.totalPoints === 0 && window.offlineManager) {
        try {
          const offlineStats = await window.offlineManager.getStats();
          stats = { ...stats, ...offlineStats };
        } catch (offlineError) {
          console.warn('Failed to get offline stats:', offlineError);
        }
      }

      return stats;
    } catch (error) {
      console.error('Error getting stats:', error);
      return {
        totalPoints: 0,
        currentStreak: 0,
        longestStreak: 0,
        questionsAnswered: 0,
        correctAnswers: 0,
        accuracyRate: 0,
        currentLevel: 1,
        levelName: 'Beginner',
        levelProgress: 0,
        pointsToNextLevel: 500
      };
    }
  }

  async getAchievements() {
    try {
      // Since background script can't access gamificationManager directly,
      // we'll return the achievements data structure that matches what the gamificationManager provides
      
      // Try to get achievements from storage first
      let achievements = {};
      let unlockedAchievements = [];
      
      try {
        const stored = await chrome.storage.local.get(['unlockedAchievements', 'userStats']);
        unlockedAchievements = stored.unlockedAchievements || [];
        
        // Initialize achievements with unlock status
        achievements = this.initializeAchievementsData(unlockedAchievements, stored.userStats);
      } catch (error) {
        console.warn('Failed to load achievements from storage:', error);
        achievements = this.initializeAchievementsData([], null);
      }

      return achievements;
    } catch (error) {
      console.error('Error getting achievements:', error);
      return {};
    }
  }

  initializeAchievementsData(unlockedAchievements = [], userStats = null) {
    const achievements = {
      first_correct: {
        id: 'first_correct',
        name: 'First Success',
        description: 'Answer your first question correctly',
        icon: '🎯',
        points: 50,
        unlocked: unlockedAchievements.includes('first_correct')
      },
      streak_3: {
        id: 'streak_3',
        name: '3-Day Streak',
        description: 'Answer questions correctly for 3 consecutive days',
        icon: '🔥',
        points: 100,
        unlocked: unlockedAchievements.includes('streak_3')
      },
      streak_7: {
        id: 'streak_7',
        name: 'Week Warrior',
        description: 'Answer questions correctly for 7 consecutive days',
        icon: '⚔️',
        points: 250,
        unlocked: unlockedAchievements.includes('streak_7')
      },
      streak_30: {
        id: 'streak_30',
        name: 'Monthly Master',
        description: 'Answer questions correctly for 30 consecutive days',
        icon: '👑',
        points: 1000,
        unlocked: unlockedAchievements.includes('streak_30')
      },
      perfect_10: {
        id: 'perfect_10',
        name: 'Perfect Ten',
        description: 'Answer 10 questions in a row correctly',
        icon: '💯',
        points: 200,
        unlocked: unlockedAchievements.includes('perfect_10')
      },
      accuracy_master: {
        id: 'accuracy_master',
        name: 'Accuracy Master',
        description: 'Maintain 90% accuracy over 50 questions',
        icon: '🎯',
        points: 300,
        unlocked: unlockedAchievements.includes('accuracy_master')
      },
      century_club: {
        id: 'century_club',
        name: 'Century Club',
        description: 'Answer 100 questions correctly',
        icon: '💪',
        points: 500,
        unlocked: unlockedAchievements.includes('century_club')
      },
      millennium_master: {
        id: 'millennium_master',
        name: 'Millennium Master',
        description: 'Answer 1000 questions correctly',
        icon: '🏆',
        points: 2000,
        unlocked: unlockedAchievements.includes('millennium_master')
      },
      lightning_fast: {
        id: 'lightning_fast',
        name: 'Lightning Fast',
        description: 'Answer 10 questions correctly in under 5 seconds each',
        icon: '⚡',
        points: 400,
        unlocked: unlockedAchievements.includes('lightning_fast')
      },
      level_up_2: {
        id: 'level_up_2',
        name: 'Rising Star',
        description: 'Reach Level 2',
        icon: '⭐',
        points: 100,
        unlocked: unlockedAchievements.includes('level_up_2')
      },
      level_up_5: {
        id: 'level_up_5',
        name: 'Language Expert',
        description: 'Reach Level 5',
        icon: '🎓',
        points: 1000,
        unlocked: unlockedAchievements.includes('level_up_5')
      }
    };

    return achievements;
  }
}

// Initialize background manager
const backgroundManager = new BackgroundManager();

// Persist states periodically
setInterval(() => {
  backgroundManager.persistStates();
}, 60000); // Every minute


