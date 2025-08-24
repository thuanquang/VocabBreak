/**
 * Authentication Manager for VocabBreak Extension
 * Handles user authentication, session management, and user profile operations
 */

class AuthManager {
  constructor() {
    this.supabaseClient = null;
    this.refreshTimer = null;
    this.sessionCheckInterval = 30000; // 30 seconds
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
    
    this.init();
  }

  async init() {
    try {
      // Wait for dependencies
      await this.waitForDependencies();
      
      // Initialize Supabase client
      await this.initializeSupabaseClient();
      
      // Set up session monitoring
      this.startSessionMonitoring();
      
      // Check for existing session
      await this.checkExistingSession();
      
      console.log('✅ Auth manager initialized');
    } catch (error) {
      window.errorHandler?.handleAuthError(error, { context: 'init' });
    }
  }

  async waitForDependencies() {
    let attempts = 0;
    while (attempts < 50) {
      if (window.stateManager && window.errorHandler && window.supabaseClient) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    throw new Error('Dependencies not available');
  }

  async initializeSupabaseClient() {
    if (window.supabaseClient && window.supabaseClient.initialized) {
      this.supabaseClient = window.supabaseClient;
      return;
    }

    // Wait for Supabase client to be ready
    let attempts = 0;
    while (attempts < 50) {
      if (window.supabaseClient && window.supabaseClient.initialized) {
        this.supabaseClient = window.supabaseClient;
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    throw new Error('Supabase client not available or not initialized');
  }

  async checkExistingSession() {
    try {
      window.stateManager.updateAuthState({ isLoading: true });

      const { data: { user }, error } = await this.supabaseClient.client.auth.getUser();
      
      if (error) {
        throw error;
      }

      if (user) {
        await this.handleAuthSuccess(user, null);
      } else {
        await this.handleAuthLogout();
      }
    } catch (error) {
      window.errorHandler?.handleAuthError(error, { context: 'checkExistingSession' });
      await this.handleAuthLogout();
    } finally {
      window.stateManager.updateAuthState({ isLoading: false });
    }
  }

  async signUp(email, password, additionalData = {}) {
    try {
      window.stateManager.updateAuthState({ 
        isLoading: true, 
        lastError: null 
      });

      // Validate inputs
      this.validateAuthInputs(email, password);

      // Attempt sign up with retry logic
      const result = await this.withRetry(async () => {
        return await this.supabaseClient.signUp(email, password, additionalData);
      });

      if (result.error) {
        throw result.error;
      }

      if (result.user) {
        await this.handleAuthSuccess(result.user, result.session);
        return { success: true, user: result.user };
      }

      throw new Error('Sign up failed - no user returned');
    } catch (error) {
      const errorInfo = window.errorHandler?.handleAuthError(error, { 
        context: 'signUp',
        email: email.replace(/(.{2}).*(@.*)/, '$1***$2') // Mask email for logging
      });
      
      window.stateManager.updateAuthState({ 
        lastError: errorInfo?.userMessage || error.message,
        isLoading: false 
      });
      
      return { success: false, error: errorInfo?.userMessage || error.message };
    }
  }

  async signIn(email, password) {
    try {
      window.stateManager.updateAuthState({ 
        isLoading: true, 
        lastError: null 
      });

      // Validate inputs
      this.validateAuthInputs(email, password);

      // Attempt sign in with retry logic
      const result = await this.withRetry(async () => {
        return await this.supabaseClient.signIn(email, password);
      });

      if (result.error) {
        throw result.error;
      }

      if (result.user) {
        await this.handleAuthSuccess(result.user, result.session);
        return { success: true, user: result.user };
      }

      throw new Error('Sign in failed - no user returned');
    } catch (error) {
      const errorInfo = window.errorHandler?.handleAuthError(error, { 
        context: 'signIn',
        email: email.replace(/(.{2}).*(@.*)/, '$1***$2')
      });
      
      window.stateManager.updateAuthState({ 
        lastError: errorInfo?.userMessage || error.message,
        isLoading: false 
      });
      
      return { success: false, error: errorInfo?.userMessage || error.message };
    }
  }

  async signOut() {
    try {
      window.stateManager.updateAuthState({ isLoading: true });

      // Sign out from Supabase
      if (this.supabaseClient) {
        await this.supabaseClient.signOut();
      }

      // Clear local session data
      await this.clearSessionData();

      await this.handleAuthLogout();
      
      return { success: true };
    } catch (error) {
      window.errorHandler?.handleAuthError(error, { context: 'signOut' });
      
      // Force logout even if there was an error
      await this.handleAuthLogout();
      
      return { success: false, error: error.message };
    }
  }

  async handleAuthSuccess(user, session) {
    try {
      // Update auth state
      window.stateManager.updateAuthState({
        user: user,
        session: session,
        isAuthenticated: true,
        isLoading: false,
        lastError: null
      });

      // Load user profile and settings
      await this.loadUserProfile(user.id);

      // Start session refresh timer
      this.startSessionRefresh();

      console.log('✅ Authentication successful:', user.email);
    } catch (error) {
      window.errorHandler?.handleAuthError(error, { context: 'handleAuthSuccess' });
    }
  }

  async handleAuthLogout() {
    try {
      // Clear timers
      this.stopSessionRefresh();

      // Update state
      window.stateManager.updateAuthState({
        user: null,
        session: null,
        isAuthenticated: false,
        isLoading: false,
        lastError: null
      });

      window.stateManager.updateUserState({
        profile: null,
        settings: null,
        stats: null
      });

      // Clear session data
      await this.clearSessionData();

      console.log('✅ Logout successful');
    } catch (error) {
      window.errorHandler?.handleAuthError(error, { context: 'handleAuthLogout' });
    }
  }

  async loadUserProfile(userId) {
    try {
      if (!this.supabaseClient) {
        throw new Error('Supabase client not available');
      }

      // Load user profile
      const profile = await this.supabaseClient.getUserProfile();
      
      if (profile) {
        window.stateManager.updateUserState({
          profile: profile.profile || {},
          settings: profile.settings || {},
          stats: this.calculateUserStats(profile.profile)
        });
      }
    } catch (error) {
      window.errorHandler?.handleAuthError(error, { 
        context: 'loadUserProfile',
        userId 
      });
    }
  }

  calculateUserStats(profile) {
    if (!profile || !profile.gamification || !profile.statistics) {
      return {
        totalPoints: 0,
        currentStreak: 0,
        questionsAnswered: 0,
        accuracyRate: 0,
        currentLevel: 1,
        levelName: 'Beginner',
        levelProgress: 0,
        pointsToNextLevel: 500
      };
    }

    const gamification = profile.gamification;
    const statistics = profile.statistics;

    const totalPoints = gamification.total_points || 0;
    const currentLevel = gamification.current_level || 1;
    const questionsAnswered = statistics.total_questions_answered || 0;
    const correctAnswers = statistics.total_correct_answers || 0;
    const accuracyRate = questionsAnswered > 0 ? Math.round((correctAnswers / questionsAnswered) * 100) : 0;

    // Calculate level progress
    const levelThresholds = [0, 500, 1500, 3500, 7000, 13000];
    const currentLevelIndex = Math.min(currentLevel - 1, levelThresholds.length - 1);
    const currentLevelMin = levelThresholds[currentLevelIndex];
    const nextLevelMin = levelThresholds[Math.min(currentLevelIndex + 1, levelThresholds.length - 1)];
    
    let levelProgress = 0;
    if (nextLevelMin > currentLevelMin) {
      levelProgress = Math.round(((totalPoints - currentLevelMin) / (nextLevelMin - currentLevelMin)) * 100);
    }

    const levelNames = ['Beginner', 'Elementary', 'Intermediate', 'Upper-Intermediate', 'Advanced', 'Expert'];
    const levelName = levelNames[Math.min(currentLevel - 1, levelNames.length - 1)];

    return {
      totalPoints,
      currentStreak: gamification.current_streak || 0,
      questionsAnswered,
      accuracyRate,
      currentLevel,
      levelName,
      levelProgress: Math.max(0, Math.min(100, levelProgress)),
      pointsToNextLevel: nextLevelMin
    };
  }

  validateAuthInputs(email, password) {
    if (!email || typeof email !== 'string' || !email.trim()) {
      throw new Error('Email is required');
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      throw new Error('Please enter a valid email address');
    }
  }

  async withRetry(operation, retries = this.maxRetries) {
    let lastError;
    
    for (let i = 0; i < retries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Don't retry for certain error types
        if (this.isNonRetryableError(error)) {
          throw error;
        }
        
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * (i + 1)));
        }
      }
    }
    
    throw lastError;
  }

  isNonRetryableError(error) {
    const nonRetryableMessages = [
      'Invalid login credentials',
      'Email not confirmed',
      'User already registered',
      'Password should be at least 6 characters'
    ];
    
    return nonRetryableMessages.some(msg => 
      error.message && error.message.includes(msg)
    );
  }

  startSessionMonitoring() {
    if (this.supabaseClient && this.supabaseClient.client) {
      this.supabaseClient.client.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event);
        
        switch (event) {
          case 'SIGNED_IN':
            if (session?.user) {
              this.handleAuthSuccess(session.user, session);
            }
            break;
          case 'SIGNED_OUT':
            this.handleAuthLogout();
            break;
          case 'TOKEN_REFRESHED':
            window.stateManager.updateAuthState({ session });
            break;
        }
      });
    }
  }

  startSessionRefresh() {
    this.stopSessionRefresh();
    
    this.refreshTimer = setInterval(async () => {
      try {
        if (this.supabaseClient && window.stateManager.getAuthState().isAuthenticated) {
          const { data: { user } } = await this.supabaseClient.client.auth.getUser();
          if (!user) {
            await this.handleAuthLogout();
          }
        }
      } catch (error) {
        window.errorHandler?.handleAuthError(error, { context: 'sessionRefresh' });
      }
    }, this.sessionCheckInterval);
  }

  stopSessionRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  async clearSessionData() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.remove([
          'userSession',
          'supabaseSession',
          'userProfile'
        ]);
      }
    } catch (error) {
      console.error('Failed to clear session data:', error);
    }
  }

  // Public API methods
  isAuthenticated() {
    return window.stateManager.getAuthState().isAuthenticated;
  }

  getCurrentUser() {
    return window.stateManager.getAuthState().user;
  }

  getUserProfile() {
    return window.stateManager.getUserState().profile;
  }

  getUserStats() {
    return window.stateManager.getUserState().stats;
  }

  getAuthError() {
    return window.stateManager.getAuthState().lastError;
  }

  isLoading() {
    return window.stateManager.getAuthState().isLoading;
  }
}

// Create global instance
if (typeof window !== 'undefined') {
  window.authManager = window.authManager || new AuthManager();
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuthManager;
}
