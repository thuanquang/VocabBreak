/**
 * Content script for VocabBreak extension
 * Handles the blocking overlay and question interface injection
 */

class VocabBreakBlocker {
  constructor() {
    this.overlay = null;
    this.isBlocked = false;
    this.currentQuestion = null;
    this.startTime = null;
    this.penaltyTimer = null;
    this.isInitialized = false;
    
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
    // Check if we should block this page
    const response = await this.sendMessage({ type: 'REQUEST_BLOCK_CHECK' });
    
    if (response && response.shouldBlock) {
      this.showQuestion();
    }

    // Set up message listener
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
    });

    // Prevent easy bypassing
    this.setupBypassPrevention();

    this.isInitialized = true;
    window.vocabBreakBlocker = this;
    
    console.log('VocabBreak blocker initialized');
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

  async showQuestion() {
    if (this.isBlocked) return; // Already showing

    try {
      // Try to get question from Supabase first (if available)
      let question = null;
      
      if (typeof window !== 'undefined' && window.supabaseClient) {
        try {
          // Wait for client to be ready, but don't block forever
          if (window.supabaseReadyPromise && typeof window.supabaseReadyPromise.then === 'function') {
            await Promise.race([
              window.supabaseReadyPromise,
              new Promise(resolve => setTimeout(resolve, 4000))
            ]);
          }

          // console.log('🔍 Attempting to fetch question from Supabase...');
          
          // Get user settings from chrome storage
          let userSettings = null;
          try {
            const result = await chrome.storage.sync.get([
              'difficultyLevels', 
              'questionTypes', 
              'topics'
            ]);
            userSettings = {
              difficultyLevels: result.difficultyLevels || ['A1', 'A2'],
              questionTypes: result.questionTypes || ['multiple-choice', 'text-input'],
              topics: result.topics || ['general']
            };
            // console.log('🔍 Loaded user settings:', userSettings);
          } catch (error) {
            console.warn('⚠️ Failed to load user settings, using defaults:', error);
            userSettings = {
              difficultyLevels: ['A1', 'A2'],
              questionTypes: ['multiple-choice', 'text-input'],
              topics: ['general']
            };
          }
          
          // Define filters for question selection based on user settings
          const questionFilters = {
            level: userSettings.difficultyLevels,
            type: userSettings.questionTypes,
            topics: userSettings.topics.length > 0 && userSettings.topics[0] !== 'general' ? userSettings.topics : undefined
          };
          
          // console.log('🔍 Using question filters based on user settings:', JSON.stringify(questionFilters, null, 2));
          const dbQuestion = await window.supabaseClient.getRandomQuestion(questionFilters);
          
          if (dbQuestion) {
            // Transform database question to expected format
            question = this.transformDatabaseQuestion(dbQuestion);
            // console.log('✅ Question fetched from Supabase:', dbQuestion.id);
            // console.log('🔍 Raw database question structure:', dbQuestion);
            // console.log('🔍 Transformed question structure:', question);
          } else {
            // console.log('📝 No questions returned from Supabase');
          }
        } catch (dbError) {
          if (window.errorHandler) {
            window.errorHandler.handleDatabaseError(dbError, { stage: 'fetch-question', context: 'content-script' });
          } else {
            console.warn('Failed to fetch question from Supabase:', dbError);
          }
        }
      }
      
      // Fallback to background script (local questions) if no database question
      if (!question) {
        console.log('📝 No Supabase question available, falling back to local questions');
        const response = await this.sendMessage({ type: 'GET_QUESTION' });
        
        if (!response || !response.success) {
          console.error('Failed to get question from background script');
          return;
        }
        
        question = response.question;
        console.log('📝 Using local question from background script');
      } else {
        console.log('✅ Using Supabase question:', question.id);
      }

      this.currentQuestion = question;
      this.isBlocked = true;
      this.startTime = Date.now();

      this.createOverlay();
      this.renderQuestion();

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
          <h2 id="vocabbreak-title">Language Learning Break</h2>
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

    // Force overlay to be on top and unbypassable
    this.overlay.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: rgba(0, 0, 0, 0.9) !important;
      backdrop-filter: blur(10px) !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      pointer-events: all !important;
    `;

    // Style the modal
    const modal = this.overlay.querySelector('.vocabbreak-modal');
    modal.style.cssText = `
      background: white !important;
      border-radius: 12px !important;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
      max-width: 500px !important;
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
        border-bottom: 1px solid #eee !important;
        text-align: center !important;
      }
      
      #vocabbreak-title {
        margin: 0 !important;
        font-size: 24px !important;
        font-weight: 600 !important;
        color: #333 !important;
      }
      
      .vocabbreak-streak {
        margin-top: 8px !important;
        font-size: 14px !important;
        color: #666 !important;
      }
      
      .vocabbreak-content {
        padding: 24px !important;
      }
      
      .vocabbreak-question {
        font-size: 18px !important;
        font-weight: 500 !important;
        color: #333 !important;
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
        border: 2px solid #e0e0e0 !important;
        border-radius: 8px !important;
        background: white !important;
        cursor: pointer !important;
        font-size: 16px !important;
        transition: all 0.2s ease !important;
      }
      
      .vocabbreak-option:hover {
        border-color: #007bff !important;
        background: #f8f9fa !important;
      }
      
      .vocabbreak-option.selected {
        border-color: #007bff !important;
        background: #e3f2fd !important;
      }
      
      .vocabbreak-text-input {
        padding: 12px 16px !important;
        border: 2px solid #e0e0e0 !important;
        border-radius: 8px !important;
        font-size: 16px !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      
      .vocabbreak-text-input:focus {
        outline: none !important;
        border-color: #007bff !important;
      }
      
      .vocabbreak-footer {
        padding: 16px 24px 24px 24px !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
      }
      
      .vocabbreak-submit {
        background: #007bff !important;
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
        background: #0056b3 !important;
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
      }
      
      .vocabbreak-timer {
        font-size: 24px !important;
        font-weight: bold !important;
        margin: 16px 0 !important;
      }
    `;
    
    document.head.appendChild(style);
  }

  renderQuestion() {
    if (!this.currentQuestion) return;

    const content = this.overlay.querySelector('#vocabbreak-content');
    const footer = this.overlay.querySelector('#vocabbreak-footer');

    // Get question text (default to English for now)
    const questionText = this.currentQuestion.questionText?.en || 
                        this.currentQuestion.questionText?.vi || 
                        this.currentQuestion.content?.text?.en || 
                        this.currentQuestion.content?.text?.vi ||
                        'Question text not available';

    if (this.currentQuestion.type === 'multiple-choice') {
      content.innerHTML = `
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
        <div class="vocabbreak-question">${questionText}</div>
        <input type="text" class="vocabbreak-text-input" id="vocabbreak-text-input" 
               placeholder="Type your answer here...">
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
        Submit Answer
      </button>
    `;

    // Add event listeners after DOM is created
    this.setupQuestionEventListeners();
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
  }

  async submitAnswer() {
    let userAnswer = '';

    if (this.currentQuestion.type === 'multiple-choice') {
      const selected = this.overlay.querySelector('.vocabbreak-option.selected');
      if (!selected) {
        alert('Please select an answer');
        return;
      }
      userAnswer = selected.dataset.value;
    } else if (this.currentQuestion.type === 'text-input') {
      const input = this.overlay.querySelector('#vocabbreak-text-input');
      userAnswer = input.value.trim();
      if (!userAnswer) {
        alert('Please enter an answer');
        return;
      }
    }

    const timeTaken = Date.now() - this.startTime;

    // Disable submit button
    const submitBtn = this.overlay.querySelector('.vocabbreak-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
    }

    try {
      let response;
      
      // If this is a Supabase question, validate it locally
      if (this.currentQuestion.id && !this.currentQuestion.id.startsWith('local_')) {
        console.log('🔍 Validating Supabase question locally');
        response = this.validateSupabaseQuestion(userAnswer);
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
      footer.innerHTML = `
        <div style="color: #28a745; font-weight: 500;">Correct! You may continue browsing.</div>
        <button class="vocabbreak-submit" id="vocabbreak-continue-btn" style="background: #28a745;">
          Continue
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
      // Show penalty timer
      const penaltyEndTime = response.penaltyEndTime || (Date.now() + 30000);
      this.startPenaltyTimer(penaltyEndTime);
      
      footer.innerHTML = `
        <div class="vocabbreak-penalty">
          <div>Please wait before trying again</div>
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
        Close
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
    switch (message.type) {
      case 'SHOW_QUESTION':
        this.showQuestion();
        break;
        
      case 'PENALTY_CLEARED':
        this.hideOverlay();
        break;
        
      default:
        // Unknown message type
        break;
    }
  }

  async recordInteractionToDatabase(response, timeTaken) {
    try {
      // Check if Supabase client is available and authenticated
      if (typeof window !== 'undefined' && window.supabaseClient && window.supabaseClient.isAuthenticated()) {
        await window.supabaseClient.recordInteraction({
          type: 'question_answer',
          targetId: this.currentQuestion.id,
          correct: response.validation.isCorrect,
          timeTaken: timeTaken,
          pointsEarned: response.points?.totalPoints || 0,
          streakAtTime: response.currentStreak || 0,
          answerGiven: response.userAnswer,
          siteUrl: window.location.href,
          triggerType: 'periodic', // Since we only use 30-min timer now
          deviceInfo: this.getDeviceInfo(),
          browserInfo: this.getBrowserInfo()
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

  validateSupabaseQuestion(userAnswer) {
    try {
      const question = this.currentQuestion;
      if (!question) {
        return { success: false, error: 'No question available' };
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

      // Generate feedback
      let feedback = '';
      let explanation = '';
      
      if (isCorrect) {
        feedback = 'Correct! Well done!';
        explanation = question.explanation?.en || 'Great job! You got it right.';
      } else {
        feedback = `Not quite right. The correct answer is: ${correctAnswers[0] || 'unknown'}`;
        explanation = question.explanation?.en || 'Keep trying!';
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
}

// Initialize the blocker
const vocabBreakBlocker = new VocabBreakBlocker();



