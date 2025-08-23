/**
 * Popup interface JavaScript for VocabBreak extension
 * Handles authentication, dashboard display, and user interactions
 */

class PopupManager {
  constructor() {
    this.currentScreen = 'loading';
    this.user = null;
    this.stats = null;
    this.isOnline = navigator.onLine;
    
    this.init();
  }

  async init() {
    console.log('Popup initializing...');
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Initialize i18n if available
    if (window.chrome && chrome.i18n) {
      this.localizeInterface();
    }
    
    // Check authentication status
    await this.checkAuthStatus();
    
    // Set up online/offline listeners
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.updateSyncStatus('synced');
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.updateSyncStatus('offline');
    });
  }

  setupEventListeners() {
    // Login form
    document.getElementById('login-btn').addEventListener('click', () => this.handleLogin());
    document.getElementById('signup-btn').addEventListener('click', () => this.handleSignup());
    document.getElementById('offline-mode-btn').addEventListener('click', () => this.handleOfflineMode());
    
    // Dashboard buttons
    document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());
    document.getElementById('settings-btn').addEventListener('click', () => this.openSettings());
    document.getElementById('sync-btn').addEventListener('click', () => this.handleSync());
    
    // Error screen
    document.getElementById('retry-btn').addEventListener('click', () => this.handleRetry());
    
    // Enter key handling for login form
    document.getElementById('email').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleLogin();
    });
    document.getElementById('password').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleLogin();
    });
  }

  localizeInterface() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(element => {
      const key = element.getAttribute('data-i18n');
      const message = chrome.i18n.getMessage(key);
      if (message) {
        if (element.tagName === 'INPUT' && element.type === 'text') {
          element.placeholder = message;
        } else {
          element.textContent = message;
        }
      }
    });
  }

  async checkAuthStatus() {
    try {
      // Check for stored user session
      const result = await chrome.storage.local.get(['userSession']);
      
      if (result.userSession && result.userSession.user) {
        this.user = result.userSession.user;
        await this.loadDashboard();
      } else {
        this.showScreen('login');
      }
    } catch (error) {
      console.error('Failed to check auth status:', error);
      this.showError('Failed to check authentication status');
    }
  }

  async handleLogin() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    
    if (!email || !password) {
      this.showAuthError('Please enter both email and password');
      return;
    }
    
    this.setLoginLoading(true);
    
    try {
      // In production, this would use the Supabase client
      // For now, simulate authentication
      if (email.includes('@') && password.length >= 6) {
        // Simulate successful login
        this.user = {
          id: 'demo-user-id',
          email: email,
          created_at: new Date().toISOString()
        };
        
        // Store user session
        await chrome.storage.local.set({
          userSession: {
            user: this.user,
            access_token: 'demo-token',
            expires_at: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
          }
        });
        
        await this.loadDashboard();
      } else {
        throw new Error('Invalid email or password');
      }
    } catch (error) {
      console.error('Login failed:', error);
      this.showAuthError(error.message || 'Login failed. Please try again.');
    } finally {
      this.setLoginLoading(false);
    }
  }

  async handleSignup() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    
    if (!email || !password) {
      this.showAuthError('Please enter both email and password');
      return;
    }
    
    if (password.length < 6) {
      this.showAuthError('Password must be at least 6 characters long');
      return;
    }
    
    this.setLoginLoading(true);
    
    try {
      // In production, this would use the Supabase client
      // For now, simulate signup
      this.user = {
        id: 'demo-user-id',
        email: email,
        created_at: new Date().toISOString()
      };
      
      // Store user session
      await chrome.storage.local.set({
        userSession: {
          user: this.user,
          access_token: 'demo-token',
          expires_at: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
        }
      });
      
      await this.loadDashboard();
    } catch (error) {
      console.error('Signup failed:', error);
      this.showAuthError(error.message || 'Signup failed. Please try again.');
    } finally {
      this.setLoginLoading(false);
    }
  }

  async handleOfflineMode() {
    this.user = {
      id: 'offline-user',
      email: 'offline@vocabbreak.local',
      created_at: new Date().toISOString()
    };
    
    await this.loadDashboard();
  }

  async handleLogout() {
    try {
      // Clear stored session
      await chrome.storage.local.remove(['userSession']);
      
      // Reset state
      this.user = null;
      this.stats = null;
      
      // Clear form fields
      document.getElementById('email').value = '';
      document.getElementById('password').value = '';
      
      this.showScreen('login');
    } catch (error) {
      console.error('Logout failed:', error);
      this.showError('Failed to logout');
    }
  }

  async loadDashboard() {
    try {
      this.showScreen('dashboard');
      
      // Update user info
      this.updateUserInfo();
      
      // Load stats
      await this.loadStats();
      
      // Load recent achievements
      await this.loadRecentAchievements();
      
      // Update sync status
      this.updateSyncStatus(this.isOnline ? 'synced' : 'offline');
      
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      this.showError('Failed to load dashboard');
    }
  }

  updateUserInfo() {
    if (!this.user) return;
    
    // Update user initial
    const initial = this.user.email.charAt(0).toUpperCase();
    document.getElementById('user-initial').textContent = initial;
    
    // Update user name (use email prefix)
    const username = this.user.email.split('@')[0];
    document.getElementById('user-name').textContent = username;
  }

  async loadStats() {
    try {
      // Get stats from background script
      const response = await this.sendMessage({ type: 'GET_STATS' });
      
      if (response && response.stats) {
        this.stats = response.stats;
      } else {
        // Use default stats
        this.stats = {
          currentStreak: 0,
          totalPoints: 0,
          questionsAnswered: 0,
          accuracyRate: 0,
          currentLevel: 1,
          levelName: 'Beginner',
          levelProgress: 0,
          pointsToNextLevel: 500
        };
      }
      
      this.updateStatsDisplay();
    } catch (error) {
      console.error('Failed to load stats:', error);
      // Use default stats on error
      this.stats = {
        currentStreak: 0,
        totalPoints: 0,
        questionsAnswered: 0,
        accuracyRate: 0,
        currentLevel: 1,
        levelName: 'Beginner',
        levelProgress: 0,
        pointsToNextLevel: 500
      };
      this.updateStatsDisplay();
    }
  }

  updateStatsDisplay() {
    if (!this.stats) return;
    
    // Update stat cards
    document.getElementById('current-streak').textContent = this.stats.currentStreak || 0;
    document.getElementById('total-points').textContent = this.formatNumber(this.stats.totalPoints || 0);
    document.getElementById('questions-answered').textContent = this.stats.questionsAnswered || 0;
    document.getElementById('accuracy-rate').textContent = `${this.stats.accuracyRate || 0}%`;
    
    // Update level badge
    document.getElementById('user-level').textContent = `Level ${this.stats.currentLevel || 1}`;
    
    // Update progress bar
    const progressFill = document.getElementById('level-progress-fill');
    const progressText = document.getElementById('progress-text');
    const progressPoints = document.getElementById('progress-points');
    
    const progressPercentage = this.stats.levelProgress || 0;
    progressFill.style.width = `${Math.min(progressPercentage, 100)}%`;
    
    progressText.textContent = `Level ${this.stats.currentLevel || 1} - ${this.stats.levelName || 'Beginner'}`;
    progressPoints.textContent = `${this.formatNumber(this.stats.totalPoints || 0)} / ${this.formatNumber(this.stats.pointsToNextLevel || 500)} points`;
  }

  async loadRecentAchievements() {
    const achievementsContainer = document.getElementById('recent-achievements');
    
    // For demo purposes, show sample achievements
    const sampleAchievements = [
      {
        id: 'first_correct',
        name: 'First Success',
        description: 'Answer your first question correctly',
        icon: '🎯',
        unlockedAt: Date.now() - (2 * 24 * 60 * 60 * 1000) // 2 days ago
      }
    ];
    
    // Only show achievements from the last 7 days
    const recentAchievements = sampleAchievements.filter(
      achievement => Date.now() - achievement.unlockedAt < (7 * 24 * 60 * 60 * 1000)
    );
    
    if (recentAchievements.length > 0) {
      achievementsContainer.innerHTML = `
        <h3 style="margin-bottom: 12px; font-size: 16px; font-weight: 600; color: #2d3748; padding: 0 24px;">Recent Achievements</h3>
        ${recentAchievements.map(achievement => `
          <div class="achievement-item">
            <div class="achievement-icon">${achievement.icon}</div>
            <div class="achievement-content">
              <h4>${achievement.name}</h4>
              <p>${achievement.description}</p>
            </div>
          </div>
        `).join('')}
      `;
    } else {
      achievementsContainer.innerHTML = '';
    }
  }

  async handleSync() {
    this.updateSyncStatus('syncing');
    
    try {
      // Simulate sync delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // In production, this would sync with Supabase
      await this.loadStats();
      
      this.updateSyncStatus('synced');
    } catch (error) {
      console.error('Sync failed:', error);
      this.updateSyncStatus('error');
    }
  }

  updateSyncStatus(status) {
    const indicator = document.querySelector('.sync-indicator');
    const text = document.querySelector('.sync-text');
    
    indicator.className = 'sync-indicator';
    
    switch (status) {
      case 'syncing':
        indicator.classList.add('syncing');
        text.textContent = 'Syncing...';
        break;
      case 'error':
        indicator.classList.add('error');
        text.textContent = 'Sync Error';
        break;
      case 'offline':
        indicator.classList.add('error');
        text.textContent = 'Offline';
        break;
      default:
        text.textContent = 'Synced';
    }
  }

  openSettings() {
    chrome.runtime.openOptionsPage();
  }

  setLoginLoading(loading) {
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    
    if (loading) {
      loginBtn.disabled = true;
      signupBtn.disabled = true;
      loginBtn.textContent = 'Logging in...';
    } else {
      loginBtn.disabled = false;
      signupBtn.disabled = false;
      loginBtn.textContent = 'Login';
    }
  }

  showAuthError(message) {
    const errorElement = document.getElementById('auth-error');
    errorElement.textContent = message;
    errorElement.classList.remove('hidden');
    
    // Hide error after 5 seconds
    setTimeout(() => {
      errorElement.classList.add('hidden');
    }, 5000);
  }

  showScreen(screenName) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.add('hidden');
    });
    
    // Show target screen
    const targetScreen = document.getElementById(`${screenName}-screen`);
    if (targetScreen) {
      targetScreen.classList.remove('hidden');
      this.currentScreen = screenName;
    }
  }

  showError(message) {
    document.getElementById('error-message').textContent = message;
    this.showScreen('error');
  }

  handleRetry() {
    this.showScreen('loading');
    setTimeout(() => {
      this.checkAuthStatus();
    }, 500);
  }

  formatNumber(number) {
    if (number >= 1000000) {
      return (number / 1000000).toFixed(1) + 'M';
    } else if (number >= 1000) {
      return (number / 1000).toFixed(1) + 'K';
    }
    return number.toString();
  }

  sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response);
      });
    });
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});



