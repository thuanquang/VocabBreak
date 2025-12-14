/**
 * Content script for VocabBreak extension
 * Handles the blocking overlay and question interface injection
 */

class VocabBreakBlocker {
  constructor() {
    this.overlay = null;
    this.isBlocked = false;
    this.currentQuestion = null;
    this.lastTriggerReason = 'periodic';
    this.lastTimerSettings = { intervalMinutes: 30, penaltySeconds: 30 };
    this.startTime = null;
    this.penaltyTimer = null;
    this.isInitialized = false;
    this.userPrefs = { soundEnabled: true, reducedMotion: false };
    this.audioContext = null;
    
    this.init();
  }

  async init() {
    // Avoid multiple initializations
    if (this.isInitialized) return;
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  async setup() {
    try {
      // Wait for i18n system to be ready
      if (window.i18n && window.i18n.ready) {
        try {
          await window.i18n.ready;
          console.log('✅ i18n system ready in content script');
        } catch (error) {
          console.warn('⚠️ Failed to wait for i18n system:', error);
        }
      } else {
        console.warn('⚠️ i18n system not available in content script');
      }

      await this.loadUserPreferences();

      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'sync' && (changes.soundEnabled || changes.reducedMotion)) {
          this.userPrefs = {
            soundEnabled: changes.soundEnabled ? changes.soundEnabled.newValue !== false : this.userPrefs.soundEnabled,
            reducedMotion: changes.reducedMotion ? !!changes.reducedMotion.newValue : this.userPrefs.reducedMotion
          };
          this.applyPreferencesToOverlay();
        }
      });

      // Check if we should block this page
      console.log('🔍 VocabBreak content script checking if should block...');
      const response = await this.sendMessage({ type: 'REQUEST_BLOCK_CHECK' });
      console.log('🔍 Block check response:', JSON.stringify(response));
      
      if (response && response.shouldBlock) {
        // Check authentication first - only block for logged-in users
        const isAuthenticated = await this.checkAuthStatus();
        if (!isAuthenticated) {
          console.log('🔒 User not authenticated, skipping block');
        } else if (response.reason === 'penalty') {
          console.log('⏳ Penalty active: showing penalty overlay until', new Date(response.penaltyEndTime).toISOString());
          this.showPenaltyOverlay(response.penaltyEndTime);
        } else {
          console.log(`❌ BLOCKING: reason=${response.reason}, timeSinceLastQuestion=${Math.round((response.timeSinceLastQuestion || 0)/1000)}s`);
          this.showQuestion(response.reason || 'periodic');
        }
      } else {
        console.log(`✅ NOT BLOCKING: timeSinceLastQuestion=${Math.round((response?.timeSinceLastQuestion || 0)/1000)}s`);
      }

      // Set up message listener
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
      });

      // Prevent easy bypassing
      this.setupBypassPrevention();

      this.isInitialized = true;
      window.vocabBreakBlocker = this;
      
      console.log('✅ VocabBreak blocker initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize VocabBreak blocker:', error);
      console.error('📝 Stack:', error.stack);
      
      // Still register the blocker even if initialization failed
      this.isInitialized = true;
      window.vocabBreakBlocker = this;
      
      // Notify background script of initialization error
      try {
        await this.sendMessage({
          type: 'LOG_ERROR',
          error: error.message,
          stack: error.stack,
          stage: 'content-script-init'
        });
      } catch (e) {
        console.error('Could not notify background of error:', e);
      }
    }
  }

  async loadUserPreferences() {
    try {
      const result = await chrome.storage.sync.get(['soundEnabled', 'reducedMotion']);
      this.userPrefs = {
        soundEnabled: result.soundEnabled !== false,
        reducedMotion: !!result.reducedMotion
      };
      this.applyPreferencesToOverlay();
    } catch (error) {
      console.warn('Failed to load comfort preferences, using defaults', error);
      this.userPrefs = { soundEnabled: true, reducedMotion: false };
    }
  }

  applyPreferencesToOverlay() {
    if (!this.overlay) return;
    this.overlay.classList.toggle('vb-reduced-motion', !!this.userPrefs.reducedMotion);
  }

  maybePlayClick(frequency = 240, duration = 0.08) {
    if (!this.userPrefs || !this.userPrefs.soundEnabled || this.userPrefs.reducedMotion) {
      return;
    }
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.audioContext = this.audioContext || new AudioCtx();
      const ctx = this.audioContext;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration + 0.02);
    } catch (error) {
      console.warn('Soft click playback failed', error);
    }
  }

  setupBypassPrevention() {
    // Prevent F12, right-click, and common keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (this.isBlocked) {
        // Prevent F12, Ctrl+Shift+I, Ctrl+U, Ctrl+Shift+J
        if (e.key === 'F12' || 
            (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
            (e.ctrlKey && e.key === 'u')) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        
        // Prevent Escape
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
    }, true);

    // Prevent right-click context menu
    document.addEventListener('contextmenu', (e) => {
      if (this.isBlocked) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }, true);

    // Prevent text selection during blocking
    document.addEventListener('selectstart', (e) => {
      if (this.isBlocked) {
        e.preventDefault();
        return false;
      }
    }, true);
  }

  async showQuestion(reason = 'periodic') {
    if (this.isBlocked) return; // Already showing

    const triggerReason = reason || 'periodic';
    this.lastTriggerReason = triggerReason;

    try {
      // CHECK AUTHENTICATION BEFORE SHOWING QUESTION
      // Questions should only appear for logged-in users
      const isAuthenticated = await this.checkAuthStatus();
      if (!isAuthenticated) {
        console.log('🔒 User not authenticated, skipping question');
        return;
      }

      // CORRECT FLOW: Try Supabase first → IndexedDB cache → QuestionBank fallback
      let question = null;
      
      // 1. FIRST: Try Supabase (dynamic questions based on user settings)
      if (typeof window !== 'undefined' && window.supabaseClient) {
        try {
          // Wait for client to be ready, but don't block forever
          if (window.supabaseReadyPromise && typeof window.supabaseReadyPromise.then === 'function') {
            await Promise.race([
              window.supabaseReadyPromise,
              new Promise(resolve => setTimeout(resolve, 4000))
            ]);
          }

          // Get user settings ALWAYS from chrome.storage.sync (the source of truth for user preferences)
          // coreManager defaults are NOT reliable - they don't load from chrome.storage.sync
          let userSettings = { difficultyLevels: ['A1', 'A2'], questionTypes: ['multiple-choice', 'text-input'], topics: ['general'] };
          
          try {
            const result = await chrome.storage.sync.get(['difficultyLevels', 'questionTypes', 'topics']);
            userSettings = {
              difficultyLevels: result.difficultyLevels || ['A1', 'A2'],
              questionTypes: result.questionTypes || ['multiple-choice', 'text-input'],
              topics: result.topics || ['general']
            };
          } catch (error) {
            console.warn('⚠️ Failed to load user settings from chrome.storage.sync, using defaults:', error);
          }
          
          // Define filters for question selection
          // Filter topics: if 'general' is selected, don't apply topic filter (show all topics)
          // Otherwise, apply the selected topics
          const topicsToFilter = userSettings.topics && 
                                 userSettings.topics.length > 0 && 
                                 !userSettings.topics.includes('general') 
                                 ? userSettings.topics 
                                 : [];
          
          const questionFilters = {
            level: userSettings.difficultyLevels,
            type: userSettings.questionTypes,
            topics: topicsToFilter
          };
          
          const dbQuestion = await window.supabaseClient.getRandomQuestion(questionFilters);
          
          if (dbQuestion) {
            // Transform database question to expected format
            question = this.transformDatabaseQuestion(dbQuestion);
            console.log('✅ Question fetched from Supabase:', dbQuestion.id);
            
            // Cache this question to IndexedDB for connection failure fallback
            await this.cacheQuestionToIndexedDB(question, userSettings);
            
          } else {
            console.log('📝 No questions returned from Supabase');
          }
        } catch (dbError) {
          console.warn('⚠️ Supabase failed, will try cache:', dbError);
          if (window.errorHandler) {
            window.errorHandler.handleDatabaseError(dbError, { stage: 'fetch-question', context: 'content-script' });
          }
        }
      }
      
      // 2. SECOND: Try IndexedDB cache if Supabase failed or no internet
      if (!question && window.coreManager) {
        try {
          console.log('🗄️ Trying IndexedDB cache for questions...');
          const userState = window.coreManager.getState('user');
          const userPreferences = userState?.preferences || {
            difficultyLevels: ['A1', 'A2'],
            questionTypes: ['multiple-choice', 'text-input'],
            topics: ['general']
          };
          
          // Try to get cached questions matching user preferences
          const cachedQuestion = await this.getCachedQuestionFromIndexedDB(userPreferences);
          if (cachedQuestion) {
            question = cachedQuestion;
            console.log('✅ Using cached question from IndexedDB:', question.id);
          }
        } catch (cacheError) {
          console.warn('⚠️ IndexedDB cache failed:', cacheError);
        }
      }
      
      // 3. FINAL: If no cached questions available, fail gracefully
      if (!question) {
        console.error('❌ No questions available: Supabase connection failed and no cached questions matching user preferences');
        this.showNoQuestionsAvailable();
        return;
      }

      this.currentQuestion = question;
      this.isBlocked = true;
      this.startTime = Date.now();

      const timerSettings = await this.getTimerSettings();
      await this.recordBlockingEvent({
        triggerType: triggerReason,
        intervalMinutes: timerSettings.intervalMinutes,
        penaltySeconds: timerSettings.penaltySeconds,
        outcome: 'question_shown',
        metadata: { questionId: question.id }
      });

      this.createOverlay();
      await this.renderQuestion();

    } catch (error) {
      console.error('Failed to show question:', error);
    }
  }

  createOverlay() {
    // Remove existing overlay
    if (this.overlay) {
      this.overlay.remove();
    }

    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.id = 'vocabbreak-overlay';
    this.overlay.innerHTML = `
      <div class="vocabbreak-modal">
        <div class="vocabbreak-header">
          <h2 id="vocabbreak-title">${this.getMessage('question_header')}</h2>
          <div class="vocabbreak-streak" id="vocabbreak-streak"></div>
        </div>
        <div class="vocabbreak-content" id="vocabbreak-content">
          <!-- Question content will be injected here -->
        </div>
        <div class="vocabbreak-footer" id="vocabbreak-footer">
          <!-- Footer content will be injected here -->
        </div>
      </div>
    `;

    // Add to page
    document.body.appendChild(this.overlay);
    this.applyPreferencesToOverlay();

    // Force overlay to be on top and unbypassable
    this.overlay.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: rgba(15, 23, 42, 0.65) !important;
      backdrop-filter: blur(8px) !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-family: 'Inter', 'Segoe UI', Roboto, sans-serif !important;
      pointer-events: all !important;
    `;

    // Style the modal
    const modal = this.overlay.querySelector('.vocabbreak-modal');
    modal.style.cssText = `
      background: #ffffff !important;
      border-radius: 16px !important;
      box-shadow: 0 18px 48px rgba(15, 23, 42, 0.25) !important;
      border: 1px solid #e2e8f0 !important;
      max-width: 520px !important;
      width: 90% !important;
      max-height: 80vh !important;
      overflow-y: auto !important;
      animation: vocabbreak-slide-in 0.3s ease-out !important;
    `;

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes vocabbreak-slide-in {
        from {
          opacity: 0;
          transform: scale(0.9) translateY(-20px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }
      
      .vocabbreak-header {
        padding: 24px 24px 16px 24px !important;
        border-bottom: 1px solid #e2e8f0 !important;
        text-align: center !important;
      }
      
      #vocabbreak-title {
        margin: 0 !important;
        font-size: 24px !important;
        font-weight: 600 !important;
        color: #0f172a !important;
      }
      
      .vocabbreak-streak {
        margin-top: 8px !important;
        font-size: 14px !important;
        color: #475569 !important;
      }
      
      .vocabbreak-content {
        padding: 24px !important;
      }
      
      .vocabbreak-instruction {
        font-size: 14px !important;
        color: #475569 !important;
        margin-bottom: 12px !important;
        font-style: italic !important;
      }
      
      .vocabbreak-question {
        font-size: 18px !important;
        font-weight: 500 !important;
        color: #0f172a !important;
        margin-bottom: 20px !important;
        line-height: 1.5 !important;
      }
      
      .vocabbreak-options {
        display: flex !important;
        flex-direction: column !important;
        gap: 12px !important;
      }
      
      .vocabbreak-option {
        padding: 12px 16px !important;
        border: 2px solid #e2e8f0 !important;
        border-radius: 8px !important;
        background: #fff !important;
        cursor: pointer !important;
        font-size: 16px !important;
        transition: all 0.2s ease !important;
      }
      
      .vocabbreak-option:hover {
        border-color: #05668d !important;
        background: #f7fafc !important;
      }
      
      .vocabbreak-option.selected {
        border-color: #05668d !important;
        background: #f0f3bd !important;
      }
      
      .vocabbreak-text-input {
        padding: 12px 16px !important;
        border: 2px solid #e2e8f0 !important;
        border-radius: 8px !important;
        font-size: 16px !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      
      .vocabbreak-text-input:focus {
        outline: none !important;
        border-color: #05668d !important;
      }
      
      .vocabbreak-footer {
        padding: 16px 24px 24px 24px !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
      }
      
      .vocabbreak-submit {
        background: #05668d !important;
        color: white !important;
        border: none !important;
        padding: 12px 24px !important;
        border-radius: 6px !important;
        font-size: 16px !important;
        font-weight: 500 !important;
        cursor: pointer !important;
        transition: background 0.2s ease !important;
      }
      
      .vocabbreak-submit:hover {
        background: #044a6b !important;
      }
      
      .vocabbreak-submit:disabled {
        background: #ccc !important;
        cursor: not-allowed !important;
      }
      
      .vocabbreak-feedback {
        padding: 16px !important;
        border-radius: 8px !important;
        margin-top: 16px !important;
        font-size: 16px !important;
      }
      
      .vocabbreak-feedback.correct {
        background: #d4edda !important;
        color: #155724 !important;
        border: 1px solid #c3e6cb !important;
      }
      
      .vocabbreak-feedback.incorrect {
        background: #f8d7da !important;
        color: #721c24 !important;
        border: 1px solid #f5c6cb !important;
      }
      
      .vocabbreak-penalty {
        text-align: center !important;
        color: #721c24 !important;
        width: 100% !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
      }
      
      .vocabbreak-timer {
        font-size: 24px !important;
        font-weight: bold !important;
        margin: 16px 0 !important;
      }
    `;
    
    document.head.appendChild(style);
  }

  showPenaltyOverlay(endTime) {
    this.isBlocked = true;
    this.currentQuestion = null;
    this.startTime = null;

    this.createOverlay();

    const content = this.overlay.querySelector('#vocabbreak-content');
    const footer = this.overlay.querySelector('#vocabbreak-footer');

    content.innerHTML = `
      <div class="vocabbreak-penalty">
        <div class="vocabbreak-question">${this.getMessage('please_wait')}</div>
        <div class="vocabbreak-instruction">${this.getMessage('question_instruction_mc')}</div>
      </div>
    `;

    footer.innerHTML = `
      <div class="vocabbreak-penalty">
        <div class="vocabbreak-timer" id="vocabbreak-penalty-timer">--</div>
      </div>
    `;

    const fallbackEndTime = Date.now() + (this.lastTimerSettings?.penaltySeconds || 30) * 1000;
    this.startPenaltyTimer(endTime || fallbackEndTime);
  }

  async renderQuestion() {
    if (!this.currentQuestion) return;

    const content = this.overlay.querySelector('#vocabbreak-content');
    const footer = this.overlay.querySelector('#vocabbreak-footer');

    // Get user's interface language setting
    let userLanguage = 'en'; // default fallback
    try {
      const result = await chrome.storage.sync.get(['interfaceLanguage']);
      userLanguage = result.interfaceLanguage || 'en';
    } catch (error) {
      console.warn('Failed to get interface language setting:', error);
    }

    // Get question text based on user's language preference
    const questionText = this.getLocalizedQuestionText(userLanguage);

    if (this.currentQuestion.type === 'multiple-choice') {
      content.innerHTML = `
        <div class="vocabbreak-instruction">${this.getMessage('question_instruction_mc')}</div>
        <div class="vocabbreak-question">${questionText}</div>
        <div class="vocabbreak-options" id="vocabbreak-options">
          ${(this.currentQuestion.options || this.currentQuestion.answers?.options || []).map((option, index) => {
            const optionText = typeof option === 'string' ? option : (option.text || option);
            const optionValue = typeof option === 'string' ? option : (option.text || option.id || option);
            return `<div class="vocabbreak-option" data-value="${optionValue}" data-index="${index}">
              ${optionText}
            </div>`;
          }).join('')}
        </div>
      `;
    } else if (this.currentQuestion.type === 'text-input') {
      content.innerHTML = `
        <div class="vocabbreak-instruction">${this.getMessage('question_instruction_text')}</div>
        <div class="vocabbreak-question">${questionText}</div>
        <input type="text" class="vocabbreak-text-input" id="vocabbreak-text-input" 
               placeholder="${this.getMessage('question_instruction_text')}">
      `;
      
      // Focus the input
      setTimeout(() => {
        const input = content.querySelector('#vocabbreak-text-input');
        if (input) input.focus();
      }, 100);
    }

    footer.innerHTML = `
      <div class="vocabbreak-points">+${this.currentQuestion.pointsValue || this.currentQuestion.scoring?.base_points || 10} points</div>
      <button class="vocabbreak-submit" id="vocabbreak-submit-btn">
        ${this.getMessage('submit_answer')}
      </button>
    `;

    // Add event listeners after DOM is created
    this.setupQuestionEventListeners();
  }

  getLocalizedQuestionText(userLanguage) {
    const question = this.currentQuestion;
    if (!question) return 'Question text not available';

    // Try to get text in user's preferred language first
    let text = null;
    
    // Check questionText object structure
    if (question.questionText && question.questionText[userLanguage]) {
      text = question.questionText[userLanguage];
    }
    // Check content.text object structure (for Supabase questions)
    else if (question.content && question.content.text && question.content.text[userLanguage]) {
      text = question.content.text[userLanguage];
    }
    
    // Fallback to English if preferred language not available
    if (!text) {
      if (question.questionText && question.questionText.en) {
        text = question.questionText.en;
      } else if (question.content && question.content.text && question.content.text.en) {
        text = question.content.text.en;
      }
    }
    
    // Final fallback
    return text || 'Question text not available';
  }

  getLocalizedExplanation(userLanguage) {
    const question = this.currentQuestion;
    if (!question) return '';

    // Try to get explanation in user's preferred language first
    let explanation = null;
    
    // Check explanation object structure
    if (question.explanation && question.explanation[userLanguage]) {
      explanation = question.explanation[userLanguage];
    }
    // Check content.explanation object structure (for Supabase questions)
    else if (question.content && question.content.explanation && question.content.explanation[userLanguage]) {
      explanation = question.content.explanation[userLanguage];
    }
    
    // Fallback to English if preferred language not available
    if (!explanation) {
      if (question.explanation && question.explanation.en) {
        explanation = question.explanation.en;
      } else if (question.content && question.content.explanation && question.content.explanation.en) {
        explanation = question.content.explanation.en;
      }
    }
    
    return explanation || '';
  }

  setupQuestionEventListeners() {
    // Add click listeners to options
    const options = this.overlay.querySelectorAll('.vocabbreak-option');
    options.forEach(option => {
      option.addEventListener('click', () => this.selectOption(option));
    });

    // Add click listener to submit button
    const submitBtn = this.overlay.querySelector('#vocabbreak-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitAnswer());
    }

    // Add Enter key listener for text input
    const textInput = this.overlay.querySelector('#vocabbreak-text-input');
    if (textInput) {
      textInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.submitAnswer();
        }
      });
    }
  }

  selectOption(element) {
    // Clear previous selections
    const options = this.overlay.querySelectorAll('.vocabbreak-option');
    options.forEach(opt => opt.classList.remove('selected'));
    
    // Select clicked option
    element.classList.add('selected');
    this.maybePlayClick(300);
  }

  async submitAnswer() {
    this.maybePlayClick(240);
    let userAnswer = '';

    if (this.currentQuestion.type === 'multiple-choice') {
      const selected = this.overlay.querySelector('.vocabbreak-option.selected');
      if (!selected) {
        alert(this.getMessage('please_select_answer'));
        return;
      }
      userAnswer = selected.dataset.value;
    } else if (this.currentQuestion.type === 'text-input') {
      const input = this.overlay.querySelector('#vocabbreak-text-input');
      userAnswer = input.value.trim();
      if (!userAnswer) {
        alert(this.getMessage('please_enter_answer'));
        return;
      }
    }

    const timeTaken = Date.now() - this.startTime;

    // Disable submit button
    const submitBtn = this.overlay.querySelector('.vocabbreak-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = this.getMessage('submitting');
    }

    try {
      let response;
      
      // If this is a Supabase question, validate it locally
      if (this.currentQuestion.id && !this.currentQuestion.id.startsWith('local_')) {
        console.log('🔍 Validating Supabase question locally');
        response = await this.validateSupabaseQuestion(userAnswer);
        
        // CRITICAL: Notify background script of the answer result
        // This updates lastQuestionTime and reschedules the timer
        if (response && response.success) {
          await this.sendMessage({
            type: 'QUESTION_ANSWERED',
            questionId: this.currentQuestion.id,
            isCorrect: response.validation.isCorrect,
            timeTaken: timeTaken
          });
          console.log('📩 Notified background script of answer result');
        }
      } else {
        // Send to background script for local question validation
        response = await this.sendMessage({
          type: 'SUBMIT_ANSWER',
          questionId: this.currentQuestion.id,
          userAnswer: userAnswer,
          timeTaken: timeTaken
        });
      }

      if (response && response.success) {
        // Calculate gamification points and update stats
        if (window.gamificationManager) {
          // First calculate proper points using gamification manager
          let calculatedPoints = 0;
          if (response.validation.isCorrect && this.currentQuestion) {
            const pointsResult = window.gamificationManager.calculatePoints(
              this.currentQuestion,
              true,
              timeTaken,
              window.gamificationManager.getUserStats().currentStreak || 0
            );
            calculatedPoints = pointsResult.totalPoints;
          }
          
          const questionResult = {
            correct: response.validation.isCorrect,
            pointsEarned: calculatedPoints,
            timeTaken: timeTaken,
            question: this.currentQuestion
          };
          
          try {
            const gamificationResult = await window.gamificationManager.updateStats(questionResult);
            
            // Add gamification feedback to response
            response.gamification = gamificationResult;
            response.motivationMessage = window.gamificationManager.getMotivationMessage(questionResult);
            
            console.log('✅ Gamification stats updated:', gamificationResult);
          } catch (error) {
            console.warn('Failed to update gamification stats:', error);
          }
        } else {
          console.warn('Gamification manager not available');
        }
        
        // Also try to record interaction in Supabase if available
        await this.recordInteractionToDatabase(response, timeTaken);
        this.showFeedback(response);
      } else {
        console.error('Failed to submit answer');
        this.showError('Failed to submit answer. Please try again.');
      }

    } catch (error) {
      console.error('Error submitting answer:', error);
      this.showError('An error occurred. Please try again.');
    }
  }

  showFeedback(response) {
    const content = this.overlay.querySelector('#vocabbreak-content');
    const validation = response.validation;
    const isCorrect = validation.isCorrect;

    const feedbackClass = isCorrect ? 'correct' : 'incorrect';
    const feedbackText = validation.feedback;

    content.innerHTML = `
      <div class="vocabbreak-feedback ${feedbackClass}">
        <div>${feedbackText}</div>
        ${validation.explanation ? `<div style="margin-top: 12px; font-size: 14px; opacity: 0.8;">${validation.explanation}</div>` : ''}
      </div>
      ${response.points && response.points.totalPoints > 0 ? 
        `<div style="text-align: center; margin-top: 16px; font-size: 18px; font-weight: bold; color: #28a745;">
          +${response.points.totalPoints} points earned!
        </div>` : ''}
    `;

    const footer = this.overlay.querySelector('#vocabbreak-footer');

    if (isCorrect) {
      this.maybePlayClick(520);
      let gamificationHTML = '';
      
      // Add gamification feedback if available
      if (response.gamification) {
        const gamification = response.gamification;
        let feedbackParts = [];
        
        if (gamification.totalPoints > 0) {
          feedbackParts.push(`🎯 +${gamification.totalPoints} points`);
        }
        
        if (gamification.levelUp) {
          feedbackParts.push(`🎉 Level up! Now ${gamification.newLevel.name}`);
        }
        
        if (gamification.streakBonus) {
          feedbackParts.push(`🔥 Answer streak bonus!`);
        }
        
        // Day streak feedback (Duolingo-style)
        if (gamification.dayStreakExtended) {
          feedbackParts.push(`🔥 Day ${gamification.dayStreak}! Keep it up!`);
        } else if (gamification.dayStreakLost && gamification.previousDayStreak > 0) {
          feedbackParts.push(`💔 Streak reset (was ${gamification.previousDayStreak} days)`);
        }
        
        if (gamification.newAchievements && gamification.newAchievements.length > 0) {
          gamification.newAchievements.forEach(achievement => {
            feedbackParts.push(`🏆 ${achievement.icon} ${achievement.name}`);
          });
        }
        
        if (feedbackParts.length > 0) {
          gamificationHTML = `
            <div class="vocabbreak-points-earned">
              ${feedbackParts.join('<br>')}
            </div>
          `;
        }
      }
      
      // Add motivation message if available
      let motivationHTML = '';
      if (response.motivationMessage) {
        motivationHTML = `<div style="color: #28a745; font-weight: 500; margin-bottom: 10px;">${response.motivationMessage}</div>`;
      }
      
      footer.innerHTML = `
        ${motivationHTML}
        ${gamificationHTML}
        <div style="color: #28a745; font-weight: 500;">${this.getMessage('correct_continue')}</div>
        <button class="vocabbreak-submit" id="vocabbreak-continue-btn" style="background: #28a745;">
          ${this.getMessage('continue')}
        </button>
      `;

      // Add event listener for continue button
      const continueBtn = footer.querySelector('#vocabbreak-continue-btn');
      if (continueBtn) {
        continueBtn.addEventListener('click', () => this.hideOverlay());
      }
      
      // Auto-hide after 3 seconds
      setTimeout(() => {
        this.hideOverlay();
      }, 3000);
      
    } else {
      this.maybePlayClick(160);
      // Show penalty timer
      const penaltyEndTime = response.penaltyEndTime || (Date.now() + 30000);
      this.startPenaltyTimer(penaltyEndTime);
      
      footer.innerHTML = `
        <div class="vocabbreak-penalty">
          <div>${this.getMessage('please_wait')}</div>
          <div class="vocabbreak-timer" id="vocabbreak-penalty-timer">30</div>
        </div>
      `;
    }
  }

  startPenaltyTimer(endTime) {
    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      const timerElement = this.overlay.querySelector('#vocabbreak-penalty-timer');
      
      if (timerElement) {
        timerElement.textContent = remaining;
      }
      
      if (remaining <= 0) {
        this.hideOverlay();
        return;
      }
      
      this.penaltyTimer = setTimeout(updateTimer, 1000);
    };
    
    updateTimer();
  }

  showError(message) {
    const content = this.overlay.querySelector('#vocabbreak-content');
    content.innerHTML = `
      <div class="vocabbreak-feedback incorrect">
        ${message}
      </div>
    `;
    
    const footer = this.overlay.querySelector('#vocabbreak-footer');
    footer.innerHTML = `
      <button class="vocabbreak-submit" id="vocabbreak-close-btn">
        ${this.getMessage('close')}
      </button>
    `;

    // Add event listener for close button
    const closeBtn = footer.querySelector('#vocabbreak-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideOverlay());
    }
  }

  hideOverlay() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    
    if (this.penaltyTimer) {
      clearTimeout(this.penaltyTimer);
      this.penaltyTimer = null;
    }
    
    this.isBlocked = false;
    this.currentQuestion = null;
    this.startTime = null;
  }

  handleMessage(message, sender, sendResponse) {
    console.log('📩 Content script received message:', message.type);
    
    switch (message.type) {
      case 'SHOW_QUESTION':
        console.log(`📩 SHOW_QUESTION received, reason: ${message.reason || 'periodic'}`);
        this.showQuestion(message.reason || 'periodic');
        sendResponse && sendResponse({ success: true });
        break;
        
      case 'GLOBAL_PENALTY':
        console.log(`📩 GLOBAL_PENALTY received, endTime: ${new Date(message.penaltyEndTime).toISOString()}`);
        this.showPenaltyOverlay(message.penaltyEndTime);
        sendResponse && sendResponse({ success: true });
        break;

      case 'PENALTY_CLEARED':
        console.log('📩 PENALTY_CLEARED received');
        this.hideOverlay();
        sendResponse && sendResponse({ success: true });
        break;
      
      case 'SETTINGS_CHANGED':
        console.log('🔄 Settings changed, refreshing question cache...');
        setTimeout(() => this.checkAndRefreshCacheIfNeeded(), 1000);
        sendResponse && sendResponse({ success: true });
        break;
        
      default:
        // Unknown message type
        break;
    }
    
    return true; // Keep message channel open for async responses
  }

  async getTimerSettings() {
    try {
      const result = await chrome.storage.sync.get(['periodicInterval', 'penaltyDuration']);
      const intervalMinutes = Number.isFinite(Number(result.periodicInterval)) && Number(result.periodicInterval) > 0
        ? Number(result.periodicInterval)
        : 30;
      const penaltySeconds = Number.isFinite(Number(result.penaltyDuration)) && Number(result.penaltyDuration) > 0
        ? Number(result.penaltyDuration)
        : 30;

      this.lastTimerSettings = { intervalMinutes, penaltySeconds };
      return this.lastTimerSettings;
    } catch (error) {
      console.warn('Failed to load timer settings for analytics:', error);
      this.lastTimerSettings = { intervalMinutes: 30, penaltySeconds: 30 };
      return this.lastTimerSettings;
    }
  }

  async recordBlockingEvent(eventData) {
    try {
      if (typeof window !== 'undefined' && window.supabaseClient && window.supabaseClient.isAuthenticated()) {
        await window.supabaseClient.recordBlockingEvent({
          triggerType: eventData.triggerType,
          intervalMinutes: eventData.intervalMinutes,
          penaltySeconds: eventData.penaltySeconds,
          siteUrl: window.location.href,
          outcome: eventData.outcome,
          metadata: eventData.metadata || {}
        });
      }
    } catch (error) {
      console.warn('Failed to record blocking event:', error);
    }
  }

  async recordInteractionToDatabase(response, timeTaken) {
    try {
      // Check if Supabase client is available and authenticated
      if (typeof window !== 'undefined' && window.supabaseClient && window.supabaseClient.isAuthenticated()) {
        const timerSettings = this.lastTimerSettings || await this.getTimerSettings();
        await window.supabaseClient.recordInteraction({
          type: 'question_answer',
          targetId: this.currentQuestion.id,
          correct: response.validation.isCorrect,
          timeTaken: timeTaken,
          pointsEarned: response.points?.totalPoints || 0,
          streakAtTime: response.currentStreak || 0,
          answerGiven: response.userAnswer,
          siteUrl: window.location.href,
          triggerType: this.lastTriggerReason || 'periodic',
          deviceInfo: this.getDeviceInfo(),
          browserInfo: this.getBrowserInfo()
        });

        await this.recordBlockingEvent({
          triggerType: this.lastTriggerReason || 'periodic',
          intervalMinutes: timerSettings.intervalMinutes,
          penaltySeconds: timerSettings.penaltySeconds,
          outcome: response.validation.isCorrect ? 'answered_correct' : 'wrong_answer',
          metadata: { questionId: this.currentQuestion.id }
        });
        console.log('✅ Interaction recorded to Supabase');
      } else {
        // Store in offline manager for later sync
        if (window.offlineManager) {
          await window.offlineManager.addToSyncQueue('progress', {
            questionId: this.currentQuestion.id,
            correct: response.validation.isCorrect,
            timeTaken: timeTaken,
            pointsEarned: response.points?.totalPoints || 0,
            streakAtTime: response.currentStreak || 0,
            timestamp: Date.now()
          });
          console.log('📝 Interaction queued for offline sync');
        }
      }
    } catch (error) {
      console.warn('Failed to record interaction to database:', error);
      // Don't throw error - this shouldn't break the user experience
    }
  }

  async validateSupabaseQuestion(userAnswer) {
    try {
      const question = this.currentQuestion;
      if (!question) {
        return { success: false, error: 'No question available' };
      }

      // Get user's interface language setting
      let userLanguage = 'en'; // default fallback
      try {
        const result = await chrome.storage.sync.get(['interfaceLanguage']);
        userLanguage = result.interfaceLanguage || 'en';
      } catch (error) {
        console.warn('Failed to get interface language setting:', error);
      }

      console.log('🔍 Validating answer for question:', question.id);
      console.log('🔍 User answer:', userAnswer);
      console.log('🔍 Question data:', question);

      // Get correct answer(s) - check multiple possible locations
      let correctAnswers = [];
      
      // Check direct correctAnswer field
      if (question.correctAnswer) {
        correctAnswers.push(question.correctAnswer);
      }
      
      // Check answers.correct array
      if (question.answers && question.answers.correct) {
        if (Array.isArray(question.answers.correct)) {
          correctAnswers.push(...question.answers.correct);
        } else {
          correctAnswers.push(question.answers.correct);
        }
      }
      
      // Check content.answers.correct (alternative structure)
      if (question.content && question.content.answers && question.content.answers.correct) {
        if (Array.isArray(question.content.answers.correct)) {
          correctAnswers.push(...question.content.answers.correct);
        } else {
          correctAnswers.push(question.content.answers.correct);
        }
      }

      console.log('🔍 Correct answers found:', correctAnswers);

      // Normalize answers for comparison
      const normalizedUserAnswer = userAnswer.toLowerCase().trim();
      const normalizedCorrectAnswers = correctAnswers.map(ans => ans.toLowerCase().trim());

      console.log('🔍 Normalized user answer:', normalizedUserAnswer);
      console.log('🔍 Normalized correct answers:', normalizedCorrectAnswers);

      // Check if user answer matches any correct answer
      const isCorrect = normalizedCorrectAnswers.some(correct => correct === normalizedUserAnswer);

      // Generate localized feedback
      let feedback = '';
      let explanation = '';
      
      if (isCorrect) {
        feedback = this.getMessage('correct_answer');
        explanation = this.getLocalizedExplanation(userLanguage) || this.getMessage('correct_answer');
      } else {
        // Get penalty time from user settings or use default
        let penaltyTime = 30; // default 30 seconds
        try {
          const result = await chrome.storage.sync.get(['penaltyDuration']);
          penaltyTime = result.penaltyDuration || 30;
        } catch (error) {
          console.warn('Failed to get penalty time setting:', error);
        }
        
        feedback = this.getMessage('incorrect_answer', [penaltyTime]);
        explanation = this.getLocalizedExplanation(userLanguage) || this.getMessage('try_again');
      }

      return {
        success: true,
        validation: {
          isCorrect: isCorrect,
          correctAnswer: correctAnswers[0] || 'unknown',
          explanation: explanation,
          feedback: feedback
        },
        points: { 
          totalPoints: isCorrect ? (question.pointsValue || question.scoring?.base_points || 10) : 0 
        }
      };
    } catch (error) {
      console.error('Error validating Supabase question:', error);
      return { success: false, error: error.message };
    }
  }

  transformDatabaseQuestion(dbQuestion) {
    // Transform Supabase question format to expected local format
    try {
      const questionText = dbQuestion.content?.text || {};
      const answers = dbQuestion.answers || {};
      const metadata = dbQuestion.metadata || {};
      const scoring = dbQuestion.scoring || {};

      // Extract correct answer(s) from various possible structures
      let correctAnswer = '';
      if (answers.correct) {
        if (Array.isArray(answers.correct)) {
          correctAnswer = answers.correct[0] || '';
        } else {
          correctAnswer = answers.correct;
        }
      }

      return {
        id: dbQuestion.id,
        level: metadata.level || 'A1',
        type: metadata.type || 'multiple-choice',
        questionText: {
          en: questionText.en || 'Question text not available',
          vi: questionText.vi || questionText.en || 'Question text not available'
        },
        correctAnswer: correctAnswer,
        answers: answers, // Keep original answers for validation
        options: answers.options?.map(opt => typeof opt === 'string' ? opt : opt.text) || [],
        pointsValue: scoring.base_points || 10,
        explanation: dbQuestion.content?.explanation || {},
        hints: dbQuestion.content?.hints || [],
        difficulty: metadata.difficulty || 5,
        topics: metadata.topics || [],
        estimatedTime: metadata.estimated_time || 30
      };
    } catch (error) {
      console.error('Error transforming database question:', error);
      return null;
    }
  }

  getDeviceInfo() {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screen: {
        width: screen.width,
        height: screen.height
      }
    };
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

  sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response);
      });
    });
  }

  /**
   * Check if user is authenticated by asking background script
   * Questions should only show for logged-in users
   */
  async checkAuthStatus() {
    try {
      const response = await this.sendMessage({ type: 'CHECK_AUTH_STATUS' });
      return response?.isAuthenticated === true;
    } catch (error) {
      console.warn('⚠️ Failed to check auth status:', error);
      return false;
    }
  }

  /**
   * Cache a Supabase question to IndexedDB for connection failure fallback
   */
  async cacheQuestionToIndexedDB(question, userSettings) {
    try {
      if (!window.coreManager || !window.coreManager.storage.indexedDB) {
        return;
      }

      const cacheKey = `question_${question.id}`;
      const cacheData = {
        question: question,
        userSettings: userSettings,
        timestamp: Date.now(),
        source: 'supabase'
      };

      await window.coreManager.setCache(cacheKey, cacheData, {
        persist: true,
        type: 'question'
      });

      console.log('📦 Cached question to IndexedDB:', question.id);
    } catch (error) {
      console.warn('Failed to cache question to IndexedDB:', error);
    }
  }

  /**
   * Get a cached question from IndexedDB that matches user preferences
   */
  async getCachedQuestionFromIndexedDB(userPreferences) {
    try {
      if (!window.coreManager || !window.coreManager.storage.indexedDB) {
        return null;
      }

      // Get all cached questions
      const db = window.coreManager.storage.indexedDB;
      const transaction = db.transaction(['cache'], 'readonly');
      const store = transaction.objectStore('cache');
      const index = store.index('type');
      
      return new Promise((resolve, reject) => {
        const request = index.getAll('question');
        
        request.onsuccess = () => {
          const cachedQuestions = request.result || [];
          console.log(`🗄️ Found ${cachedQuestions.length} cached questions in IndexedDB`);
          
          // Filter questions that match user preferences and are not expired
          const validQuestions = cachedQuestions.filter(cached => {
            if (!cached.data || !cached.data.question) return false;
            
            // Check if cache is not expired (1 hour)
            const maxAge = 3600000; // 1 hour
            if (Date.now() - cached.timestamp > maxAge) {
              return false;
            }
            
            const question = cached.data.question;
            
            // Check if question matches user preferences
            const matchesLevel = !userPreferences.difficultyLevels || 
              userPreferences.difficultyLevels.includes(question.level);
            
            const matchesType = !userPreferences.questionTypes || 
              userPreferences.questionTypes.includes(question.type);
            
            const matchesTopic = !userPreferences.topics || 
              userPreferences.topics.includes('general') ||
              (question.topic && userPreferences.topics.includes(question.topic));
            
            return matchesLevel && matchesType && matchesTopic;
          });

          if (validQuestions.length > 0) {
            // Return a random valid question
            const randomIndex = Math.floor(Math.random() * validQuestions.length);
            const selectedQuestion = validQuestions[randomIndex].data.question;
            console.log(`✅ Selected cached question: ${selectedQuestion.id} (${validQuestions.length} available)`);
            resolve(selectedQuestion);
          } else {
            console.log('📝 No valid cached questions found matching user preferences');
            resolve(null);
          }
        };
        
        request.onerror = () => {
          console.warn('Failed to retrieve cached questions from IndexedDB');
          resolve(null);
        };
      });
    } catch (error) {
      console.warn('Error getting cached question from IndexedDB:', error);
      return null;
    }
  }

  /**
   * Preload questions from Supabase for connection failure fallback
   * This runs in the background to build up a cache of questions
   */
  async preloadQuestionsForCache() {
    try {
      if (!window.supabaseClient) {
        console.log('📝 Skipping question preload: no Supabase client available');
        return;
      }

      console.log('🔄 Preloading questions for connection failure fallback...');

      // Get user preferences
      let userSettings = {
        difficultyLevels: ['A1', 'A2'],
        questionTypes: ['multiple-choice', 'text-input'],
        topics: ['general']
      };

      if (window.coreManager) {
        const userState = window.coreManager.getState('user');
        if (userState?.preferences) {
          userSettings = userState.preferences;
        }
      }

      // Try to get multiple questions for caching
      // Filter topics: if 'general' is selected, don't apply topic filter (show all topics)
      // Otherwise, apply the selected topics
      const topicsToFilter = userSettings.topics && 
                             userSettings.topics.length > 0 && 
                             !userSettings.topics.includes('general') 
                             ? userSettings.topics 
                             : [];
      
      const questionFilters = {
        level: userSettings.difficultyLevels,
        type: userSettings.questionTypes,
        topics: topicsToFilter
      };

      // Clear existing cached questions for these settings first
      await this.clearCachedQuestionsForSettings(userSettings);
      
      // Get exactly 30 questions matching current settings
      const questions = await window.supabaseClient.getQuestions(questionFilters);
      
      if (questions && questions.length > 0) {
        console.log(`📦 Caching exactly 30 questions for current settings...`);
        
        // Cache exactly 30 questions for connection failure fallback
        const questionsToCache = questions.slice(0, 30);
        
        for (const dbQuestion of questionsToCache) {
          try {
            const transformedQuestion = this.transformDatabaseQuestion(dbQuestion);
            await this.cacheQuestionToIndexedDB(transformedQuestion, userSettings);
          } catch (error) {
            console.warn('Failed to cache individual question:', error);
          }
        }
        
        // Store settings hash to detect changes
        const settingsHash = this.getSettingsHash(userSettings);
        await window.coreManager?.setCache('cached_questions_settings', settingsHash, { persist: true });
        
        console.log(`✅ Successfully cached ${questionsToCache.length} questions for connection failure fallback`);
      } else {
        console.log('📝 No questions available for caching');
      }
    } catch (error) {
      console.warn('Failed to preload questions for cache:', error);
    }
  }

  /**
   * Clear cached questions for specific settings to refresh cache
   */
  async clearCachedQuestionsForSettings(userSettings) {
    try {
      if (!window.coreManager || !window.coreManager.storage.indexedDB) {
        return;
      }

      const db = window.coreManager.storage.indexedDB;
      const transaction = db.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      const index = store.index('type');
      
      return new Promise((resolve) => {
        const request = index.getAll('question');
        
        request.onsuccess = async () => {
          const cachedQuestions = request.result || [];
          console.log(`🗑️ Clearing ${cachedQuestions.length} old cached questions...`);
          
          // Delete all cached questions
          const deleteTransaction = db.transaction(['cache'], 'readwrite');
          const deleteStore = deleteTransaction.objectStore('cache');
          
          for (const cached of cachedQuestions) {
            try {
              await deleteStore.delete(cached.key);
            } catch (error) {
              console.warn('Failed to delete cached question:', error);
            }
          }
          
          resolve();
        };
        
        request.onerror = () => {
          console.warn('Failed to clear cached questions');
          resolve();
        };
      });
    } catch (error) {
      console.warn('Error clearing cached questions:', error);
    }
  }

  /**
   * Generate hash of user settings to detect changes
   */
  getSettingsHash(userSettings) {
    const settingsString = JSON.stringify({
      difficultyLevels: (userSettings.difficultyLevels || []).sort(),
      questionTypes: (userSettings.questionTypes || []).sort(), 
      topics: (userSettings.topics || []).sort()
    });
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < settingsString.length; i++) {
      const char = settingsString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  /**
   * Check if settings have changed and refresh cache if needed
   */
  async checkAndRefreshCacheIfNeeded() {
    try {
      if (!window.coreManager) return;

      const userState = window.coreManager.getState('user');
      const currentSettings = userState?.preferences || {
        difficultyLevels: ['A1', 'A2'],
        questionTypes: ['multiple-choice', 'text-input'],
        topics: ['general']
      };

      const currentHash = this.getSettingsHash(currentSettings);
      const cachedHash = await window.coreManager.getCache('cached_questions_settings');

      if (cachedHash !== currentHash) {
        console.log('🔄 User settings changed, refreshing question cache...');
        await this.preloadQuestionsForCache();
      }
    } catch (error) {
      console.warn('Failed to check cache refresh need:', error);
    }
  }

  /**
   * Show message when no questions are available
   */
  showNoQuestionsAvailable() {
    try {
      // Create a simple message overlay
      if (this.overlay) {
        this.overlay.remove();
      }

      this.overlay = document.createElement('div');
      this.overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: Arial, sans-serif;
      `;

      this.overlay.innerHTML = `
        <div style="
          background: white;
          padding: 40px;
          border-radius: 10px;
          text-align: center;
          max-width: 500px;
          margin: 20px;
        ">
          <h2 style="color: #4f46e5; margin-bottom: 20px;">📶 Connection Required</h2>
          <p style="color: #0f172a; margin-bottom: 20px; line-height: 1.5;">
            VocabBreak needs an internet connection to load questions matching your learning preferences. 
            Please check your connection and refresh the page.
          </p>
          <button onclick="window.location.reload()" style="
            background: #4f46e5;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
          ">Refresh Page</button>
        </div>
      `;

      document.body.appendChild(this.overlay);
      console.log('📶 Showed no questions available message');
    } catch (error) {
      console.error('Failed to show no questions message:', error);
    }
  }

  /**
   * Get localized message
   * @param {string} key - Message key
   * @param {Array} substitutions - Array of substitution values
   * @returns {string} Localized message
   */
  getMessage(key, substitutions = []) {
    // Try to use i18n system if available and ready
    if (window.i18n && window.i18n.getMessage && typeof window.i18n.getMessage === 'function') {
      try {
        const message = window.i18n.getMessage(key, substitutions);
        // If i18n returns the key itself, it means the translation is missing
        if (message && message !== key) {
          return message;
        }
      } catch (error) {
        console.warn('i18n.getMessage failed:', error);
      }
    }
    
    // Fallback to English if i18n not available or translation missing
    const fallbacks = {
      'question_header': 'Language Learning Break',
      'question_instruction_mc': 'Choose the correct answer to continue browsing',
      'question_instruction_text': 'Type the correct answer to continue browsing',
      'submit_answer': 'Submit Answer',
      'correct_answer': 'Correct! Well done!',
      'incorrect_answer': 'Incorrect. Please wait $1 seconds to try again.',
      'please_select_answer': 'Please select an answer',
      'please_enter_answer': 'Please enter an answer',
      'submitting': 'Submitting...',
      'correct_continue': 'Correct! You may continue browsing.',
      'continue': 'Continue',
      'please_wait': 'Please wait before trying again',
      'close': 'Close'
    };
    let message = fallbacks[key] || key;
    
    // Handle placeholders
    if (substitutions.length > 0) {
      substitutions.forEach((sub, index) => {
        message = message.replace(`$${index + 1}`, sub);
      });
      message = message.replace(/\$(\w+)\$/g, (match, placeholder) => {
        const index = parseInt(placeholder) - 1;
        return substitutions[index] || match;
      });
    }
    
    return message;
  }
}

// Initialize the blocker
(() => {
  const blocker = new VocabBreakBlocker();
  window.vocabBreakBlocker = blocker;
  // Listen for manual trigger messages
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'SHOW_QUESTION') {
      blocker.showQuestion();
    }
  });
})();



