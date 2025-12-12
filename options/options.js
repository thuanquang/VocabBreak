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
      streakNotifications: true,
      reducedMotion: false,
      soundEnabled: true
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
    
    // Wait for i18n ready, then localize and set lang
    if (window.i18n && window.i18n.ready) {
      await window.i18n.ready;
      document.documentElement.lang = window.i18n.getCurrentLocale();
      window.i18n.localizePage(document);
    }

    // Wait for Supabase and gamificationManager to be ready before showing stats
    await this.waitForGamificationReady();

    // Initialize UI
    this.initializeUI();
    
    // Set up auto-save on changes
    this.setupAutoSave();
    
    console.log('Options page initialized');
  }

  async waitForGamificationReady() {
    try {
      console.log('⏳ Waiting for gamification dependencies...');
      
      // Wait for Supabase to be ready
      if (window.supabaseReadyPromise) {
        await Promise.race([
          window.supabaseReadyPromise,
          new Promise(resolve => setTimeout(resolve, 5000))
        ]);
      }
      
      // Wait for gamificationManager to initialize and load from database
      if (window.gamificationManager) {
        let attempts = 0;
        while (!window.gamificationManager.isInitialized && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        // Force reload from database if authenticated but stats look empty
        if (window.supabaseClient && window.supabaseClient.isAuthenticated()) {
          const stats = window.gamificationManager.getUserStats();
          if (stats.totalPoints === 0 && stats.totalQuestions === 0) {
            console.log('📊 Forcing initial stats load from database...');
            await window.gamificationManager.loadUserStatsFromDatabase();
          }
        }
      }
      
      console.log('✅ Gamification dependencies ready');
    } catch (error) {
      console.warn('⚠️ Error waiting for gamification dependencies:', error);
    }
  }

  setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // Save button
    document.getElementById('save-settings').addEventListener('click', async () => {
      await this.saveSettings();
    });

    // Account actions
    document.getElementById('sync-now').addEventListener('click', () => {
      this.syncData();
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

    // Number inputs for timing settings (periodic-interval and penalty-duration)
    const periodicIntervalInput = document.getElementById('periodic-interval');
    if (periodicIntervalInput) {
      // Handle both input (during typing) and change (after blur/enter)
      periodicIntervalInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('interval-value').textContent = `${e.target.value} min`;
        if (Number.isFinite(value) && value > 0) {
          this.settings.periodicInterval = value;
          this.markDirty();
        }
      });
      
      // Validate on blur to ensure minimum value
      periodicIntervalInput.addEventListener('blur', (e) => {
        const value = parseFloat(e.target.value);
        if (!Number.isFinite(value) || value <= 0) {
          e.target.value = 0.5; // Minimum 30 seconds
          this.settings.periodicInterval = 0.5;
          document.getElementById('interval-value').textContent = '0.5 min';
          this.showNotification('Question frequency must be at least 0.5 minutes (30 seconds)', 'error');
        }
      });
    }

    const penaltyDurationInput = document.getElementById('penalty-duration');
    if (penaltyDurationInput) {
      penaltyDurationInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('penalty-value').textContent = `${e.target.value} sec`;
        if (Number.isFinite(value) && value > 0) {
          this.settings.penaltyDuration = value;
          this.markDirty();
        }
      });
      
      // Validate on blur to ensure minimum value
      penaltyDurationInput.addEventListener('blur', (e) => {
        const value = parseFloat(e.target.value);
        if (!Number.isFinite(value) || value <= 0) {
          e.target.value = 5; // Minimum 5 seconds
          this.settings.penaltyDuration = 5;
          document.getElementById('penalty-value').textContent = '5 sec';
          this.showNotification('Penalty duration must be at least 5 seconds', 'error');
        }
      });
    }

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
    
    // Footer support link - scroll to support section
    const supportLink = document.getElementById('support-link');
    if (supportLink) {
      supportLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.scrollToSupport();
      });
    }
    
    // Listen for messages from popup to scroll to support
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'SCROLL_TO_SUPPORT') {
        this.scrollToSupport();
        sendResponse({ success: true });
      }
      return true;
    });
    
    // Check URL hash on load
    if (window.location.hash === '#support') {
      setTimeout(() => this.scrollToSupport(), 500);
    }
  }
  
  scrollToSupport() {
    const supportSection = document.getElementById('support-section');
    if (supportSection) {
      supportSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add a brief highlight effect
      supportSection.classList.add('highlight');
      setTimeout(() => supportSection.classList.remove('highlight'), 2000);
    }
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
      // Load local settings from chrome.storage.sync
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
        'streakNotifications',
        'reducedMotion',
        'soundEnabled'
      ]);

      // Merge with defaults
      this.settings = { ...this.settings, ...result };
      
      console.log('Loaded local settings:', this.settings);

      // Load gamification settings from database if authenticated
      await this.loadGamificationSettingsFromDatabase();
      
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  async loadGamificationSettingsFromDatabase() {
    try {
      if (!window.supabaseClient) {
        console.log('Supabase client not available, skipping database settings load');
        return;
      }

      // Wait for supabase to be ready
      if (window.supabaseReadyPromise) {
        await window.supabaseReadyPromise;
      }

      if (!window.supabaseClient.isAuthenticated()) {
        console.log('User not authenticated, skipping database settings load');
        return;
      }

      const userProfile = await window.supabaseClient.getUserProfile();
      if (userProfile && userProfile.profile) {
        const prefs = userProfile.profile.preferences || {};
        
        // Load gamification-specific preferences from database
        if (prefs.gamification_enabled !== undefined) {
          this.settings.gamificationEnabled = prefs.gamification_enabled;
        }
        if (prefs.streak_notifications !== undefined) {
          this.settings.streakNotifications = prefs.streak_notifications;
        }
        if (prefs.notifications_enabled !== undefined) {
          this.settings.streakNotifications = prefs.notifications_enabled;
        }
        if (prefs.sound_enabled !== undefined) {
          this.settings.soundEnabled = prefs.sound_enabled;
        }
        
        console.log('✅ Loaded gamification settings from database:', {
          gamificationEnabled: this.settings.gamificationEnabled,
          streakNotifications: this.settings.streakNotifications,
          soundEnabled: this.settings.soundEnabled
        });
      }
    } catch (error) {
      console.warn('Failed to load gamification settings from database:', error);
      // Continue with local settings
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
          <span class="account-label">${window.i18n ? window.i18n.getMessage('email') : 'Email'}</span>
          <span class="account-value">${this.user.email}</span>
        </div>
        <div class="account-field">
          <span class="account-label">${window.i18n ? window.i18n.getMessage('account_created') : 'Account Created'}</span>
          <span class="account-value">${new Date(this.user.created_at).toLocaleDateString()}</span>
        </div>
        <div class="account-field">
          <span class="account-label">${window.i18n ? window.i18n.getMessage('user_id') : 'User ID'}</span>
          <span class="account-value">${this.user.id.substring(0, 8)}...</span>
        </div>
      `;
    } else {
      accountInfo.innerHTML = `
        <div class="account-field">
          <span class="account-label">${window.i18n ? window.i18n.getMessage('status') : 'Status'}</span>
          <span class="account-value">${window.i18n ? window.i18n.getMessage('not_logged_in') : 'Not logged in'}</span>
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

    // Number inputs for timing
    const periodicIntervalInput = document.getElementById('periodic-interval');
    if (periodicIntervalInput) {
      periodicIntervalInput.value = this.settings.periodicInterval;
      document.getElementById('interval-value').textContent = `${this.settings.periodicInterval} min`;
    }
    
    const penaltyDurationInput = document.getElementById('penalty-duration');
    if (penaltyDurationInput) {
      penaltyDurationInput.value = this.settings.penaltyDuration;
      document.getElementById('penalty-value').textContent = `${this.settings.penaltyDuration} sec`;
    }

    // Interface language
    document.querySelectorAll('input[name="interface-language"]').forEach(input => {
      input.checked = input.value === this.settings.interfaceLanguage;
    });

    // Gamification settings
    document.getElementById('gamification-enabled').checked = this.settings.gamificationEnabled;
    document.getElementById('streak-notifications').checked = this.settings.streakNotifications;

    const reducedMotionToggle = document.getElementById('reduced-motion');
    if (reducedMotionToggle) {
      reducedMotionToggle.checked = !!this.settings.reducedMotion;
    }

    const soundToggle = document.getElementById('sound-enabled');
    if (soundToggle) {
      soundToggle.checked = this.settings.soundEnabled !== false;
    }

    document.body.classList.toggle('reduced-motion', !!this.settings.reducedMotion);
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
      const empty = window.i18n ? window.i18n.getMessage('no_sites_added') : 'No sites added yet';
      siteList.innerHTML = `<p style="color: #718096; text-align: center; padding: 20px;">${empty}</p>`;
      return;
    }

    siteList.innerHTML = this.settings.siteList.map(site => `
      <div class="site-item">
        <span class="site-url">${site}</span>
        <button class="remove-site" onclick="optionsManager.removeSite('${site}')">${window.i18n ? window.i18n.getMessage('remove') : 'Remove'}</button>
      </div>
    `).join('');
  }

  async updateProgressOverview() {
    const progressOverview = document.getElementById('progress-overview');
    
    try {
      // Wait for gamificationManager to be ready and get stats directly from it
      let stats = {
        totalPoints: 0,
        currentStreak: 0,
        longestStreak: 0,
        totalQuestions: 0,
        correctAnswers: 0,
        currentLevel: 1
      };

      // First, wait for Supabase client to be ready
      if (window.supabaseReadyPromise) {
        console.log('⏳ Waiting for Supabase to be ready...');
        await Promise.race([
          window.supabaseReadyPromise,
          new Promise(resolve => setTimeout(resolve, 5000))
        ]);
        console.log('✅ Supabase ready');
      }

      if (window.gamificationManager) {
        // Wait for gamification manager to initialize if needed
        if (!window.gamificationManager.isInitialized) {
          console.log('⏳ Waiting for gamificationManager to initialize...');
          await new Promise(resolve => {
            const checkInit = setInterval(() => {
              if (window.gamificationManager.isInitialized) {
                clearInterval(checkInit);
                resolve();
              }
            }, 100);
            // Timeout after 5 seconds
            setTimeout(() => {
              clearInterval(checkInit);
              resolve();
            }, 5000);
          });
        }
        
        // If stats are still empty but we're authenticated, force reload from database
        let currentStats = window.gamificationManager.getUserStats();
        if (currentStats.totalPoints === 0 && currentStats.totalQuestions === 0) {
          console.log('📊 Stats appear empty, forcing reload from database...');
          if (window.supabaseClient && window.supabaseClient.isAuthenticated()) {
            await window.gamificationManager.loadUserStatsFromDatabase();
            currentStats = window.gamificationManager.getUserStats();
          }
        }
        
        stats = currentStats;
        console.log('📊 Loaded stats from gamificationManager:', stats);
      }

      const accuracyRate = stats.totalQuestions > 0 
        ? Math.round((stats.correctAnswers / stats.totalQuestions) * 100) 
        : 0;

      progressOverview.innerHTML = `
        <div class="progress-card">
          <span class="progress-value">${this.formatNumber(stats.totalPoints)}</span>
          <span class="progress-label">${window.i18n ? window.i18n.getMessage('total_points') : 'Total Points'}</span>
        </div>
        <div class="progress-card">
          <span class="progress-value">${stats.currentStreak}</span>
          <span class="progress-label">${window.i18n ? window.i18n.getMessage('current_streak') : 'Current Streak'}</span>
        </div>
        <div class="progress-card">
          <span class="progress-value">${stats.totalQuestions}</span>
          <span class="progress-label">${window.i18n ? window.i18n.getMessage('questions_answered') : 'Questions Answered'}</span>
        </div>
        <div class="progress-card">
          <span class="progress-value">${accuracyRate}%</span>
          <span class="progress-label">${window.i18n ? window.i18n.getMessage('accuracy_rate') : 'Accuracy Rate'}</span>
        </div>
        <div class="progress-card">
          <span class="progress-value">${window.i18n ? window.i18n.getMessage('level_with_number', [String(stats.currentLevel)]) : `Level ${stats.currentLevel}`}</span>
          <span class="progress-label">${window.i18n ? window.i18n.getMessage('current_level') : 'Current Level'}</span>
        </div>
      `;
    } catch (error) {
      console.error('Failed to load progress overview:', error);
      // Fallback to default display
      progressOverview.innerHTML = `
        <div class="progress-card">
          <span class="progress-value">0</span>
          <span class="progress-label">${window.i18n ? window.i18n.getMessage('total_points') : 'Total Points'}</span>
        </div>
        <div class="progress-card">
          <span class="progress-value">0</span>
          <span class="progress-label">${window.i18n ? window.i18n.getMessage('current_streak') : 'Current Streak'}</span>
        </div>
        <div class="progress-card">
          <span class="progress-value">0</span>
          <span class="progress-label">${window.i18n ? window.i18n.getMessage('questions_answered') : 'Questions Answered'}</span>
        </div>
        <div class="progress-card">
          <span class="progress-value">0%</span>
          <span class="progress-label">${window.i18n ? window.i18n.getMessage('accuracy_rate') : 'Accuracy Rate'}</span>
        </div>
        <div class="progress-card">
          <span class="progress-value">${window.i18n ? window.i18n.getMessage('level_with_number', ['1']) : 'Level 1'}</span>
          <span class="progress-label">${window.i18n ? window.i18n.getMessage('current_level') : 'Current Level'}</span>
        </div>
      `;
    }
  }

  async updateAchievements() {
    const achievementsGrid = document.getElementById('achievements-grid');
    
    try {
      // Get achievements directly from gamificationManager
      let achievements = {};
      
      // First, wait for Supabase client to be ready
      if (window.supabaseReadyPromise) {
        await Promise.race([
          window.supabaseReadyPromise,
          new Promise(resolve => setTimeout(resolve, 5000))
        ]);
      }
      
      if (window.gamificationManager) {
        // Wait for gamification manager to initialize if needed
        if (!window.gamificationManager.isInitialized) {
          await new Promise(resolve => {
            const checkInit = setInterval(() => {
              if (window.gamificationManager.isInitialized) {
                clearInterval(checkInit);
                resolve();
              }
            }, 100);
            // Timeout after 5 seconds
            setTimeout(() => {
              clearInterval(checkInit);
              resolve();
            }, 5000);
          });
        }
        
        // If stats weren't loaded (cachedStats is empty/null), force reload from database
        if (!window.gamificationManager.cachedStats || 
            (window.gamificationManager.cachedStats.gamification.achievements.length === 0 && 
             window.supabaseClient && window.supabaseClient.isAuthenticated())) {
          console.log('🏆 Forcing reload of achievements from database...');
          await window.gamificationManager.loadUserStatsFromDatabase();
        }
        
        achievements = window.gamificationManager.getAchievements();
        console.log('🏆 Loaded achievements from gamificationManager:', achievements);
      }
      
      // Convert achievements object to array and sort: unlocked first, then locked
      const achievementArray = Object.values(achievements).sort((a, b) => {
        if (a.unlocked && !b.unlocked) return -1;
        if (!a.unlocked && b.unlocked) return 1;
        return 0;
      });

      if (achievementArray.length === 0) {
        achievementsGrid.innerHTML = '<p style="color: #718096; text-align: center; padding: 20px;">No achievements available</p>';
        return;
      }

      // Get current locale for localized names/descriptions
      const locale = window.i18n?.getCurrentLocale() || 'en';
      const isVi = locale === 'vi';

      achievementsGrid.innerHTML = achievementArray.map(achievement => {
        const name = isVi && achievement.nameVi ? achievement.nameVi : achievement.name;
        const description = isVi && achievement.descriptionVi ? achievement.descriptionVi : achievement.description;
        
        return `
          <div class="achievement-card ${achievement.unlocked ? 'unlocked' : 'locked'}">
            <span class="achievement-icon">${achievement.icon}</span>
            <div class="achievement-name">${name}</div>
            <div class="achievement-description">${description}</div>
            <div class="achievement-points">${achievement.unlocked ? '+' : ''}${achievement.points} ${window.i18n ? window.i18n.getMessage('points') || 'points' : 'points'}</div>
            ${achievement.unlocked && achievement.unlocked_at ? `<div class="achievement-date">${new Date(achievement.unlocked_at).toLocaleDateString()}</div>` : ''}
          </div>
        `;
      }).join('');
    } catch (error) {
      console.error('Failed to load achievements:', error);
      // Fallback to empty state
      achievementsGrid.innerHTML = '<p style="color: #e53e3e; text-align: center; padding: 20px;">Failed to load achievements</p>';
    }
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
    document.addEventListener('change', async (e) => {
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
        if (window.i18n) {
          await window.i18n.setLocale(this.settings.interfaceLanguage);
          window.i18n.localizePage(document);
          document.documentElement.lang = window.i18n.getCurrentLocale();
        }
        this.markDirty();
      } else if (e.target.id === 'gamification-enabled') {
        this.settings.gamificationEnabled = e.target.checked;
        this.markDirty();
      } else if (e.target.id === 'streak-notifications') {
        this.settings.streakNotifications = e.target.checked;
        this.markDirty();
      } else if (e.target.id === 'reduced-motion') {
        this.settings.reducedMotion = e.target.checked;
        document.body.classList.toggle('reduced-motion', !!this.settings.reducedMotion);
        this.markDirty();
      } else if (e.target.id === 'sound-enabled') {
        this.settings.soundEnabled = e.target.checked;
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
      const interval = Number(this.settings.periodicInterval);
      const penalty = Number(this.settings.penaltyDuration);

      // Validation with user-friendly messages
      if (!Number.isFinite(interval) || interval <= 0) {
        this.showNotification('Question frequency must be a positive number', 'error');
        return;
      }
      
      if (interval < 0.5) {
        this.showNotification('Question frequency must be at least 0.5 minutes (30 seconds)', 'error');
        return;
      }
      
      if (!Number.isFinite(penalty) || penalty <= 0) {
        this.showNotification('Penalty duration must be a positive number', 'error');
        return;
      }
      
      if (penalty < 5) {
        this.showNotification('Penalty duration must be at least 5 seconds', 'error');
        return;
      }

      console.log('💾 Saving settings:', {
        periodicInterval: this.settings.periodicInterval,
        penaltyDuration: this.settings.penaltyDuration,
        blockingMode: this.settings.blockingMode,
        siteListCount: this.settings.siteList.length
      });

      // Save to local storage first (persist to chrome.storage.sync)
      await chrome.storage.sync.set(this.settings);
      
      // Save gamification settings to database
      await this.saveGamificationSettingsToDatabase();
      
      // Notify background script about settings update with all settings
      // This triggers immediate reschedule of all timers and re-evaluation of tabs
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'UPDATE_SETTINGS',
          settings: this.settings
        }, resolve);
      });
      
      console.log('📩 Background script acknowledged settings update:', response);
      
      this.isDirty = false;
      this.updateSaveButton();
      this.showNotification('Settings saved and applied immediately');
      
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showNotification('Failed to save settings', 'error');
    }
  }

  async saveGamificationSettingsToDatabase() {
    try {
      if (!window.supabaseClient) {
        console.log('Supabase client not available, skipping database settings save');
        return;
      }

      // Wait for supabase to be ready
      if (window.supabaseReadyPromise) {
        await window.supabaseReadyPromise;
      }

      if (!window.supabaseClient.isAuthenticated()) {
        console.log('User not authenticated, skipping database settings save');
        return;
      }

      // Update user profile with gamification preferences
      await window.supabaseClient.updateUserProfile({
        profile: {
          preferences: {
            gamification_enabled: this.settings.gamificationEnabled,
            streak_notifications: this.settings.streakNotifications,
            notifications_enabled: this.settings.streakNotifications,
            sound_enabled: this.settings.soundEnabled
          }
        }
      });

      console.log('✅ Saved gamification settings to database:', {
        gamificationEnabled: this.settings.gamificationEnabled,
        streakNotifications: this.settings.streakNotifications,
        soundEnabled: this.settings.soundEnabled
      });
    } catch (error) {
      console.warn('Failed to save gamification settings to database:', error);
      // Don't fail the whole save - local settings were saved
    }
  }

  async syncData() {
    const statusIndicator = document.querySelector('#sync-status .status-indicator');
    const statusText = document.querySelector('#sync-status .status-text');
    
    statusIndicator.className = 'status-indicator syncing';
    statusText.textContent = window.i18n ? window.i18n.getMessage('syncing') : 'Syncing...';
    
    try {
      // Simulate sync delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      statusIndicator.className = 'status-indicator';
      statusText.textContent = window.i18n ? window.i18n.getMessage('synced') : 'Synced';
      this.showNotification(window.i18n ? window.i18n.getMessage('data_synced_success') : 'Data synced successfully');
      
    } catch (error) {
      console.error('Sync failed:', error);
      statusIndicator.className = 'status-indicator error';
      statusText.textContent = window.i18n ? window.i18n.getMessage('sync_failed') : 'Sync failed';
      this.showNotification(window.i18n ? window.i18n.getMessage('sync_failed_full') : 'Failed to sync data', 'error');
    }
  }

  markDirty() {
    this.isDirty = true;
    this.updateSaveButton();
  }

  updateSaveButton() {
    const saveButton = document.getElementById('save-settings');
    if (this.isDirty) {
      saveButton.textContent = window.i18n ? window.i18n.getMessage('save_changes_star') : 'Save Changes *';
      saveButton.style.background = '#ed8936';
    } else {
      saveButton.textContent = window.i18n ? window.i18n.getMessage('save_changes') : 'Save Changes';
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



