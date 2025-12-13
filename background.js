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
    
    console.log('🔧 BackgroundManager constructor called, interval =', this.periodicInterval / 60000, 'minutes');
    this.initPromise = this.init();
  }
  
  // Wait for initialization to complete (called by event handlers)
  async waitForInit() {
    if (this.isInitialized) {
      return;
    }
    console.log('⏳ Waiting for initialization to complete...');
    if (this.initPromise) {
      await this.initPromise;
    }
    console.log('✅ Initialization complete, proceeding');
  }

  async init() {
    console.log('🚀 VocabBreak background script initializing...');
    
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
      console.log('✅ VocabBreak background script initialized');
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
      console.log(`📋 Initializing ${tabs.length} existing tabs...`);
      
      for (const tab of tabs) {
        if (tab.url && !tab.url.startsWith('chrome://')) {
          // Check if we already have persisted state for this tab
          const existingState = this.tabStates.get(tab.id);
          
          if (existingState) {
            // We have persisted state - check if URL matches
            const normalizeUrl = (u) => {
              try {
                const parsed = new URL(u);
                return parsed.origin + parsed.pathname.replace(/\/$/, '');
              } catch {
                return u;
              }
            };
            
            const urlMatches = normalizeUrl(existingState.url) === normalizeUrl(tab.url);
            
            if (urlMatches) {
              // Same URL, preserve existing state (don't reinitialize)
              console.log(`⏭️ Tab ${tab.id}: Preserving persisted state (same URL)`);
              
              // But make sure timer is scheduled if needed
              if (!this.tabTimers.has(tab.id) && this.shouldBlockUrl(tab.url)) {
                const timeSinceLastQuestion = Date.now() - existingState.lastQuestionTime;
                const timeRemaining = Math.max(0, this.periodicInterval - timeSinceLastQuestion);
                
                if (timeRemaining > 0) {
                  console.log(`⏰ Tab ${tab.id}: Scheduling timer for ${Math.round(timeRemaining/1000)}s`);
                  const scheduledTime = Date.now() + timeRemaining;
                  const timeoutId = setTimeout(() => this.handlePeriodicTimer(tab.id), timeRemaining);
                  const alarmName = `vocabbreak_tab_${tab.id}`;
                  chrome.alarms.create(alarmName, { delayInMinutes: Math.max(1, Math.ceil(timeRemaining / 60000)) });
                  
                  this.tabTimers.set(tab.id, {
                    alarmName,
                    type: 'periodic',
                    scheduledTime,
                    timeoutId
                  });
                }
              }
              continue;
            }
          }
          
          // No persisted state or URL changed - initialize as new
          await this.initializeTab(tab.id, tab.url, true);
        }
      }
      
      console.log(`📋 Finished initializing tabs. States: ${this.tabStates.size}, Timers: ${this.tabTimers.size}`);
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
      await this.waitForInit();
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
      
      console.log(`📍 Tab ${tabId} updated:`);
      console.log(`   - Has existing state: ${!!existingTabState}`);
      if (existingTabState) {
        console.log(`   - Existing URL: ${existingTabState.url}`);
        console.log(`   - Existing lastQuestionTime: ${new Date(existingTabState.lastQuestionTime).toISOString()}`);
      }
      console.log(`   - New URL: ${url}`);
      console.log(`   - URL changed: ${urlChanged}`);
      
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
    
    // Clean up persisted timer state for closed tabs
    this.persistStates();
    
    console.log(`🗑️ Cleaned up tab ${tabId}`);
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
          console.log(`📨 REQUEST_BLOCK_CHECK from tab ${sender.tab?.id}, URL: ${sender.tab?.url?.substring(0, 50)}`);
          const blockState = await this.getBlockState(sender.tab.id, sender.tab.url);
          console.log(`📨 Block check result:`, JSON.stringify(blockState));
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
    
    console.log(`📩 QUESTION_ANSWERED: tab=${tabId}, correct=${isCorrect}, questionId=${questionId}`);
    
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
        console.log(`⏰ Tab ${tabId}: Rescheduled periodic timer for ${this.periodicInterval/60000} minutes`);
      } else {
        tabState.isBlocked = true;
        tabState.blockReason = 'wrong_answer';
        tabState.penaltyEndTime = Date.now() + this.wrongAnswerPenalty;
        await this.applyTabPenalty(tabId, this.wrongAnswerPenalty);
      }
    }
    
    // Persist state immediately
    await this.persistStates();
    console.log(`💾 Persisted state after QUESTION_ANSWERED for tab ${tabId}`);
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
        console.log(`💾 Persisted tab ${tabId} state: lastQuestionTime=${new Date(tabState.lastQuestionTime).toISOString()}`);
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
      console.log(`✅ Tab ${tabId} excluded or not blockable: ${url?.substring(0, 50)}`);
      return { shouldBlock: false, reason: null, penaltyEndTime: 0, timeSinceLastQuestion: 0 };
    }

    const tabState = this.tabStates.get(tabId);
    if (!tabState) {
      console.log(`❌ No tab state found for ${tabId}, not blocking`);
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

    console.log(`🔍 Tab ${tabId} block check: timeSince=${Math.round(timeSinceLastQuestion/1000)}s, interval=${this.periodicInterval/1000}s, timeElapsed=${timeElapsed}, penaltyActive=${penaltyActive}, shouldBlock=${shouldBlock}, reason=${reason}`);

    return {
      shouldBlock: shouldBlock,
      reason: reason,
      penaltyEndTime: tabState.penaltyEndTime || 0,
      timeSinceLastQuestion: timeSinceLastQuestion
    };
  }

  async triggerQuestion(tabId, reason) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/26371981-9a85-43c2-a381-8eed2455eb27',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:triggerQuestion:entry',message:'Trigger question called',data:{tabId,reason},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1A'})}).catch(()=>{});
    // #endregion
    const tabState = this.tabStates.get(tabId);
    if (!tabState) {
      console.warn(`⚠️ Cannot trigger question for tab ${tabId}: no tab state`);
      return;
    }

    tabState.isBlocked = true;
    tabState.blockReason = reason;
    this.tabStates.set(tabId, tabState);

    console.log(`🚫 Triggering question for tab ${tabId}, reason: ${reason}`);

    // Try message first (preferred, more reliable)
    let messageSuccess = false;
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'SHOW_QUESTION', reason: reason });
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/26371981-9a85-43c2-a381-8eed2455eb27',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:triggerQuestion:msgSent',message:'SHOW_QUESTION message result',data:{tabId,response:response,messageSuccess:!!(response&&response.success)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1B'})}).catch(()=>{});
      // #endregion
      if (response && response.success) {
        messageSuccess = true;
        console.log(`📩 SHOW_QUESTION message sent successfully to tab ${tabId}`);
      }
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/26371981-9a85-43c2-a381-8eed2455eb27',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:triggerQuestion:msgFailed',message:'SHOW_QUESTION message failed',data:{tabId,error:err?.message||String(err)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1C'})}).catch(()=>{});
      // #endregion
      console.warn(`⚠️ SHOW_QUESTION message failed for tab ${tabId}:`, err?.message || err);
    }

    // Fallback: use executeScript if message failed
    if (!messageSuccess) {
      try {
        console.log(`🔧 Trying executeScript fallback for tab ${tabId}`);
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
        console.log(`✅ executeScript fallback successful for tab ${tabId}`);
      } catch (error) {
        console.error(`❌ Failed to trigger question display for tab ${tabId}:`, error);
      }
    }
  }

  async triggerManualBlock() {
    console.log('🎯 Manual block triggered');
    
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
      
      console.log(`✅ Manual block triggered successfully for tab ${tabId}`);
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

    console.log(`⏰ Scheduled periodic question for tab ${tabId}: setTimeout=${this.periodicInterval}ms, alarm=${delayInMinutes}min, scheduledTime=${new Date(scheduledTime).toISOString()}`);
  }

  async handlePeriodicTimer(tabId) {
    console.log(`⏰ handlePeriodicTimer called for tab ${tabId}`);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/26371981-9a85-43c2-a381-8eed2455eb27',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:handlePeriodicTimer',message:'Timer fired for tab',data:{tabId,hasTimer:this.tabTimers.has(tabId)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1A'})}).catch(()=>{});
    // #endregion
    
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
      console.log(`⚠️ No tab state for ${tabId}, skipping timer`);
      return;
    }
    
    if (!this.shouldBlockUrl(tabState.url)) {
      console.log(`⚠️ Tab ${tabId} URL no longer blockable: ${tabState.url}`);
      return;
    }

    // Verify time has actually elapsed (handles race conditions and alarm inaccuracy)
    const now = Date.now();
    const timeSinceLastQuestion = now - tabState.lastQuestionTime;
    if (timeSinceLastQuestion < this.periodicInterval - 2000) {
      // Timer fired too early, reschedule
      const remaining = this.periodicInterval - timeSinceLastQuestion;
      console.log(`⏰ Timer fired early for tab ${tabId}, rescheduling in ${remaining}ms`);
      this.schedulePeriodicQuestion(tabId);
      return;
    }

    // Set blocked state
    tabState.isBlocked = true;
    tabState.blockReason = 'periodic';
    this.tabStates.set(tabId, tabState);
    
    // Persist state change
    this.persistStates();

    console.log(`🚫 Blocking tab ${tabId} - periodic timer fired after ${Math.round(timeSinceLastQuestion/1000)}s`);
    
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
    console.log(`🔔 Alarm fired: ${alarmName}`);
    
    if (alarmName.startsWith('vocabbreak_tab_')) {
      const tabId = parseInt(alarmName.replace('vocabbreak_tab_', ''));

      const timer = this.tabTimers.get(tabId);
      // If no timer exists, it may have been handled by setTimeout already
      if (!timer) {
        console.log(`⚠️ No timer found for alarm ${alarmName}, may have been handled by setTimeout`);
        return;
      }
      
      if (timer.type !== 'periodic') {
        console.log(`⚠️ Timer type is ${timer.type}, not periodic`);
        return;
      }

      // DECISION 2: Verify time elapsed before triggering (handles alarm inaccuracy)
      const now = Date.now();
      const timeRemaining = (timer.scheduledTime || 0) - now;
      
      if (timeRemaining > 2000) {
        // setTimeout will fire closer to the target time
        console.log(`⏰ Alarm fired early, ${timeRemaining}ms remaining, setTimeout will handle`);
        return;
      }

      // Time has elapsed, trigger the question
      console.log(`⏰ Alarm triggering periodic question for tab ${tabId}`);
      await this.handlePeriodicTimer(tabId);
      
    } else if (alarmName.startsWith('vocabbreak_penalty_')) {
      const tabId = parseInt(alarmName.replace('vocabbreak_penalty_', ''));
      console.log(`⏰ Penalty alarm fired for tab ${tabId}`);
      await this.clearTabPenalty(tabId);
    }
  }

  async handleSettingsUpdate(settings) {
    console.log('🔧 Background script received settings update:', settings);
    
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
      console.log('✅ Settings saved to chrome storage');
    } catch (error) {
      console.error('❌ Failed to save settings to storage:', error);
    }

    // DECISION 3: Reschedule ALL active tab timers with new interval immediately
    const intervalChanged = oldPeriodicInterval !== this.periodicInterval;
    const modeChanged = oldBlockingMode !== this.blockingMode;
    
    if (intervalChanged) {
      console.log(`⏰ Interval changed from ${oldPeriodicInterval/60000}min to ${this.periodicInterval/60000}min - rescheduling all timers`);
      await this.rescheduleAllTimers();
    }
    
    if (modeChanged) {
      console.log(`🔄 Blocking mode changed from ${oldBlockingMode} to ${this.blockingMode} - re-evaluating all tabs`);
      await this.reevaluateAllTabs();
    }

    // Notify all content scripts that settings changed
    await this.broadcastToAllTabs({
      type: 'SETTINGS_CHANGED',
      settings: settings
    });
    
    console.log('✅ Settings update complete');
  }
  
  async rescheduleAllTimers() {
    console.log(`⏰ Rescheduling timers for ${this.tabTimers.size} tabs with new interval ${this.periodicInterval/60000}min`);
    
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
        console.log(`⚡ Tab ${tabId}: time already elapsed, triggering immediately`);
        await this.handlePeriodicTimer(tabId);
      } else {
        // Schedule new timer with remaining time
        console.log(`⏰ Tab ${tabId}: rescheduling in ${Math.round(timeRemaining/1000)}s`);
        
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
    console.log('🔄 Re-evaluating blocking status for all tabs');
    
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.url || tab.url.startsWith('chrome://')) continue;
      
      const tabId = tab.id;
      const shouldBlock = this.shouldBlockUrl(tab.url);
      const tabState = this.tabStates.get(tabId);
      
      if (shouldBlock && !tabState) {
        // Tab should now be blocked but wasn't tracked - initialize it
        console.log(`📍 Tab ${tabId} now blockable, initializing`);
        await this.initializeTab(tabId, tab.url, true);
      } else if (!shouldBlock && tabState) {
        // Tab was tracked but should no longer be blocked - clean up
        console.log(`✅ Tab ${tabId} no longer blockable, cleaning up`);
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
      console.log('📂 Loading persisted timer states...');
      const stored = await chrome.storage.local.get(['tabStates', 'tabTimers']);
      
      if (stored.tabStates) {
        let loadedCount = 0;
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
          loadedCount++;
        }
        console.log(`📂 Loaded ${loadedCount} tab states from storage`);
      }

      if (stored.tabTimers) {
        let rescheduledCount = 0;
        for (const [tabId, timer] of Object.entries(stored.tabTimers)) {
          const timerId = parseInt(tabId);
          const timeLeft = (timer.scheduledTime || 0) - Date.now();
          
          if (timeLeft > 0) {
            let alarmName = null;
            const minutesLeft = Math.max(1, Math.ceil(timeLeft / 60000));
            alarmName = `vocabbreak_tab_${timerId}`;
            chrome.alarms.create(alarmName, { delayInMinutes: minutesLeft });

            const timeoutId = setTimeout(() => this.handlePeriodicTimer(timerId), timeLeft);

            this.tabTimers.set(timerId, {
              alarmName,
              scheduledTime: Date.now() + timeLeft,
              timeoutId,
              type: timer.type || 'periodic'
            });
            
            rescheduledCount++;
            console.log(`⏰ Rescheduled timer for tab ${timerId}: ${Math.round(timeLeft/1000)}s remaining`);
          } else {
            console.log(`⚠️ Timer for tab ${timerId} already expired, will trigger on next navigation`);
          }
        }
        console.log(`⏰ Rescheduled ${rescheduledCount} timers from storage`);
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
        console.log(`⏱️ Restored ${penaltyCount} penalty timers`);
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
      
      console.log(`💾 Persisted ${Object.keys(tabStatesObj).length} tab states, ${Object.keys(tabTimersObj).length} timers`);
    } catch (error) {
      console.error('❌ Failed to persist states:', error);
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



