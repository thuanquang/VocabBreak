/**
 * Refactored Popup Manager for VocabBreak Extension
 * Uses centralized state management and improved error handling
 */

class PopupManager {
  constructor() {
    this.unsubscribers = [];
    this.isInitialized = false;
    this.userPrefs = { soundEnabled: true, reducedMotion: false };
    this.audioContext = null;
    
    this.init();
  }

  async init() {
    try {
      console.log('🔧 Popup initializing...');

      // Wait for dependencies
      await this.waitForDependencies();

      // Load comfort preferences (sound/motion)
      await this.loadUserPreferences();

      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'sync' && (changes.soundEnabled || changes.reducedMotion)) {
          this.userPrefs = {
            soundEnabled: changes.soundEnabled ? changes.soundEnabled.newValue !== false : this.userPrefs.soundEnabled,
            reducedMotion: changes.reducedMotion ? !!changes.reducedMotion.newValue : this.userPrefs.reducedMotion
          };
          this.applyUserPreferences();
        }
      });

      // Set up event listeners
      this.setupEventListeners();

      // Initialize i18n if available
      if (window.i18n && window.i18n.ready) {
        await window.i18n.ready;
        this.localizeInterface();
      }

      // Subscribe to state changes
      this.subscribeToState();

      // Initialize UI based on current state
      this.updateUI();

      // Refresh stats from gamification manager with database integration
      setTimeout(async () => {
        await this.initializeGamificationStats();
        this.refreshStats();
      }, 1000);

      this.isInitialized = true;
      console.log('✅ Popup initialized');
    } catch (error) {
      window.errorHandler?.handleUIError(error, { context: 'popup-init' });
      this.showError('Failed to initialize popup. Please reload the extension.');
    }
  }

  async waitForDependencies() {
    let attempts = 0;
    while (attempts < 50) {
      if (window.coreManager && window.errorHandler && window.authManager) {
        // Wait for core manager to be initialized
        if (window.coreManager.isInitialized) {
          return;
        }
        // If not initialized, wait for it
        await window.coreManager.init();
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    throw new Error('Required dependencies not available');
  }

  async loadUserPreferences() {
    try {
      const result = await chrome.storage.sync.get(['soundEnabled', 'reducedMotion']);
      this.userPrefs = {
        soundEnabled: result.soundEnabled !== false,
        reducedMotion: !!result.reducedMotion
      };
      this.applyUserPreferences();
    } catch (error) {
      console.warn('Failed to load comfort preferences, using defaults', error);
      this.userPrefs = { soundEnabled: true, reducedMotion: false };
      this.applyUserPreferences();
    }
  }

  applyUserPreferences() {
    try {
      document.body.classList.toggle('reduced-motion', !!this.userPrefs.reducedMotion);
    } catch (error) {
      console.warn('Failed to apply user preferences', error);
    }
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
      gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration + 0.02);
    } catch (error) {
      console.warn('Soft click playback failed', error);
    }
  }

  setupEventListeners() {
    try {
      // Google OAuth only
      this.addEventListenerSafely('google-login-btn', 'click', () => this.handleGoogleLogin());
      
      // Dashboard buttons
      this.addEventListenerSafely('logout-btn', 'click', () => this.handleLogout());
      this.addEventListenerSafely('settings-btn', 'click', () => this.openSettings());
      this.addEventListenerSafely('sync-btn', 'click', () => this.handleSync());
      this.addEventListenerSafely('test-now-btn', 'click', () => this.handleTestNow());
      
      // Error screen
      this.addEventListenerSafely('retry-btn', 'click', () => this.handleRetry());
      
      // Support link - opens options page scrolled to support section
      this.addEventListenerSafely('support-link', 'click', (e) => {
        e.preventDefault();
        this.openSupport();
      });

      // Online/offline listeners are now handled by CoreManager automatically
    } catch (error) {
      window.errorHandler?.handleUIError(error, { context: 'setup-listeners' });
    }
  }

  addEventListenerSafely(elementId, event, handler) {
    try {
      const element = document.getElementById(elementId);
      if (element) {
        element.addEventListener(event, handler);
      } else {
        console.warn(`Element not found: ${elementId}`);
      }
    } catch (error) {
      console.error(`Failed to add listener to ${elementId}:`, error);
    }
  }

  subscribeToState() {
    try {
      // Subscribe to auth state changes
      const unsubAuth = window.coreManager.subscribe('auth', (authState) => {
        this.handleAuthStateChange(authState);
      });
      this.unsubscribers.push(unsubAuth);

      // Subscribe to user state changes
      const unsubUser = window.coreManager.subscribe('user', (userState) => {
        this.handleUserStateChange(userState);
      });
      this.unsubscribers.push(unsubUser);

      // Subscribe to app state changes
      const unsubApp = window.coreManager.subscribe('app', (appState) => {
        this.handleAppStateChange(appState);
      });
      this.unsubscribers.push(unsubApp);
    } catch (error) {
      window.errorHandler?.handleUIError(error, { context: 'subscribe-state' });
    }
  }

  handleAuthStateChange(authState) {
    try {
      if (authState.isLoading) {
        this.showLoadingState();
      } else if (authState.isAuthenticated && authState.user) {
        this.showDashboard();
      } else {
        this.showLoginScreen();
      }

      if (authState.lastError) {
        this.showAuthError(authState.lastError);
      }
    } catch (error) {
      window.errorHandler?.handleUIError(error, { context: 'auth-state-change' });
    }
  }

  handleUserStateChange(userState) {
    try {
      if (userState.profile) {
        this.updateUserInfo(userState.profile);
      }
      
      if (userState.stats) {
        this.updateStatsDisplay(userState.stats);
      }
    } catch (error) {
      window.errorHandler?.handleUIError(error, { context: 'user-state-change' });
    }
  }

  handleAppStateChange(appState) {
    try {
      this.updateSyncStatus(appState.isOnline ? 'synced' : 'offline');
      
      if (appState.lastError) {
        this.showError(appState.lastError.message);
      }
    } catch (error) {
      window.errorHandler?.handleUIError(error, { context: 'app-state-change' });
    }
  }

  updateUI() {
    try {
      const authState = window.coreManager.getState('auth');
      const userState = window.coreManager.getState('user');
      const appState = window.coreManager.getState('app');

      // Update based on current state
      this.handleAuthStateChange(authState);
      this.handleUserStateChange(userState);
      this.handleAppStateChange(appState);
    } catch (error) {
      window.errorHandler?.handleUIError(error, { context: 'update-ui' });
    }
  }

  async handleGoogleLogin() {
    try {
      this.maybePlayClick(320);
      this.showAuthError('');
      const button = document.getElementById('google-login-btn');
      if (button) {
        button.disabled = true;
        button.classList.add('loading');
      }

      const result = await window.authManager.signInWithGoogle();
      if (!result.success) {
        this.showAuthError(result.error || 'Google sign-in failed. Please try again.');
      }
    } catch (error) {
      window.errorHandler?.handleAuthError(error, { context: 'google-login' });
      this.showAuthError('Google sign-in failed. Please try again.');
    } finally {
      const button = document.getElementById('google-login-btn');
      if (button) {
        button.disabled = false;
        button.classList.remove('loading');
      }
    }
  }

  async handleLogin() {
    return this.handleGoogleLogin();
  }

  async handleSignup() {
    return this.handleGoogleLogin();
  }

  async handleLogout() {
    try {
      this.maybePlayClick(200);
      const result = await window.authManager.signOut();
      
      if (!result.success) {
        this.showError('Logout failed. Please try again.');
      }
      
      // Clear form fields
      this.clearFormFields();
    } catch (error) {
      window.errorHandler?.handleAuthError(error, { context: 'logout' });
      this.showError('Logout failed. Please try again.');
    }
  }

  async handleOfflineMode() {
    // Offline mode disabled in Google OAuth-only flow
  }

  async handleSync() {
    try {
      this.maybePlayClick(250);
      window.stateManager.updateAppState({ syncStatus: 'syncing' });
      
      // Simulate sync delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // In production, this would sync with Supabase
      if (window.authManager.isAuthenticated()) {
        await window.authManager.loadUserProfile(window.authManager.getCurrentUser().id);
      }
      
      window.stateManager.updateAppState({ 
        syncStatus: 'success',
        lastSync: new Date().toISOString()
      });
    } catch (error) {
      window.errorHandler?.handleUIError(error, { context: 'sync' });
      window.stateManager.updateAppState({ syncStatus: 'error' });
    }
  }

  handleRetry() {
    try {
      this.maybePlayClick(250);
      // Clear auth/app errors and return to loading
      window.stateManager.updateAuthState({ lastError: null, isLoading: false });
      window.stateManager.updateAppState({ currentScreen: 'loading', lastError: null });
      setTimeout(() => {
        this.updateUI();
      }, 500);
    } catch (error) {
      window.errorHandler?.handleUIError(error, { context: 'retry' });
    }
  }

  openSettings() {
    try {
      this.maybePlayClick(240);
      chrome.runtime.openOptionsPage();
    } catch (error) {
      window.errorHandler?.handleUIError(error, { context: 'open-settings' });
    }
  }

  openSupport() {
    try {
      this.maybePlayClick(280);
      // Open options page with hash to scroll to support section
      chrome.runtime.openOptionsPage(() => {
        // After opening, send a message to scroll to support section
        setTimeout(() => {
          chrome.runtime.sendMessage({ type: 'SCROLL_TO_SUPPORT' });
        }, 500);
      });
    } catch (error) {
      window.errorHandler?.handleUIError(error, { context: 'open-support' });
    }
  }

  async handleTestNow() {
    try {
      this.maybePlayClick(320);
      
      const button = document.getElementById('test-now-btn');
      if (button) {
        button.disabled = true;
        const originalText = button.querySelector('span')?.textContent;
        const textSpan = button.querySelector('span');
        if (textSpan) {
          textSpan.textContent = 'Triggering...';
        }
      }

      console.log('🎯 Test Now clicked - triggering manual block');
      
      const response = await this.sendMessage({ type: 'TRIGGER_BLOCK_NOW' });
      
      if (response && response.success) {
        console.log('✅ Manual block triggered successfully');
        // Close the popup so user can see the question
        window.close();
      } else {
        console.warn('⚠️ Manual block failed:', response?.error);
        this.showAuthError(response?.error || 'Could not trigger question on this page. Try a different website.');
        
        if (button) {
          button.disabled = false;
          const textSpan = button.querySelector('span');
          if (textSpan) {
            textSpan.textContent = 'Test Now';
          }
        }
      }
    } catch (error) {
      console.error('Failed to trigger test:', error);
      window.errorHandler?.handleUIError(error, { context: 'test-now' });
      this.showAuthError('Failed to trigger question. Please try again.');
      
      const button = document.getElementById('test-now-btn');
      if (button) {
        button.disabled = false;
        const textSpan = button.querySelector('span');
        if (textSpan) {
          textSpan.textContent = 'Test Now';
        }
      }
    }
  }

  // UI Helper Methods
  showScreen(screenName) {
    try {
      // Hide all screens
      document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add('hidden');
      });
      
      // Show target screen
      const targetScreen = document.getElementById(`${screenName}-screen`);
      if (targetScreen) {
        targetScreen.classList.remove('hidden');
      }
    } catch (error) {
      window.errorHandler?.handleUIError(error, { context: 'show-screen' });
    }
  }

  showLoadingState() {
    this.showScreen('loading');
  }

  showLoginScreen() {
    this.showScreen('login');
  }

  showDashboard() {
    this.showScreen('dashboard');
  }

  showAuthError(message) {
    try {
      const errorElement = document.getElementById('auth-error');
      if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
        
        // Hide error after 5 seconds
        setTimeout(() => {
          errorElement.classList.add('hidden');
        }, 5000);
      }
    } catch (error) {
      console.error('Failed to show auth error:', error);
    }
  }

  showError(message) {
    try {
      const errorMessageElement = document.getElementById('error-message');
      if (errorMessageElement) {
        errorMessageElement.textContent = message;
      }
      this.showScreen('error');
    } catch (error) {
      console.error('Failed to show error:', error);
    }
  }

  updateUserInfo(profile) {
    try {
      const user = window.authManager.getCurrentUser();
      if (!user) return;
      
      // Update user initial
      const initial = user.email.charAt(0).toUpperCase();
      this.setElementText('user-initial', initial);
      
      // Update user name
      const username = profile?.display_name || user.email.split('@')[0];
      this.setElementText('user-name', username);
    } catch (error) {
      window.errorHandler?.handleUIError(error, { context: 'update-user-info' });
    }
  }

  async initializeGamificationStats() {
    try {
      console.log('🔄 Initializing gamification stats...');
      
      if (!window.gamificationManager) {
        console.warn('Gamification manager not available');
        return;
      }
      
      // Wait for gamification manager to be initialized
      let attempts = 0;
      while (!window.gamificationManager.isInitialized && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      if (!window.gamificationManager.isInitialized) {
        console.warn('Gamification manager failed to initialize');
        return;
      }

    } catch (error) {
      console.error('Failed to initialize gamification stats:', error);
    }
  }

  refreshStats() {
    try {
      console.log('🔄 Refreshing stats from gamification manager...');
      
      if (!window.gamificationManager || !window.gamificationManager.isInitialized) {
        console.warn('Gamification manager not ready');
        return;
      }
      
      const gamificationStats = window.gamificationManager.getUserStats();
      const currentLevel = window.gamificationManager.getCurrentLevel();
      const nextLevelProgress = window.gamificationManager.getNextLevelProgress();
      
      console.log('📊 Gamification stats:', gamificationStats);
      console.log('📈 Current level:', currentLevel);
      
      const stats = {
        dayStreak: gamificationStats.dayStreak || 0,
        isActiveToday: gamificationStats.isActiveToday || false,
        totalPoints: gamificationStats.totalPoints || 0,
        questionsAnswered: gamificationStats.totalQuestions || 0,
        accuracyRate: gamificationStats.totalQuestions > 0 ? 
          Math.round((gamificationStats.correctAnswers / gamificationStats.totalQuestions) * 100) : 0,
        currentLevel: currentLevel.level || 1,
        levelName: currentLevel.name || 'Beginner',
        levelProgress: nextLevelProgress.progress || 0,
        pointsToNextLevel: nextLevelProgress.nextLevel?.points || 500
      };
      
      this.updateStatsDisplay(stats);
    } catch (error) {
      console.error('Failed to refresh stats:', error);
      window.errorHandler?.handleUIError(error, { context: 'refresh-stats' });
    }
  }

  updateStatsDisplay(stats) {
    try {
      if (!stats) {
        console.warn('No stats provided to updateStatsDisplay');
        return;
      }
      
      // Update stat cards - use day streak (Duolingo-style)
      const dayStreakElement = document.getElementById('day-streak');
      if (dayStreakElement) {
        dayStreakElement.textContent = stats.dayStreak || 0;
        // Add visual indicator if active today
        const streakCard = dayStreakElement.closest('.stat-card');
        if (streakCard) {
          streakCard.classList.toggle('active-today', stats.isActiveToday);
        }
      }
      this.setElementText('total-points', this.formatNumber(stats.totalPoints || 0));
      this.setElementText('questions-answered', stats.questionsAnswered || 0);
      this.setElementText('accuracy-rate', `${stats.accuracyRate || 0}%`);
      
      // Update level badge
      this.setElementText('user-level', `Level ${stats.currentLevel || 1}`);
      
      // Update progress bar
      const progressFill = document.getElementById('level-progress-fill');
      const progressText = document.getElementById('progress-text');
      const progressPoints = document.getElementById('progress-points');
      
      if (progressFill) {
        const progressPercentage = Math.max(0, Math.min(100, stats.levelProgress || 0));
        progressFill.style.width = `${progressPercentage}%`;
      }
      
      if (progressText) {
        progressText.textContent = `Level ${stats.currentLevel || 1} - ${stats.levelName || 'Beginner'}`;
      }
      
      if (progressPoints) {
        progressPoints.textContent = `${this.formatNumber(stats.totalPoints || 0)} / ${this.formatNumber(stats.pointsToNextLevel || 500)} points`;
      }

      // Update achievements display
      this.updateRecentAchievements();
    } catch (error) {
      window.errorHandler?.handleUIError(error, { context: 'update-stats-display' });
    }
  }

  updateSyncStatus(status) {
    try {
      const indicator = document.querySelector('.sync-indicator');
      const text = document.querySelector('.sync-text');
      
      if (indicator) {
        indicator.className = 'sync-indicator';
        
        switch (status) {
          case 'syncing':
            indicator.classList.add('syncing');
            break;
          case 'error':
          case 'offline':
            indicator.classList.add('error');
            break;
          default:
            // Default styling for 'synced'
            break;
        }
      }
      
      if (text) {
        const statusTexts = {
          syncing: 'Syncing...',
          error: 'Sync Error',
          offline: 'Offline',
          synced: 'Synced',
          success: 'Synced'
        };
        text.textContent = statusTexts[status] || 'Unknown';
      }
    } catch (error) {
      window.errorHandler?.handleUIError(error, { context: 'update-sync-status' });
    }
  }

  async updateRecentAchievements() {
    try {
      const recentAchievementsContainer = document.getElementById('recent-achievements');
      if (!recentAchievementsContainer) return;

      let achievements = {};
      
      // Try to get achievements from gamification manager first
      if (window.gamificationManager) {
        achievements = window.gamificationManager.getAchievements();
      } else {
        // Fallback to background script
        const response = await this.sendMessage({ type: 'GET_ACHIEVEMENTS' });
        achievements = response?.achievements || {};
      }

      // Filter to show only unlocked achievements (recent ones)
      const unlockedAchievements = Object.values(achievements).filter(a => a.unlocked);

      if (unlockedAchievements.length === 0) {
        recentAchievementsContainer.innerHTML = `
          <div class="no-achievements">
            <p>🏆 Start answering questions to unlock achievements!</p>
          </div>
        `;
        return;
      }

      // Show up to 3 most recent achievements
      const recentAchievements = unlockedAchievements.slice(-3).reverse();
      
      const achievementsHTML = recentAchievements.map(achievement => `
        <div class="achievement-item">
          <div class="achievement-icon">${achievement.icon}</div>
          <div class="achievement-details">
            <div class="achievement-name">${achievement.name}</div>
            <div class="achievement-description">${achievement.description}</div>
          </div>
          <div class="achievement-points">+${achievement.points}</div>
        </div>
      `).join('');
      
      recentAchievementsContainer.innerHTML = `
        <h3>Recent Achievements</h3>
        <div class="achievements-list">
          ${achievementsHTML}
        </div>
      `;
    } catch (error) {
      window.errorHandler?.handleUIError(error, { context: 'update-recent-achievements' });
    }
  }

  async sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response);
      });
    });
  }

  localizeInterface() {
    try {
      if (!window.i18n) {
        console.warn('i18n system not available for localization');
        return;
      }
      
      const elements = document.querySelectorAll('[data-i18n]');
      elements.forEach(element => {
        const key = element.getAttribute('data-i18n');
        const args = element.getAttribute('data-i18n-args');
        const substitutions = args ? args.split(',') : [];
        
        const message = window.i18n.getMessage(key, substitutions);
        if (message && message !== key) {
          if (element.tagName === 'INPUT' && element.type === 'text') {
            element.placeholder = message;
          } else {
            element.textContent = message;
          }
        }
      });
    } catch (error) {
      window.errorHandler?.handleUIError(error, { context: 'localize-interface' });
    }
  }

  // Utility methods
  getInputValue(elementId) {
    try {
      const element = document.getElementById(elementId);
      return element ? element.value.trim() : '';
    } catch (error) {
      return '';
    }
  }

  setElementText(elementId, text) {
    try {
      const element = document.getElementById(elementId);
      if (element) {
        element.textContent = text;
      }
    } catch (error) {
      console.warn(`Failed to set text for element ${elementId}:`, error);
    }
  }

  clearFormFields() {
    try {
      ['email', 'password'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
          element.value = '';
        }
      });
    } catch (error) {
      console.warn('Failed to clear form fields:', error);
    }
  }

  formatNumber(number) {
    try {
      if (number >= 1000000) {
        return (number / 1000000).toFixed(1) + 'M';
      } else if (number >= 1000) {
        return (number / 1000).toFixed(1) + 'K';
      }
      return number.toString();
    } catch (error) {
      return '0';
    }
  }

  // Cleanup
  destroy() {
    try {
      // Unsubscribe from state changes
      this.unsubscribers.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      });
      this.unsubscribers = [];
      
      console.log('✅ Popup manager destroyed');
    } catch (error) {
      console.error('Failed to destroy popup manager:', error);
    }
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  try {
    window.popupManager = new PopupManager();
    
    // Cleanup on unload
    window.addEventListener('beforeunload', () => {
      if (window.popupManager && typeof window.popupManager.destroy === 'function') {
        window.popupManager.destroy();
      }
    });
  } catch (error) {
    console.error('Failed to initialize popup manager:', error);
  }
});
