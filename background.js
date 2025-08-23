/**
 * Background service worker for VocabBreak extension
 * Handles tab tracking, question scheduling, and cross-component communication
 */

// Import shared modules for service worker
// Load supabase client dynamically since service workers can't use CDN directly
let supabaseClient = null;

// Initialize Supabase client for background script
async function initializeSupabase() {
  try {
    // Import supabase client dynamically
    const module = await import('./shared/supabase-client.js');
    if (typeof SupabaseClient !== 'undefined') {
      supabaseClient = new SupabaseClient();
      console.log('✅ Supabase client initialized in background');
    }
  } catch (error) {
    console.warn('⚠️ Supabase client not available in background:', error);
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

      // Check if this is a new site visit
      const existingState = this.tabStates.get(tabId);
      const isNewSite = !existingState || existingState.url !== url;

      if (isNewSite) {
        // Trigger immediate question for new site
        await this.triggerQuestion(tabId, 'new_site');
      }

      // Initialize/update tab
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
            // Try to get question from Supabase first
            let question = null;
            
            if (supabaseClient && supabaseClient.isAuthenticated()) {
              question = await supabaseClient.getRandomQuestion({
                level: ['A1', 'A2', 'B1'], // User's difficulty levels
                limit: 1
              });
            }
            
            // Fallback to question manager if no database question
            if (!question && window.questionManager) {
              question = await window.questionManager.getNextQuestion();
            }
            
            // Last resort: sample question
            if (!question) {
              question = {
                id: 'sample_' + Date.now(),
                level: 'A1',
                type: 'multiple-choice',
                questionText: { en: 'What color is the sky?', vi: 'Bầu trời có màu gì?' },
                correctAnswer: 'blue',
                options: ['red', 'blue', 'green', 'yellow'],
                pointsValue: 10
              };
            }
            
            sendResponse({ success: true, question: question });
          } catch (error) {
            console.error('Error getting question:', error);
            // Fallback to sample question on error
            const sampleQuestion = {
              id: 'sample_' + Date.now(),
              level: 'A1',
              type: 'multiple-choice',
              questionText: { en: 'What color is the sky?', vi: 'Bầu trời có màu gì?' },
              correctAnswer: 'blue',
              options: ['red', 'blue', 'green', 'yellow'],
              pointsValue: 10
            };
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
      // Simple validation - in production this would use questionManager
      const isCorrect = userAnswer.toLowerCase() === 'blue';
      const pointsEarned = isCorrect ? 10 : 0;

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
          correctAnswer: 'blue',
          explanation: 'The sky appears blue due to light scattering.',
          feedback: isCorrect ? 'Correct! Well done!' : 'Not quite right. The correct answer is: blue'
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

  async handleAnswerSubmission(message, sender, sendResponse) {
    try {
      const { questionId, userAnswer, timeTaken } = message;
      
      // For now, we'll use simple validation since we don't have the full database setup
      // In production, this would validate against the actual question from the database
      
      // Get the current question for validation
      // This is a simplified approach - in production you'd store the question temporarily
      // or fetch it from database using questionId
      let correctAnswer = 'blue'; // Default for sample question
      let isCorrect = false;

      // Try to get the correct answer from the question (if available)
      // For now, we'll use a simple validation, but this should be improved
      // to handle different question types and formats
      if (userAnswer.toLowerCase() === correctAnswer.toLowerCase()) {
        isCorrect = true;
      }
      
      const validation = {
        isCorrect: isCorrect,
        correctAnswer: 'blue',
        feedback: isCorrect ? '🎉 Correct! Well done!' : '❌ Incorrect. The correct answer is "blue".',
        explanation: isCorrect ? 'Great job! You got it right.' : 'The sky appears blue due to light scattering.'
      };

      const pointsEarned = isCorrect ? 10 : 0;
      const currentStreak = isCorrect ? 1 : 0; // Simplified streak calculation

      // In production, record this in the database via supabaseClient
      if (supabaseClient && supabaseClient.isAuthenticated()) {
        try {
          await supabaseClient.recordInteraction({
            type: 'question_answer',
            targetId: questionId,
            correct: isCorrect,
            timeTaken: timeTaken,
            pointsEarned: pointsEarned,
            streakAtTime: currentStreak,
            answerGiven: userAnswer
          });
        } catch (dbError) {
          console.warn('Failed to record in database:', dbError);
        }
      }

      // Update tab state
      const tabId = sender.tab.id;
      const tabState = this.tabStates.get(tabId) || {};
      tabState.lastAnswerCorrect = isCorrect;
      tabState.questionsAnswered = (tabState.questionsAnswered || 0) + 1;
      tabState.correctAnswers = (tabState.correctAnswers || 0) + (isCorrect ? 1 : 0);
      this.tabStates.set(tabId, tabState);

      if (isCorrect) {
        // Correct answer - allow access
        sendResponse({ 
          success: true, 
          validation: validation,
          pointsEarned: pointsEarned,
          action: 'allow_access'
        });
      } else {
        // Wrong answer - start penalty timer
        await this.startPenaltyTimer(tabId);
        sendResponse({ 
          success: true, 
          validation: validation,
          pointsEarned: pointsEarned,
          action: 'start_penalty'
        });
      }

    } catch (error) {
      console.error('Error handling answer submission:', error);
      sendResponse({ 
        success: false, 
        error: 'Failed to process answer',
        validation: {
          isCorrect: false,
          feedback: 'An error occurred while processing your answer.',
          explanation: 'Please try again.'
        }
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

      // Try to get stats from Supabase if authenticated
      if (supabaseClient && supabaseClient.isAuthenticated()) {
        try {
          const userProfile = await supabaseClient.getUserProfile();
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
}

// Initialize background manager
const backgroundManager = new BackgroundManager();

// Persist states periodically
setInterval(() => {
  backgroundManager.persistStates();
}, 60000); // Every minute


