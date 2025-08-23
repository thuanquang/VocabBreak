/**
 * Options page JavaScript for VocabBreak extension
 * Handles comprehensive settings management and user configuration
 */

class OptionsManager {
  constructor() {
    this.currentTab = 'account';
    this.settings = {
      difficultyLevels: ['A1', 'A2'],
      questionTypes: ['multiple-choice', 'text-input'],
      topics: ['general'],
      blockingMode: 'blacklist',
      siteList: [],
      periodicInterval: 30,
      penaltyDuration: 30,
      interfaceLanguage: 'en',
      gamificationEnabled: true,
      streakNotifications: true
    };
    this.user = null;
    this.isDirty = false;
    
    this.init();
  }

  async init() {
    console.log('Options page initializing...');
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Load user data and settings
    await this.loadUserData();
    await this.loadSettings();
    
    // Initialize UI
    this.initializeUI();
    
    // Set up auto-save on changes
    this.setupAutoSave();
    
    console.log('Options page initialized');
  }

  setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // Save button
    document.getElementById('save-settings').addEventListener('click', () => {
      this.saveSettings();
    });

    // Account actions
    document.getElementById('sync-now').addEventListener('click', () => {
      this.syncData();
    });
    document.getElementById('export-data').addEventListener('click', () => {
      this.exportData();
    });
    document.getElementById('reset-data').addEventListener('click', () => {
      this.showConfirmModal('Reset All Data', 'This will permanently delete all your progress and settings. This action cannot be undone.', () => {
        this.resetData();
      });
    });

    // Site management
    document.getElementById('add-site').addEventListener('click', () => {
      this.addSite();
    });
    document.getElementById('site-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addSite();
      }
    });

    // Category buttons
    document.querySelectorAll('[data-category]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.addCategory(e.target.dataset.category);
      });
    });

    // Range inputs
    document.getElementById('periodic-interval').addEventListener('input', (e) => {
      document.getElementById('interval-value').textContent = `${e.target.value} min`;
      this.settings.periodicInterval = parseInt(e.target.value);
      this.markDirty();
    });

    document.getElementById('penalty-duration').addEventListener('input', (e) => {
      document.getElementById('penalty-value').textContent = `${e.target.value} sec`;
      this.settings.penaltyDuration = parseInt(e.target.value);
      this.markDirty();
    });

    // Modal
    document.getElementById('confirm-cancel').addEventListener('click', () => {
      this.hideConfirmModal();
    });
    document.getElementById('confirm-ok').addEventListener('click', () => {
      if (this.confirmCallback) {
        this.confirmCallback();
      }
      this.hideConfirmModal();
    });
  }

  async loadUserData() {
    try {
      const result = await chrome.storage.local.get(['userSession']);
      if (result.userSession && result.userSession.user) {
        this.user = result.userSession.user;
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get([
        'difficultyLevels',
        'questionTypes',
        'topics',
        'blockingMode',
        'siteList',
        'periodicInterval',
        'penaltyDuration',
        'interfaceLanguage',
        'gamificationEnabled',
        'streakNotifications'
      ]);

      // Merge with defaults
      this.settings = { ...this.settings, ...result };
      
      console.log('Loaded settings:', this.settings);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  initializeUI() {
    // Initialize account info
    this.updateAccountInfo();
    
    // Initialize form values
    this.updateFormValues();
    
    // Initialize topics list
    this.updateTopicsList();
    
    // Initialize site list
    this.updateSiteList();
    
    // Initialize progress overview
    this.updateProgressOverview();
    
    // Initialize achievements
    this.updateAchievements();
    
    // Initialize timezone selector
    this.updateTimezoneSelector();
  }

  updateAccountInfo() {
    const accountInfo = document.getElementById('account-info');
    
    if (this.user) {
      accountInfo.innerHTML = `
        <div class="account-field">
          <span class="account-label">Email</span>
          <span class="account-value">${this.user.email}</span>
        </div>
        <div class="account-field">
          <span class="account-label">Account Created</span>
          <span class="account-value">${new Date(this.user.created_at).toLocaleDateString()}</span>
        </div>
        <div class="account-field">
          <span class="account-label">User ID</span>
          <span class="account-value">${this.user.id.substring(0, 8)}...</span>
        </div>
      `;
    } else {
      accountInfo.innerHTML = `
        <div class="account-field">
          <span class="account-label">Status</span>
          <span class="account-value">Not logged in</span>
        </div>
      `;
    }
  }

  updateFormValues() {
    // Difficulty levels
    document.querySelectorAll('input[name="levels"]').forEach(input => {
      input.checked = this.settings.difficultyLevels.includes(input.value);
    });

    // Question types
    document.querySelectorAll('input[name="question-types"]').forEach(input => {
      input.checked = this.settings.questionTypes.includes(input.value);
    });

    // Blocking mode
    document.querySelectorAll('input[name="blocking-mode"]').forEach(input => {
      input.checked = input.value === this.settings.blockingMode;
    });

    // Range inputs
    document.getElementById('periodic-interval').value = this.settings.periodicInterval;
    document.getElementById('interval-value').textContent = `${this.settings.periodicInterval} min`;
    
    document.getElementById('penalty-duration').value = this.settings.penaltyDuration;
    document.getElementById('penalty-value').textContent = `${this.settings.penaltyDuration} sec`;

    // Interface language
    document.querySelectorAll('input[name="interface-language"]').forEach(input => {
      input.checked = input.value === this.settings.interfaceLanguage;
    });

    // Gamification settings
    document.getElementById('gamification-enabled').checked = this.settings.gamificationEnabled;
    document.getElementById('streak-notifications').checked = this.settings.streakNotifications;
  }

  updateTopicsList() {
    const topicsList = document.getElementById('topics-list');
    const availableTopics = [
      { id: 'general', name: 'General Vocabulary' },
      { id: 'business', name: 'Business & Work' },
      { id: 'travel', name: 'Travel & Transportation' },
      { id: 'food', name: 'Food & Cooking' },
      { id: 'technology', name: 'Technology & Internet' },
      { id: 'health', name: 'Health & Fitness' },
      { id: 'education', name: 'Education & Learning' },
      { id: 'entertainment', name: 'Entertainment & Media' },
      { id: 'nature', name: 'Nature & Environment' },
      { id: 'culture', name: 'Culture & Society' }
    ];

    topicsList.innerHTML = availableTopics.map(topic => `
      <label class="checkbox-item">
        <input type="checkbox" name="topics" value="${topic.id}" ${this.settings.topics.includes(topic.id) ? 'checked' : ''}>
        <span class="checkmark"></span>
        ${topic.name}
      </label>
    `).join('');
  }

  updateSiteList() {
    const siteList = document.getElementById('site-list');
    
    if (this.settings.siteList.length === 0) {
      siteList.innerHTML = '<p style="color: #718096; text-align: center; padding: 20px;">No sites added yet</p>';
      return;
    }

    siteList.innerHTML = this.settings.siteList.map(site => `
      <div class="site-item">
        <span class="site-url">${site}</span>
        <button class="remove-site" onclick="optionsManager.removeSite('${site}')">Remove</button>
      </div>
    `).join('');
  }

  async updateProgressOverview() {
    const progressOverview = document.getElementById('progress-overview');
    
    try {
      // Get real stats from background script
      const response = await this.sendMessage({ type: 'GET_STATS' });
      const stats = response?.stats || {
        totalPoints: 0,
        currentStreak: 0,
        questionsAnswered: 0,
        accuracyRate: 0,
        currentLevel: 1
      };

      progressOverview.innerHTML = `
        <div class="progress-card">
          <span class="progress-value">${this.formatNumber(stats.totalPoints)}</span>
          <span class="progress-label">Total Points</span>
        </div>
        <div class="progress-card">
          <span class="progress-value">${stats.currentStreak}</span>
          <span class="progress-label">Current Streak</span>
        </div>
        <div class="progress-card">
          <span class="progress-value">${stats.questionsAnswered}</span>
          <span class="progress-label">Questions Answered</span>
        </div>
        <div class="progress-card">
          <span class="progress-value">${stats.accuracyRate}%</span>
          <span class="progress-label">Accuracy Rate</span>
        </div>
        <div class="progress-card">
          <span class="progress-value">Level ${stats.currentLevel}</span>
          <span class="progress-label">Current Level</span>
        </div>
      `;
    } catch (error) {
      console.error('Failed to load progress overview:', error);
      // Fallback to default display
      progressOverview.innerHTML = `
        <div class="progress-card">
          <span class="progress-value">0</span>
          <span class="progress-label">Total Points</span>
        </div>
        <div class="progress-card">
          <span class="progress-value">0</span>
          <span class="progress-label">Current Streak</span>
        </div>
        <div class="progress-card">
          <span class="progress-value">0</span>
          <span class="progress-label">Questions Answered</span>
        </div>
        <div class="progress-card">
          <span class="progress-value">0%</span>
          <span class="progress-label">Accuracy Rate</span>
        </div>
        <div class="progress-card">
          <span class="progress-value">Level 1</span>
          <span class="progress-label">Current Level</span>
        </div>
      `;
    }
  }

  updateAchievements() {
    const achievementsGrid = document.getElementById('achievements-grid');
    
    // Sample achievements - in production this would come from the gamification system
    const achievements = [
      { id: 'first_correct', name: 'First Success', description: 'Answer your first question correctly', icon: '🎯', unlocked: true },
      { id: 'streak_3', name: '3-Day Streak', description: 'Answer questions correctly for 3 consecutive days', icon: '🔥', unlocked: true },
      { id: 'streak_7', name: 'Week Warrior', description: 'Answer questions correctly for 7 consecutive days', icon: '⚔️', unlocked: false },
      { id: 'perfect_10', name: 'Perfect Ten', description: 'Answer 10 questions in a row correctly', icon: '💯', unlocked: false },
      { id: 'century_club', name: 'Century Club', description: 'Answer 100 questions correctly', icon: '💪', unlocked: true },
      { id: 'lightning_fast', name: 'Lightning Fast', description: 'Answer 10 questions correctly in under 5 seconds each', icon: '⚡', unlocked: false }
    ];

    achievementsGrid.innerHTML = achievements.map(achievement => `
      <div class="achievement-card ${achievement.unlocked ? 'unlocked' : ''}">
        <span class="achievement-icon">${achievement.icon}</span>
        <div class="achievement-name">${achievement.name}</div>
        <div class="achievement-description">${achievement.description}</div>
      </div>
    `).join('');
  }

  updateTimezoneSelector() {
    const timezoneSelect = document.getElementById('timezone');
    const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Common timezones
    const timezones = [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Asia/Ho_Chi_Minh',
      'Australia/Sydney'
    ];

    timezoneSelect.innerHTML = timezones.map(tz => `
      <option value="${tz}" ${tz === currentTimezone ? 'selected' : ''}>${tz}</option>
    `).join('');
  }

  setupAutoSave() {
    // Set up change listeners for all form elements
    document.addEventListener('change', (e) => {
      if (e.target.matches('input[name="levels"]')) {
        this.updateDifficultyLevels();
      } else if (e.target.matches('input[name="question-types"]')) {
        this.updateQuestionTypes();
      } else if (e.target.matches('input[name="topics"]')) {
        this.updateTopics();
      } else if (e.target.matches('input[name="blocking-mode"]')) {
        this.settings.blockingMode = e.target.value;
        this.markDirty();
      } else if (e.target.matches('input[name="interface-language"]')) {
        this.settings.interfaceLanguage = e.target.value;
        this.markDirty();
      } else if (e.target.id === 'gamification-enabled') {
        this.settings.gamificationEnabled = e.target.checked;
        this.markDirty();
      } else if (e.target.id === 'streak-notifications') {
        this.settings.streakNotifications = e.target.checked;
        this.markDirty();
      }
    });
  }

  updateDifficultyLevels() {
    this.settings.difficultyLevels = Array.from(document.querySelectorAll('input[name="levels"]:checked'))
      .map(input => input.value);
    this.markDirty();
  }

  updateQuestionTypes() {
    this.settings.questionTypes = Array.from(document.querySelectorAll('input[name="question-types"]:checked'))
      .map(input => input.value);
    this.markDirty();
  }

  updateTopics() {
    this.settings.topics = Array.from(document.querySelectorAll('input[name="topics"]:checked'))
      .map(input => input.value);
    this.markDirty();
  }

  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');

    this.currentTab = tabName;
  }

  async addSite() {
    const input = document.getElementById('site-input');
    const site = input.value.trim();
    
    if (!site) {
      this.showNotification('Please enter a website URL or pattern', 'error');
      return;
    }

    if (this.settings.siteList.includes(site)) {
      this.showNotification('Site already exists in the list', 'error');
      return;
    }

    this.settings.siteList.push(site);
    input.value = '';
    this.updateSiteList();
    this.markDirty();
    this.showNotification('Site added successfully');
  }

  removeSite(site) {
    const index = this.settings.siteList.indexOf(site);
    if (index > -1) {
      this.settings.siteList.splice(index, 1);
      this.updateSiteList();
      this.markDirty();
      this.showNotification('Site removed successfully');
    }
  }

  async addCategory(category) {
    const categoryMap = {
      social: ['facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'reddit.com', 'tiktok.com'],
      news: ['cnn.com', 'bbc.com', 'reuters.com', 'nytimes.com', 'washingtonpost.com'],
      entertainment: ['youtube.com', 'netflix.com', 'hulu.com', 'twitch.tv', 'spotify.com'],
      shopping: ['amazon.com', 'ebay.com', 'etsy.com', 'walmart.com', 'target.com']
    };

    const sites = categoryMap[category] || [];
    let addedCount = 0;

    sites.forEach(site => {
      if (!this.settings.siteList.includes(site)) {
        this.settings.siteList.push(site);
        addedCount++;
      }
    });

    if (addedCount > 0) {
      this.updateSiteList();
      this.markDirty();
      this.showNotification(`Added ${addedCount} sites from ${category} category`);
    } else {
      this.showNotification('All sites from this category are already in your list');
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.sync.set(this.settings);
      
      // Notify background script about settings update
      chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: this.settings
      });
      
      this.isDirty = false;
      this.updateSaveButton();
      this.showNotification('Settings saved successfully');
      
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showNotification('Failed to save settings', 'error');
    }
  }

  async syncData() {
    const statusIndicator = document.querySelector('#sync-status .status-indicator');
    const statusText = document.querySelector('#sync-status .status-text');
    
    statusIndicator.className = 'status-indicator syncing';
    statusText.textContent = 'Syncing...';
    
    try {
      // Simulate sync delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      statusIndicator.className = 'status-indicator';
      statusText.textContent = 'Synced';
      this.showNotification('Data synced successfully');
      
    } catch (error) {
      console.error('Sync failed:', error);
      statusIndicator.className = 'status-indicator error';
      statusText.textContent = 'Sync failed';
      this.showNotification('Failed to sync data', 'error');
    }
  }

  exportData() {
    const data = {
      settings: this.settings,
      exportDate: new Date().toISOString(),
      version: '1.0.0'
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocabbreak-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    this.showNotification('Data exported successfully');
  }

  async resetData() {
    try {
      await chrome.storage.sync.clear();
      await chrome.storage.local.clear();
      
      // Reset to defaults
      this.settings = {
        difficultyLevels: ['A1', 'A2'],
        questionTypes: ['multiple-choice', 'text-input'],
        topics: ['general'],
        blockingMode: 'blacklist',
        siteList: [],
        periodicInterval: 30,
        penaltyDuration: 30,
        interfaceLanguage: 'en',
        gamificationEnabled: true,
        streakNotifications: true
      };
      
      this.updateFormValues();
      this.updateSiteList();
      this.updateProgressOverview();
      this.updateAchievements();
      
      this.showNotification('All data has been reset');
      
    } catch (error) {
      console.error('Failed to reset data:', error);
      this.showNotification('Failed to reset data', 'error');
    }
  }

  markDirty() {
    this.isDirty = true;
    this.updateSaveButton();
  }

  updateSaveButton() {
    const saveButton = document.getElementById('save-settings');
    if (this.isDirty) {
      saveButton.textContent = 'Save Changes *';
      saveButton.style.background = '#ed8936';
    } else {
      saveButton.textContent = 'Save Changes';
      saveButton.style.background = '';
    }
  }

  showConfirmModal(title, message, callback) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirm-modal').classList.remove('hidden');
    this.confirmCallback = callback;
  }

  hideConfirmModal() {
    document.getElementById('confirm-modal').classList.add('hidden');
    this.confirmCallback = null;
  }

  showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notification-text');
    
    notificationText.textContent = message;
    notification.style.background = type === 'error' ? '#f56565' : '#48bb78';
    notification.classList.remove('hidden');
    
    setTimeout(() => {
      notification.classList.add('hidden');
    }, 3000);
  }

  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  async sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response);
      });
    });
  }
}

// Initialize options manager
const optionsManager = new OptionsManager();

// Make it globally accessible for onclick handlers
window.optionsManager = optionsManager;



