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
    this.initPromise = null; // Promise that resolves when init is complete
    
    this.initPromise = this.init();
  }
  
  // Wait for initialization to complete (called by event handlers)
  async waitForInit() {
    if (this.isInitialized) {
      return;
    }
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  async init() {
    
    try {
      // CRITICAL: Load persisted states FIRST before setting up event listeners
      // This prevents race conditions where tab events fire before state is loaded
      
      // Load persisted timer settings (interval/penalty)
      await this.loadTimerSettings();
      
      // Load persisted timer states (must complete before handling events)
      await this.loadPersistedStates();
      
      // Now set up event listeners (state is ready)
      this.setupEventListeners();
      
      // Initialize existing tabs
      await this.initializeExistingTabs();
      
      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize BackgroundManager:', error);
      // Still mark as initialized to prevent infinite waiting
      this.isInitialized = true;
    }
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
          // Check if we already have persisted state for this tab
          const existingState = this.tabStates.get(tab.id);
          
          // Check elapsed time and handle question timing for this tab
          await this.handleTabActivity(tab.id, tab.url);
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
      await this.waitForInit();
      const tab = await chrome.tabs.get(tabId);
      if (tab.url) {
        await this.handleTabActivity(tabId, tab.url);
      }
    } catch (error) {
      console.error('Failed to handle tab activation:', error);
    }
  }

  async handleTabActivity(tabId, url) {
    if (!url || !this.shouldBlockUrl(url)) {
      return;
    }

    // Get or create tab state
    let tabState = this.tabStates.get(tabId);
    if (!tabState) {
      // New tab - force immediate question
      tabState = {
        url: url,
        lastQuestionTime: Date.now() - this.periodicInterval - 1000, // Force immediate question
        questionCount: 0,
        isBlocked: false,
        blockReason: null,
        penaltyEndTime: 0
      };
      this.tabStates.set(tabId, tabState);
    }

    // Check if enough time has passed for a question
    const now = Date.now();
    const timeSinceLastQuestion = now - tabState.lastQuestionTime;

    if (timeSinceLastQuestion >= this.periodicInterval && !tabState.isBlocked) {
      // Enough time has passed - trigger question immediately
      tabState.isBlocked = true;
      tabState.blockReason = 'periodic';
      this.tabStates.set(tabId, tabState);
      await this.persistStates();
      await this.triggerQuestion(tabId, 'periodic');
    } else if (!this.tabTimers.has(tabId)) {
      // Schedule timer for remaining time
      const timeRemaining = this.periodicInterval - timeSinceLastQuestion;
      this.schedulePeriodicQuestion(tabId);
    }
  }

  async handleTabUpdated(tabId, url) {
    try {
      // CRITICAL: Wait for initialization to complete before handling tab updates
      // This prevents race conditions where persisted state hasn't loaded yet
      await this.waitForInit();
      
      // Get existing tab state to check if URL actually changed
      const existingTabState = this.tabStates.get(tabId);
      
      // Normalize URLs for comparison (remove trailing slashes, handle query params)
      const normalizeUrl = (u) => {
        try {
          const parsed = new URL(u);
          // Compare origin + pathname (ignore query and hash for refresh detection)
          return parsed.origin + parsed.pathname.replace(/\/$/, '');
        } catch {
          return u;
        }
      };
      
      const normalizedExisting = existingTabState ? normalizeUrl(existingTabState.url) : null;
      const normalizedNew = normalizeUrl(url);
      const urlChanged = !existingTabState || normalizedExisting !== normalizedNew;
      
      if (existingTabState) {
      }
      
      if (!this.shouldBlockUrl(url)) {
        this.tabStates.delete(tabId);
        this.clearTabTimer(tabId);
        return;
      }

      // Handle URL changes
      if (urlChanged) {
        this.clearTabTimer(tabId);

        // Update tab state URL but preserve lastQuestionTime for new URL
        let tabState = this.tabStates.get(tabId);
        if (tabState) {
          tabState.url = url;
          this.tabStates.set(tabId, tabState);
        }
      }

      // Check elapsed time and handle question timing
      await this.handleTabActivity(tabId, url);

    } catch (error) {
      console.error('Failed to handle tab update:', error);
    }
  }

  handleTabRemoved(tabId) {
    this.clearTabTimer(tabId);
    this.clearTabPenaltyTimer(tabId);
    this.tabStates.delete(tabId);
    
    // Clean up persisted timer state for closed tabs
    this.persistStates();
    
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      // Wait for initialization before handling messages
      await this.waitForInit();
      
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

        case 'CHECK_AUTH_STATUS':
          const authStatus = await this.getAuthStatus();
          sendResponse(authStatus);
          break;

        case 'TRIGGER_BLOCK_NOW':
          const triggerResult = await this.triggerManualBlock();
          sendResponse(triggerResult);
          break;

        case 'QUESTION_ANSWERED':
          // Handle answer result from content script (for Supabase questions validated locally)
          await this.handleQuestionAnswered(message, sender);
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

  async handleQuestionAnswered(message, sender) {
    // Called when content script validates a Supabase question locally
    const { questionId, isCorrect, timeTaken } = message;
    const tabId = sender.tab?.id;
    
    if (!tabId) {
      console.warn('⚠️ QUESTION_ANSWERED: No tab ID in sender');
      return;
    }
    
    
    const tabState = this.tabStates.get(tabId);
    if (!tabState) {
      console.warn(`⚠️ No tab state for ${tabId}, creating one`);
      // Create a new state if none exists
      const tab = await chrome.tabs.get(tabId);
      this.tabStates.set(tabId, {
        url: tab.url,
        lastQuestionTime: Date.now(),
        questionCount: 1,
        isBlocked: false,
        blockReason: null,
        penaltyEndTime: 0
      });
    } else {
      // Update existing state
      tabState.lastQuestionTime = Date.now();
      tabState.questionCount++;
      
      if (isCorrect) {
        tabState.isBlocked = false;
        tabState.blockReason = null;
        tabState.penaltyEndTime = 0;
        
        // Reschedule the periodic question timer
        this.schedulePeriodicQuestion(tabId);
      } else {
        tabState.isBlocked = true;
        tabState.blockReason = 'wrong_answer';
        tabState.penaltyEndTime = Date.now() + this.wrongAnswerPenalty;
        await this.applyTabPenalty(tabId, this.wrongAnswerPenalty);
      }
    }
    
    // Persist state immediately
    await this.persistStates();
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
        
        // CRITICAL: Persist state immediately so lastQuestionTime survives service worker suspension
        await this.persistStates();
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
      return { shouldBlock: false, reason: null, penaltyEndTime: 0, timeSinceLastQuestion: 0 };
    }

    const tabState = this.tabStates.get(tabId);
    if (!tabState) {
      return { shouldBlock: false, reason: null, penaltyEndTime: 0, timeSinceLastQuestion: 0 };
    }

    const now = Date.now();
    const timeSinceLastQuestion = now - tabState.lastQuestionTime;
    
    // DECISION 1: Time-based blocking check (not just flag-based)
    // Check if enough time has elapsed since last question
    const timeElapsed = timeSinceLastQuestion >= this.periodicInterval;
    
    // Check if penalty is still active
    const penaltyActive = tabState.penaltyEndTime && tabState.penaltyEndTime > now;
    
    // Determine if we should block:
    // 1. If penalty is active, show penalty overlay
    // 2. If time has elapsed since last question, show question
    // 3. If explicitly marked as blocked (manual trigger), show question
    let shouldBlock = false;
    let reason = null;
    
    if (penaltyActive) {
      shouldBlock = true;
      reason = 'penalty';
    } else if (timeElapsed) {
      shouldBlock = true;
      reason = 'periodic';
      // Also update the tab state to reflect blocking
      tabState.isBlocked = true;
      tabState.blockReason = 'periodic';
    } else if (tabState.isBlocked) {
      shouldBlock = true;
      reason = tabState.blockReason || 'manual';
    }

    return {
      shouldBlock: shouldBlock,
      reason: reason,
      penaltyEndTime: tabState.penaltyEndTime || 0,
      timeSinceLastQuestion: timeSinceLastQuestion
    };
  }

  async triggerQuestion(tabId, reason) {
    const tabState = this.tabStates.get(tabId);
    if (!tabState) {
      console.warn(`⚠️ Cannot trigger question for tab ${tabId}: no tab state`);
      return;
    }

    tabState.isBlocked = true;
    tabState.blockReason = reason;
    this.tabStates.set(tabId, tabState);

    // Try message first (preferred, more reliable)
    let messageSuccess = false;
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'SHOW_QUESTION', reason: reason });
      if (response && response.success) {
        messageSuccess = true;
      }
    } catch (err) {
      console.warn(`⚠️ SHOW_QUESTION message failed for tab ${tabId}:`, err?.message || err);
    }

    // Fallback: use executeScript if message failed
    if (!messageSuccess) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: (reasonParam) => {
            if (window.vocabBreakBlocker) {
              window.vocabBreakBlocker.showQuestion(reasonParam);
            } else {
              console.error('VocabBreak blocker not available');
            }
          },
          args: [reason]
        });
      } catch (error) {
        console.error(`❌ Failed to trigger question display for tab ${tabId}:`, error);
      }
    }
  }

  async triggerManualBlock() {
    
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      
      if (!tab || !tab.id) {
        console.warn('⚠️ Manual block skipped: no active tab');
        return { success: false, error: 'No active tab' };
      }
      
      if (!this.shouldBlockUrl(tab.url)) {
        console.warn(`⚠️ Manual block skipped: tab ${tab.id} URL is excluded: ${tab.url?.substring(0, 50)}`);
        return { success: false, error: 'Current site is excluded from blocking' };
      }
      
      const tabId = tab.id;
      
      // Get or create tab state
      let tabState = this.tabStates.get(tabId);
      if (!tabState) {
        tabState = {
          url: tab.url,
          lastQuestionTime: Date.now() - this.periodicInterval - 1000,
          questionCount: 0,
          isBlocked: false,
          blockReason: null,
          penaltyEndTime: 0
        };
      }
      
      // Clear any pending timer since we're manually triggering
      this.clearTabTimer(tabId);
      
      tabState.isBlocked = true;
      tabState.blockReason = 'manual';
      this.tabStates.set(tabId, tabState);
      
      // Trigger the question
      await this.triggerQuestion(tabId, 'manual');
      
      return { success: true };
      
    } catch (error) {
      console.error('❌ Failed to trigger manual block:', error);
      return { success: false, error: error.message };
    }
  }

  schedulePeriodicQuestion(tabId) {
    // DECISION 2: Hybrid Timer Strategy (setTimeout + chrome.alarms)
    this.clearTabTimer(tabId);

    const now = Date.now();
    const scheduledTime = now + this.periodicInterval;
    
    // setTimeout for precision (handles short intervals accurately)
    const timeoutId = setTimeout(() => this.handlePeriodicTimer(tabId), this.periodicInterval);

    // chrome.alarms for persistence (survives service worker suspension)
    // Minimum 1 minute for chrome.alarms, but we use setTimeout for < 1 minute
    let alarmName = null;
    const delayInMinutes = Math.max(1, Math.ceil(this.periodicInterval / 60000));
    alarmName = `vocabbreak_tab_${tabId}`;
    chrome.alarms.create(alarmName, { delayInMinutes });

    this.tabTimers.set(tabId, {
      alarmName,
      type: 'periodic',
      scheduledTime,
      timeoutId
    });

    // Persist timer state immediately for service worker suspension recovery
    this.persistStates();

  }

  async handlePeriodicTimer(tabId) {
    
    const timer = this.tabTimers.get(tabId);
    if (timer?.alarmName) {
      chrome.alarms.clear(timer.alarmName);
    }
    if (timer?.timeoutId) {
      clearTimeout(timer.timeoutId);
    }
    this.tabTimers.delete(tabId);

    const tabState = this.tabStates.get(tabId);
    if (!tabState) {
      return;
    }
    
    if (!this.shouldBlockUrl(tabState.url)) {
      return;
    }

    // Verify time has actually elapsed (handles race conditions and alarm inaccuracy)
    const now = Date.now();
    const timeSinceLastQuestion = now - tabState.lastQuestionTime;
    if (timeSinceLastQuestion < this.periodicInterval - 2000) {
      // Timer fired too early, reschedule
      const remaining = this.periodicInterval - timeSinceLastQuestion;
      this.schedulePeriodicQuestion(tabId);
      return;
    }

    // Set blocked state
    tabState.isBlocked = true;
    tabState.blockReason = 'periodic';
    this.tabStates.set(tabId, tabState);
    
    // Persist state change
    this.persistStates();

    
    // Trigger question display
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
    await this.waitForInit();
    
    const alarmName = alarm.name;
    
    if (alarmName.startsWith('vocabbreak_tab_')) {
      const tabId = parseInt(alarmName.replace('vocabbreak_tab_', ''));

      const timer = this.tabTimers.get(tabId);
      // If no timer exists, it may have been handled by setTimeout already
      if (!timer) {
        return;
      }
      
      if (timer.type !== 'periodic') {
        return;
      }

      // DECISION 2: Verify time elapsed before triggering (handles alarm inaccuracy)
      const now = Date.now();
      const timeRemaining = (timer.scheduledTime || 0) - now;
      
      if (timeRemaining > 2000) {
        // setTimeout will fire closer to the target time
        return;
      }

      // Time has elapsed, trigger the question
      await this.handlePeriodicTimer(tabId);
      
    } else if (alarmName.startsWith('vocabbreak_penalty_')) {
      const tabId = parseInt(alarmName.replace('vocabbreak_penalty_', ''));
      await this.clearTabPenalty(tabId);
    }
  }

  async handleSettingsUpdate(settings) {
    
    const oldPeriodicInterval = this.periodicInterval;
    const oldBlockingMode = this.blockingMode;
    
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
    } catch (error) {
      console.error('❌ Failed to save settings to storage:', error);
    }

    // DECISION 3: Reschedule ALL active tab timers with new interval immediately
    const intervalChanged = oldPeriodicInterval !== this.periodicInterval;
    const modeChanged = oldBlockingMode !== this.blockingMode;
    
    if (intervalChanged) {
      await this.rescheduleAllTimers();
    }
    
    if (modeChanged) {
      await this.reevaluateAllTabs();
    }

    // Notify all content scripts that settings changed
    await this.broadcastToAllTabs({
      type: 'SETTINGS_CHANGED',
      settings: settings
    });
    
  }
  
  async rescheduleAllTimers() {
    
    for (const [tabId, timer] of this.tabTimers.entries()) {
      const tabState = this.tabStates.get(tabId);
      if (!tabState) continue;
      
      // Calculate new scheduled time based on time elapsed since last question
      const now = Date.now();
      const timeSinceLastQuestion = now - tabState.lastQuestionTime;
      const timeRemaining = Math.max(0, this.periodicInterval - timeSinceLastQuestion);
      
      // Clear existing timer
      if (timer.timeoutId) clearTimeout(timer.timeoutId);
      if (timer.alarmName) chrome.alarms.clear(timer.alarmName);
      
      if (timeRemaining <= 0) {
        // Time already elapsed, trigger immediately
        await this.handlePeriodicTimer(tabId);
      } else {
        // Schedule new timer with remaining time
        
        const scheduledTime = now + timeRemaining;
        const timeoutId = setTimeout(() => this.handlePeriodicTimer(tabId), timeRemaining);
        
        let alarmName = null;
        const delayInMinutes = Math.max(1, Math.ceil(timeRemaining / 60000));
        alarmName = `vocabbreak_tab_${tabId}`;
        chrome.alarms.create(alarmName, { delayInMinutes });
        
        this.tabTimers.set(tabId, {
          alarmName,
          type: 'periodic',
          scheduledTime,
          timeoutId
        });
      }
    }
    
    // Persist updated timer states
    this.persistStates();
  }
  
  async reevaluateAllTabs() {
    
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.url || tab.url.startsWith('chrome://')) continue;
      
      const tabId = tab.id;
      const shouldBlock = this.shouldBlockUrl(tab.url);
      const tabState = this.tabStates.get(tabId);
      
      if (shouldBlock && !tabState) {
        // Tab should now be blocked but wasn't tracked - handle activity
        await this.handleTabActivity(tabId, tab.url);
      } else if (!shouldBlock && tabState) {
        // Tab was tracked but should no longer be blocked - clean up
        this.clearTabTimer(tabId);
        this.tabStates.delete(tabId);
      }
    }
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
      const stored = await chrome.storage.local.get(['tabStates']);

      if (stored.tabStates) {
        let loadedCount = 0;
        for (const [tabId, state] of Object.entries(stored.tabStates)) {
          if (state.url && !this.shouldBlockUrl(state.url)) {
            continue;
          }
          // Fix for existing broken states: if lastQuestionTime is 0, set it to now
          if (state.lastQuestionTime === 0) {
            state.lastQuestionTime = Date.now();
          }
          this.tabStates.set(parseInt(tabId), state);
          loadedCount++;
        }
      }

      // Recreate penalty timers for tabs still under penalty
      let penaltyCount = 0;
      for (const [tabId, state] of this.tabStates.entries()) {
        if (state.penaltyEndTime && state.penaltyEndTime > Date.now()) {
          this.scheduleTabPenaltyEnd(tabId, state.penaltyEndTime - Date.now());
          penaltyCount++;
        }
      }
      if (penaltyCount > 0) {
      }

    } catch (error) {
      console.error('❌ Failed to load persisted states:', error);
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
      console.error('❌ Failed to persist states:', error);
    }
  }

  async handleExtensionStartup() {
    await this.loadPersistedStates();
  }

  async handleExtensionInstalled(details) {
    
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

  async getAuthStatus() {
    try {
      // Check if user is authenticated by looking at stored session
      const result = await chrome.storage.local.get(['userSession', 'vb-auth']);
      
      // Check for Supabase auth session
      const supabaseAuth = result['vb-auth'];
      if (supabaseAuth) {
        try {
          const parsed = typeof supabaseAuth === 'string' ? JSON.parse(supabaseAuth) : supabaseAuth;
          
          // Validate session structure: must have user.id AND access_token
          if (parsed?.user?.id && parsed?.access_token) {
            // Check if session has expired
            const expiresAt = parsed.expires_at;
            const now = Math.floor(Date.now() / 1000);
            
            if (!expiresAt || expiresAt > now) {
              // Session is valid and not expired
              return { isAuthenticated: true, userId: parsed.user.id };
            }
            
            // Session expired - clear it and return expired status
            await chrome.storage.local.remove(['vb-auth']);
            return { isAuthenticated: false, sessionExpired: true };
          }
          
          // Session structure is invalid (missing access_token)
          if (parsed?.user?.id && !parsed?.access_token) {
            console.warn('⚠️ Invalid session structure: missing access_token, clearing');
            await chrome.storage.local.remove(['vb-auth']);
            return { isAuthenticated: false, sessionInvalid: true };
          }
        } catch (e) {
          console.warn('Failed to parse vb-auth:', e);
          // Clear corrupted session data
          await chrome.storage.local.remove(['vb-auth']);
          return { isAuthenticated: false, sessionCorrupted: true };
        }
      }
      
      // Fallback: check userSession storage with validation
      if (result.userSession?.user?.id && result.userSession?.access_token) {
        const expiresAt = result.userSession.expires_at;
        const now = Math.floor(Date.now() / 1000);
        
        if (!expiresAt || expiresAt > now) {
          return { isAuthenticated: true, userId: result.userSession.user.id };
        }
        
        // Session expired - clear it
        await chrome.storage.local.remove(['userSession']);
        return { isAuthenticated: false, sessionExpired: true };
      }
      
      return { isAuthenticated: false };
    } catch (error) {
      console.error('Failed to get auth status:', error);
      return { isAuthenticated: false, error: error.message };
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

