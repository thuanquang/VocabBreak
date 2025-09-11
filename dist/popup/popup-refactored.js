/**
 * Refactored Popup Manager for VocabBreak Extension
 * Uses centralized state management and improved error handling
 */

class PopupManager {
  constructor() {
    this.unsubscribers = [];
    this.isInitialized = false;
    
    this.init();
  }

  async init() {
    try {
      console.log('🔧 Popup initializing...');

      // Wait for dependencies
      await this.waitForDependencies();

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

  setupEventListeners() {
    try {
      // Login form
      this.addEventListenerSafely('login-btn', 'click', () => this.handleLogin());
      this.addEventListenerSafely('signup-btn', 'click', () => this.handleSignup());
      this.addEventListenerSafely('offline-mode-btn', 'click', () => this.handleOfflineMode());
      
      // Dashboard buttons
      this.addEventListenerSafely('logout-btn', 'click', () => this.handleLogout());
      this.addEventListenerSafely('settings-btn', 'click', () => this.openSettings());
      this.addEventListenerSafely('sync-btn', 'click', () => this.handleSync());
      
      // Error screen
      this.addEventListenerSafely('retry-btn', 'click', () => this.handleRetry());
      
      // Enter key handling for login form
      this.addEventListenerSafely('email', 'keypress', (e) => {
        if (e.key === 'Enter') this.handleLogin();
      });
      this.addEventListenerSafely('password', 'keypress', (e) => {
        if (e.key === 'Enter') this.handleLogin();
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

  async handleLogin() {
    try {
      const email = this.getInputValue('email');
      const password = this.getInputValue('password');

      if (!email || !password) {
        this.showAuthError('Please enter both email and password');
        return;
      }

      const result = await window.authManager.signIn(email, password);
      
      if (!result.success) {
        this.showAuthError(result.error);
      }
      // Success is handled by state change
    } catch (error) {
      window.errorHandler?.handleAuthError(error, { context: 'login' });
      this.showAuthError('Login failed. Please try again.');
    }
  }

  async handleSignup() {
    try {
      const email = this.getInputValue('email');
      const password = this.getInputValue('password');

      if (!email || !password) {
        this.showAuthError('Please enter both email and password');
        return;
      }

      const result = await window.authManager.signUp(email, password, {
        displayName: email.split('@')[0]
      });
      
      if (!result.success) {
        this.showAuthError(result.error);
      }
      // Success is handled by state change
    } catch (error) {
      window.errorHandler?.handleAuthError(error, { context: 'signup' });
      this.showAuthError('Signup failed. Please try again.');
    }
  }

  async handleLogout() {
    try {
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
    try {
      // Set offline user state
      window.stateManager.updateAuthState({
        user: {
          id: 'offline-user',
          email: 'offline@vocabbreak.local',
          created_at: new Date().toISOString()
        },
        isAuthenticated: true,
        session: null
      });

      // Set default user data
      window.stateManager.updateUserState({
        stats: {
          totalPoints: 0,
          currentStreak: 0,
          questionsAnswered: 0,
          accuracyRate: 0,
          currentLevel: 1,
          levelName: 'Beginner',
          levelProgress: 0,
          pointsToNextLevel: 500
        }
      });
    } catch (error) {
      window.errorHandler?.handleUIError(error, { context: 'offline-mode' });
    }
  }

  async handleSync() {
    try {
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
      window.stateManager.updateAppState({ currentScreen: 'loading' });
      setTimeout(() => {
        this.updateUI();
      }, 500);
    } catch (error) {
      window.errorHandler?.handleUIError(error, { context: 'retry' });
    }
  }

  openSettings() {
    try {
      chrome.runtime.openOptionsPage();
    } catch (error) {
      window.errorHandler?.handleUIError(error, { context: 'open-settings' });
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
        window.stateManager.updateAppState({ currentScreen: screenName });
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
      
      // Check if user is authenticated and has no stats, initialize test data
      if (window.supabaseClient && window.supabaseClient.isAuthenticated()) {
        const currentStats = window.gamificationManager.getUserStats();
        if (currentStats.totalPoints === 0 && currentStats.totalQuestions === 0) {
          console.log('🧪 No existing stats found, initializing test stats...');
          await window.gamificationManager.initializeTestStats();
        }
      } else {
        console.log('📊 User not authenticated, using offline mode');
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
        currentStreak: gamificationStats.currentStreak || 0,
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
      
      // Update stat cards
      this.setElementText('current-streak', stats.currentStreak || 0);
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
