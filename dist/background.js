/**
 * Background service worker for VocabBreak extension
 * Handles tab tracking, question scheduling, and cross-component communication
 * Refactored to use consolidated CoreManager and QuestionBank
 */

// Background script no longer manages questions - all questions come from Supabase/cache
// Questions are handled entirely by content scripts with Supabase integration

class BackgroundManager {
  constructor() {
    this.tabTimers = new Map(); // tabId -> timer info
    this.tabStates = new Map(); // tabId -> state info
    this.periodicInterval = 30 * 60 * 1000; // default 30 minutes in milliseconds
    this.wrongAnswerPenalty = 30 * 1000; // default 30 seconds in milliseconds
    this.tabPenaltyTimeouts = new Map(); // tabId -> timeoutId
    this.blockingMode = 'blacklist';
    this.siteList = [];
    this.defaultExclusions = [
      'chrome://*',
      'chrome-extension://*',
      'moz-extension://*',
      'edge://*',
      'about:*',
      'file://*',
      'localhost',
      'localhost:*',
      '127.0.0.1',
      '127.0.0.1:*',
      '*.local',
      'chrome.google.com/webstore*',
      'addons.mozilla.org*',
      'microsoftedge.microsoft.com*'
    ];
    this.isInitialized = false;
    
    console.log('🔧 BackgroundManager constructor called, interval =', this.periodicInterval / 60000, 'minutes');
    this.init();
  }

  async init() {
    console.log('🚀 VocabBreak background script initializing...');
    
    // Set up event listeners
    this.setupEventListeners();

    // Load persisted timer settings (interval/penalty)
    await this.loadTimerSettings();
    
    // Load persisted timer states
    await this.loadPersistedStates();
    
    // Initialize existing tabs
    await this.initializeExistingTabs();
    
    this.isInitialized = true;
    console.log('✅ VocabBreak background script initialized');
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

  async loadTimerSettings() {
    try {
      const stored = await chrome.storage.sync.get(['periodicInterval', 'penaltyDuration', 'blockingMode', 'siteList']);
      const periodicIntervalValue = Number(stored.periodicInterval);
      const penaltyValue = Number(stored.penaltyDuration);

      if (Number.isFinite(periodicIntervalValue) && periodicIntervalValue > 0) {
        this.periodicInterval = periodicIntervalValue * 60 * 1000;
      }
      if (Number.isFinite(penaltyValue) && penaltyValue > 0) {
        this.wrongAnswerPenalty = penaltyValue * 1000;
      }

      this.blockingMode = stored.blockingMode === 'whitelist' ? 'whitelist' : 'blacklist';
      this.siteList = Array.isArray(stored.siteList) ? stored.siteList : [];

      if (this.blockingMode === 'blacklist') {
        this.siteList = [...new Set([...this.siteList, ...this.defaultExclusions])];
      }

      console.log('⏱️ Loaded timer settings', {
        periodicMinutes: this.periodicInterval / 60000,
        penaltySeconds: this.wrongAnswerPenalty / 1000,
        blockingMode: this.blockingMode,
        siteListCount: this.siteList.length
      });
    } catch (error) {
      console.warn('Failed to load timer settings, using defaults', error);
    }
  }

  async initializeTab(tabId, url, urlChanged = true) {
    if (!url || !this.shouldBlockUrl(url)) {
      return;
    }

    // Check if tab already has a timer and URL didn't change (refresh case)
    if (this.tabTimers.has(tabId) && !urlChanged) {
      console.log(`⏭️ Skipping timer setup for tab ${tabId} - existing timer preserved for same URL`);
      return;
    }

    // Check if tab state already exists (preserve lastQuestionTime)
    let tabState = this.tabStates.get(tabId);
    
    if (!tabState || urlChanged) {
      // Create new tab state only if none exists OR URL changed
      // Set lastQuestionTime to trigger immediate question for new tabs/URLs
      const now = Date.now();
      tabState = {
        url: url,
        lastQuestionTime: now - this.periodicInterval - 1000, // Force immediate question
        questionCount: 0,
        isBlocked: false,
        blockReason: null,
        penaltyEndTime: 0
      };
      console.log(`🆕 Created NEW tab state for ${tabId}: lastQuestionTime set to trigger immediate question`);
    } else {
      // Update URL but preserve timing data (should rarely happen now)
      const oldLastQuestionTime = tabState.lastQuestionTime;
      tabState.url = url;
      console.log(`♻️ PRESERVED tab state for ${tabId}: lastQuestionTime = ${oldLastQuestionTime} (${Math.round((Date.now() - oldLastQuestionTime) / 1000)}s ago)`);
    }

    this.tabStates.set(tabId, tabState);

    // Set up periodic timer only if URL changed or no timer exists
    if (urlChanged || !this.tabTimers.has(tabId)) {
      console.log(`⏰ Setting up new timer for tab ${tabId}`);
      this.schedulePeriodicQuestion(tabId);
    } else {
      console.log(`⏰ Preserving existing timer for tab ${tabId}`);
    }

    // console.log(`Initialized tab ${tabId} for URL: ${url}`);
  }

  shouldBlockUrl(url) {
    if (!url) return false;

    const normalizedUrl = url.toLowerCase();

    if (this.matchesPatterns(normalizedUrl, this.defaultExclusions)) {
      return false;
    }

    const matchesUserList = this.matchesPatterns(normalizedUrl, this.siteList);

    if (this.blockingMode === 'whitelist') {
      return matchesUserList;
    }

    // blacklist mode: block unless the URL is explicitly excluded
    return !matchesUserList;
  }

  matchesPatterns(url, patterns = []) {
    if (!patterns || patterns.length === 0) return false;

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      const fullUrl = url.toLowerCase();

      return patterns.some((pattern) => {
        const normalizedPattern = (pattern || '').toLowerCase().trim();
        if (!normalizedPattern) return false;

        // Exact match
        if (normalizedPattern === fullUrl || normalizedPattern === hostname) {
          return true;
        }

        // Wildcard matching
        if (normalizedPattern.includes('*')) {
          const regexPattern = normalizedPattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*');
          const regex = new RegExp(`^${regexPattern}$`);
          return regex.test(fullUrl) || regex.test(hostname);
        }

        // Domain or substring matching
        if (hostname.includes(normalizedPattern) || normalizedPattern.includes(hostname)) {
          return true;
        }

        if (fullUrl.includes(normalizedPattern)) {
          return true;
        }

        return false;
      });
    } catch (error) {
      console.warn('Error matching URL patterns:', error);
      return false;
    }
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
      // Get existing tab state to check if URL actually changed
      const existingTabState = this.tabStates.get(tabId);
      const urlChanged = !existingTabState || existingTabState.url !== url;
      
      console.log(`📍 Tab ${tabId} updated: ${urlChanged ? 'URL CHANGED' : 'SAME URL (refresh)'} - ${url}`);
      
      // Only clear timer if URL actually changed (not on refresh)
      if (urlChanged) {
        console.log(`🗑️ Clearing timer for tab ${tabId} due to URL change`);
        this.clearTabTimer(tabId);
      } else {
        console.log(`⏰ Preserving existing timer for tab ${tabId} (same URL refresh)`);
      }

      if (!this.shouldBlockUrl(url)) {
        this.tabStates.delete(tabId);
        return;
      }

      // Initialize/update tab - preserve timing for same URL
      await this.initializeTab(tabId, url, urlChanged);

    } catch (error) {
      console.error('Failed to handle tab update:', error);
    }
  }

  handleTabRemoved(tabId) {
    this.clearTabTimer(tabId);
    this.clearTabPenaltyTimer(tabId);
    this.tabStates.delete(tabId);
    console.log(`Cleaned up tab ${tabId}`);
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.type) {
        case 'GET_QUESTION':
          // Background script no longer provides questions - all questions come from Supabase/cache
          console.warn('Background script question request - this should not happen in new architecture');
          sendResponse({ success: false, error: 'Questions should come from Supabase or cache only' });
          break;
        case 'AUTH_STATE_CHANGED':
          // Acknowledge auth state broadcasts to avoid noise
          sendResponse({ success: true });
          break;

        case 'SUBMIT_ANSWER':
          await this.handleAnswerSubmission(message, sender, sendResponse);
          break;

        case 'REQUEST_BLOCK_CHECK':
          const blockState = await this.getBlockState(sender.tab.id, sender.tab.url);
          sendResponse(blockState);
          break;

        case 'GET_TAB_STATE':
          const tabState = this.tabStates.get(sender.tab.id) || null;
          sendResponse({ tabState: tabState });
          break;

        case 'CLEAR_PENALTY':
          await this.clearTabPenalty(sender.tab.id);
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

        case 'TRIGGER_BLOCK_NOW':
          await this.triggerManualBlock();
          sendResponse({ success: true });
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

      // Use consolidated question bank for validation
      if (questionBank) {
        const validation = questionBank.validateAnswer(questionId, userAnswer);
        isCorrect = validation.isCorrect;
        correctAnswer = validation.correctAnswer;
        explanation = validation.explanation?.en || 'No explanation available.';
        pointsEarned = isCorrect ? validation.pointsValue : 0;
        
        if (isCorrect) {
          feedback = 'Correct! Well done!';
        } else {
          feedback = `Not quite right. The correct answer is: ${correctAnswer}`;
        }
      } else {
        // Fallback validation
        console.warn('Question bank not available for validation:', questionId);
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
          await this.applyTabPenalty(tabId, this.wrongAnswerPenalty);
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
        penaltyEndTime: this.globalPenalty.endTime || tabState?.penaltyEndTime || 0
      });

    } catch (error) {
      console.error('Failed to handle answer submission:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async getBlockState(tabId, url) {
    const isExcluded = !url || this.matchesPatterns(url, this.defaultExclusions);

    if (isExcluded || !this.shouldBlockUrl(url)) {
      return { shouldBlock: false, reason: null, penaltyEndTime: 0 };
    }

    const tabState = this.tabStates.get(tabId);
    if (!tabState) {
      console.log(`❌ No tab state found for ${tabId}, not blocking`);
      return { shouldBlock: false, reason: null, penaltyEndTime: 0 };
    }

    const timeSinceLastQuestion = Date.now() - tabState.lastQuestionTime;
    console.log(`🔍 Tab ${tabId} block check: timeSince=${Math.round(timeSinceLastQuestion/1000)}s, interval=${this.periodicInterval/1000}s, blocked=${tabState.isBlocked}, reason=${tabState.blockReason}`);

    return {
      shouldBlock: !!tabState.isBlocked,
      reason: tabState.blockReason || null,
      penaltyEndTime: tabState.penaltyEndTime || 0
    };
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
        func: (reasonParam) => {
          if (window.vocabBreakBlocker) {
            window.vocabBreakBlocker.showQuestion(reasonParam);
          }
        },
        args: [reason]
      });
    } catch (error) {
      console.error('Failed to trigger question display via executeScript:', error);
      // Fallback: ask content script to show the question if it is listening
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'SHOW_QUESTION', reason: reason });
      } catch (err) {
        console.warn('Fallback SHOW_QUESTION message failed:', err?.message || err);
      }
    }

    console.log(`Triggered question for tab ${tabId}, reason: ${reason}`);
  }

  async triggerManualBlock() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (!tab || !tab.id || !this.shouldBlockUrl(tab.url)) {
        console.warn('Manual block skipped: no active blockable tab');
        return;
      }
      const tabId = tab.id;
      const tabState = this.tabStates.get(tabId) || {
        url: tab.url,
        lastQuestionTime: Date.now() - this.periodicInterval - 1000,
        questionCount: 0,
        isBlocked: false,
        blockReason: null,
        penaltyEndTime: 0
      };
      tabState.isBlocked = true;
      tabState.blockReason = 'manual';
      this.tabStates.set(tabId, tabState);
      // Try message first (preferred)
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'SHOW_QUESTION', reason: 'manual' });
        console.log('📩 Sent SHOW_QUESTION to tab', tabId);
      } catch (err) {
        console.warn('SHOW_QUESTION message failed, trying executeScript:', err?.message || err);
        await this.triggerQuestion(tabId, 'manual');
      }
    } catch (error) {
      console.error('Failed to trigger manual block:', error);
    }
  }

  schedulePeriodicQuestion(tabId) {
    this.clearTabTimer(tabId);

    const scheduledTime = Date.now() + this.periodicInterval;
    const timeoutId = setTimeout(() => this.handlePeriodicTimer(tabId), this.periodicInterval);

    let alarmName = null;
    const delayInMinutes = this.periodicInterval / 60000;
    if (delayInMinutes >= 1) {
      alarmName = `vocabbreak_tab_${tabId}`;
      chrome.alarms.create(alarmName, { delayInMinutes });
    }

    this.tabTimers.set(tabId, {
      alarmName,
      type: 'periodic',
      scheduledTime,
      timeoutId
    });

    console.log(`Scheduled periodic question for tab ${tabId} in ${this.periodicInterval / 60000} minutes`);
  }

  async handlePeriodicTimer(tabId) {
    const timer = this.tabTimers.get(tabId);
    if (timer?.alarmName) {
      chrome.alarms.clear(timer.alarmName);
    }
    this.tabTimers.delete(tabId);

    const tabState = this.tabStates.get(tabId);
    if (!tabState || !this.shouldBlockUrl(tabState.url)) return;

    tabState.isBlocked = true;
    tabState.blockReason = 'periodic';
    this.tabStates.set(tabId, tabState);

    await this.triggerQuestion(tabId, 'periodic');
  }

  async applyTabPenalty(tabId, durationMs) {
    const tabState = this.tabStates.get(tabId);
    if (!tabState) return;

    tabState.isBlocked = true;
    tabState.blockReason = 'penalty';
    tabState.penaltyEndTime = Date.now() + durationMs;
    this.tabStates.set(tabId, tabState);

    this.scheduleTabPenaltyEnd(tabId, durationMs);

    // Notify the specific tab so the overlay shows the countdown
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'GLOBAL_PENALTY',
        penaltyEndTime: tabState.penaltyEndTime
      });
    } catch (error) {
      // Content script might not be ready; ignore
    }
  }

  scheduleTabPenaltyEnd(tabId, durationMs) {
    // Clear existing timeout/alarm for this tab
    this.clearTabPenaltyTimer(tabId);

    const timeoutId = setTimeout(() => {
      this.clearTabPenalty(tabId);
    }, durationMs);

    let alarmName = null;
    const minutes = durationMs / 60000;
    if (minutes >= 1) {
      alarmName = `vocabbreak_penalty_${tabId}`;
      chrome.alarms.create(alarmName, { delayInMinutes: minutes });
    }

    this.tabPenaltyTimeouts.set(tabId, { timeoutId, alarmName });
  }

  clearTabPenaltyTimer(tabId) {
    const entry = this.tabPenaltyTimeouts.get(tabId);
    if (!entry) return;
    if (entry.timeoutId) clearTimeout(entry.timeoutId);
    if (entry.alarmName) chrome.alarms.clear(entry.alarmName);
    this.tabPenaltyTimeouts.delete(tabId);
  }

  async clearTabPenalty(tabId) {
    this.clearTabPenaltyTimer(tabId);
    const tabState = this.tabStates.get(tabId);
    if (!tabState) return;

    tabState.isBlocked = false;
    tabState.blockReason = null;
    tabState.penaltyEndTime = 0;
    tabState.lastQuestionTime = Date.now();
    this.tabStates.set(tabId, tabState);

    this.schedulePeriodicQuestion(tabId);

    try {
      await chrome.tabs.sendMessage(tabId, { type: 'PENALTY_CLEARED' });
    } catch (error) {
      // Ignore if content script not available
    }
  }

  clearTabTimer(tabId) {
    const timer = this.tabTimers.get(tabId);
    if (timer) {
      if (timer.timeoutId) {
        clearTimeout(timer.timeoutId);
      }
      if (timer.alarmName) {
        chrome.alarms.clear(timer.alarmName);
      }
      this.tabTimers.delete(tabId);
    }
  }

  async broadcastToAllTabs(message) {
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.url && !tab.url.startsWith('chrome://')) {
          try {
            await chrome.tabs.sendMessage(tab.id, message);
          } catch (error) {
            // Content script may not be injected; ignore
          }
        }
      }
    } catch (error) {
      console.warn('Failed to broadcast message to tabs', error);
    }
  }

  async handleAlarm(alarm) {
    const alarmName = alarm.name;
    
    if (alarmName.startsWith('vocabbreak_tab_')) {
      const tabId = parseInt(alarmName.replace('vocabbreak_tab_', ''));

      const timer = this.tabTimers.get(tabId);
      // If the timeout already handled it, skip
      if (!timer || timer.type !== 'periodic') {
        return;
      }

      const timeRemaining = (timer.scheduledTime || 0) - Date.now();
      if (timeRemaining > 2000) {
        // setTimeout will fire closer to the target time
        return;
      }

      await this.handlePeriodicTimer(tabId);
    } else if (alarmName.startsWith('vocabbreak_penalty_')) {
      const tabId = parseInt(alarmName.replace('vocabbreak_penalty_', ''));
      await this.clearTabPenalty(tabId);
    }
  }

  async handleSettingsUpdate(settings) {
    console.log('🔧 Background script received settings update:', settings);
    
    // Update periodic interval if changed
    if (Number.isFinite(Number(settings.periodicInterval)) && Number(settings.periodicInterval) > 0) {
      this.periodicInterval = Number(settings.periodicInterval) * 60 * 1000; // Convert minutes to milliseconds
    }

    if (Number.isFinite(Number(settings.penaltyDuration)) && Number(settings.penaltyDuration) > 0) {
      this.wrongAnswerPenalty = Number(settings.penaltyDuration) * 1000; // Convert seconds to milliseconds
    }

    if (settings.blockingMode) {
      this.blockingMode = settings.blockingMode === 'whitelist' ? 'whitelist' : 'blacklist';
    }

    const incomingSiteList = Array.isArray(settings.siteList) ? settings.siteList : this.siteList;
    this.siteList = this.blockingMode === 'blacklist'
      ? [...new Set([...incomingSiteList, ...this.defaultExclusions])]
      : incomingSiteList;

    // Store settings in chrome storage for content scripts to access
    try {
      await chrome.storage.sync.set({
        difficultyLevels: settings.difficultyLevels,
        questionTypes: settings.questionTypes,
        topics: settings.topics,
        periodicInterval: settings.periodicInterval,
        penaltyDuration: settings.penaltyDuration,
        blockingMode: this.blockingMode,
        siteList: incomingSiteList
      });
      console.log('✅ Settings saved to chrome storage');
    } catch (error) {
      console.error('❌ Failed to save settings to storage:', error);
    }

    // Notify all content scripts that settings changed so they can refresh their cache
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.url && !tab.url.startsWith('chrome://')) {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              type: 'SETTINGS_CHANGED',
              settings: settings
            });
          } catch (error) {
            // Tab might not have content script loaded
            console.log(`Could not notify tab ${tab.id} about settings change`);
          }
        }
      }
    } catch (error) {
      console.error('Failed to notify tabs about settings change:', error);
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
          if (state.url && !this.shouldBlockUrl(state.url)) {
            continue;
          }
          // Fix for existing broken states: if lastQuestionTime is 0, set it to now
          if (state.lastQuestionTime === 0) {
            state.lastQuestionTime = Date.now();
            console.log(`🔧 Fixed broken tab state ${tabId}: set lastQuestionTime to now`);
          }
          this.tabStates.set(parseInt(tabId), state);
        }
      }

      if (stored.tabTimers) {
        for (const [tabId, timer] of Object.entries(stored.tabTimers)) {
          const timerId = parseInt(tabId);
          const timeLeft = (timer.scheduledTime || 0) - Date.now();
          
          if (timeLeft > 0) {
            let alarmName = null;
            const minutesLeft = timeLeft / 60000;
            if (minutesLeft >= 1) {
              alarmName = `vocabbreak_tab_${timerId}`;
              chrome.alarms.create(alarmName, { delayInMinutes: minutesLeft });
            }

            const timeoutId = setTimeout(() => this.handlePeriodicTimer(timerId), timeLeft);

            this.tabTimers.set(timerId, {
              alarmName,
              scheduledTime: Date.now() + timeLeft,
              timeoutId,
              type: timer.type || 'periodic'
            });
          }
        }
      }

      // Recreate penalty timers for tabs still under penalty
      for (const [tabId, state] of this.tabStates.entries()) {
        if (state.penaltyEndTime && state.penaltyEndTime > Date.now()) {
          this.scheduleTabPenaltyEnd(tabId, state.penaltyEndTime - Date.now());
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
        tabTimersObj[tabId] = {
          type: timer.type,
          scheduledTime: timer.scheduledTime
        };
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
      // Note: User statistics are managed by popup and content scripts that have Supabase access

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
console.log('🚀 VocabBreak background script starting up...');
const backgroundManager = new BackgroundManager();

// Persist states periodically
setInterval(() => {
  backgroundManager.persistStates();
}, 60000); // Every minute


