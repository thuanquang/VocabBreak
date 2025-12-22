/**
 * Centralized State Management for VocabBreak Extension
 * Single source of truth for application state across all components
 */

class StateManager {
  constructor() {
    this.state = {
      auth: {
        user: null,
        session: null,
        isAuthenticated: false,
        isLoading: false,
        lastError: null
      },
      user: {
        profile: null,
        settings: null,
        stats: null,
        preferences: {
          difficultyLevels: ['A1', 'A2'],
          questionTypes: ['multiple-choice', 'text-input'],
          topics: ['general'],
          interfaceLanguage: 'en',
          theme: 'light'
        }
      },
      app: {
        isOnline: navigator.onLine,
        currentScreen: 'loading',
        lastSync: null,
        syncStatus: 'idle', // 'idle', 'syncing', 'error', 'success'
        version: '1.0.0'
      },
      questions: {
        current: null,
        cache: new Map(),
        lastFetched: null,
        difficulty: 'A1'
      },
      blocking: {
        isActive: false,
        currentTab: null,
        reason: null,
        startTime: null,
        penaltyEndTime: null
      }
    };

    this.listeners = new Map();
    this.persistenceKey = 'vocabbreak_state';
    
    this.init();
  }

  async init() {
    try {
      // Load persisted state
      await this.loadPersistedState();
      
      // Set up online/offline listeners
      window.addEventListener('online', () => this.updateAppState({ isOnline: true }));
      window.addEventListener('offline', () => this.updateAppState({ isOnline: false }));
      
    } catch (error) {
      console.error('❌ Failed to initialize state manager:', error);
    }
  }

  // State getters
  getAuthState() {
    return { ...this.state.auth };
  }

  getUserState() {
    return { ...this.state.user };
  }

  getAppState() {
    return { ...this.state.app };
  }

  getQuestionsState() {
    return { ...this.state.questions };
  }

  getBlockingState() {
    return { ...this.state.blocking };
  }

  getFullState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  // State setters with validation
  updateAuthState(updates) {
    const validKeys = ['user', 'session', 'isAuthenticated', 'isLoading', 'lastError'];
    const validatedUpdates = this.validateUpdates(updates, validKeys);
    
    this.state.auth = { ...this.state.auth, ...validatedUpdates };
    this.notifyListeners('auth', this.state.auth);
    this.persistState();
  }

  updateUserState(updates) {
    const validKeys = ['profile', 'settings', 'stats', 'preferences'];
    const validatedUpdates = this.validateUpdates(updates, validKeys);
    
    this.state.user = { ...this.state.user, ...validatedUpdates };
    this.notifyListeners('user', this.state.user);
    this.persistState();
  }

  updateAppState(updates) {
    const validKeys = ['isOnline', 'currentScreen', 'lastSync', 'syncStatus', 'version'];
    const validatedUpdates = this.validateUpdates(updates, validKeys);
    
    this.state.app = { ...this.state.app, ...validatedUpdates };
    this.notifyListeners('app', this.state.app);
    this.persistState();
  }

  updateQuestionsState(updates) {
    const validKeys = ['current', 'cache', 'lastFetched', 'difficulty'];
    const validatedUpdates = this.validateUpdates(updates, validKeys);
    
    this.state.questions = { ...this.state.questions, ...validatedUpdates };
    this.notifyListeners('questions', this.state.questions);
    this.persistState();
  }

  updateBlockingState(updates) {
    const validKeys = ['isActive', 'currentTab', 'reason', 'startTime', 'penaltyEndTime'];
    const validatedUpdates = this.validateUpdates(updates, validKeys);
    
    this.state.blocking = { ...this.state.blocking, ...validatedUpdates };
    this.notifyListeners('blocking', this.state.blocking);
    this.persistState();
  }

  // Validation helper
  validateUpdates(updates, validKeys) {
    const validated = {};
    for (const [key, value] of Object.entries(updates)) {
      if (validKeys.includes(key)) {
        validated[key] = value;
      } else {
        console.warn(`Invalid state key: ${key}`);
      }
    }
    return validated;
  }

  // Listener management
  subscribe(stateKey, callback, id = null) {
    if (!this.listeners.has(stateKey)) {
      this.listeners.set(stateKey, new Map());
    }
    
    const listenerId = id || `listener_${Date.now()}_${Math.random()}`;
    this.listeners.get(stateKey).set(listenerId, callback);
    
    return () => this.unsubscribe(stateKey, listenerId);
  }

  unsubscribe(stateKey, listenerId) {
    if (this.listeners.has(stateKey)) {
      this.listeners.get(stateKey).delete(listenerId);
    }
  }

  notifyListeners(stateKey, newState) {
    if (this.listeners.has(stateKey)) {
      this.listeners.get(stateKey).forEach(callback => {
        try {
          callback(newState, stateKey);
        } catch (error) {
          console.error(`Error in state listener for ${stateKey}:`, error);
        }
      });
    }
  }

  // Persistence
  async persistState() {
    try {
      // Don't persist sensitive data or temporary state
      const stateToPersist = {
        user: {
          ...this.state.user,
          // Remove sensitive data
          profile: this.state.user.profile ? {
            ...this.state.user.profile,
            // Keep only non-sensitive profile data
          } : null
        },
        app: {
          ...this.state.app,
          currentScreen: 'loading' // Reset screen on restart
        },
        questions: {
          ...this.state.questions,
          current: null, // Don't persist current question
          cache: {} // Don't persist cache
        }
      };

      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({ [this.persistenceKey]: stateToPersist });
      } else {
        localStorage.setItem(this.persistenceKey, JSON.stringify(stateToPersist));
      }
    } catch (error) {
      console.error('Failed to persist state:', error);
    }
  }

  async loadPersistedState() {
    try {
      let persistedState = null;

      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.local.get(this.persistenceKey);
        persistedState = result[this.persistenceKey];
      } else {
        const stored = localStorage.getItem(this.persistenceKey);
        persistedState = stored ? JSON.parse(stored) : null;
      }

      if (persistedState) {
        // Merge persisted state with current state
        this.state = {
          ...this.state,
          user: { ...this.state.user, ...persistedState.user },
          app: { ...this.state.app, ...persistedState.app },
          questions: { ...this.state.questions, ...persistedState.questions }
        };
        
      }
    } catch (error) {
      console.error('Failed to load persisted state:', error);
    }
  }

  // Utility methods
  reset() {
    const initialState = {
      auth: {
        user: null,
        session: null,
        isAuthenticated: false,
        isLoading: false,
        lastError: null
      },
      user: {
        profile: null,
        settings: null,
        stats: null,
        preferences: {
          difficultyLevels: ['A1', 'A2'],
          questionTypes: ['multiple-choice', 'text-input'],
          topics: ['general'],
          interfaceLanguage: 'en',
          theme: 'light'
        }
      },
      app: {
        isOnline: navigator.onLine,
        currentScreen: 'loading',
        lastSync: null,
        syncStatus: 'idle',
        version: '1.0.0'
      },
      questions: {
        current: null,
        cache: new Map(),
        lastFetched: null,
        difficulty: 'A1'
      },
      blocking: {
        isActive: false,
        currentTab: null,
        reason: null,
        startTime: null,
        penaltyEndTime: null
      }
    };

    this.state = initialState;
    this.notifyListeners('auth', this.state.auth);
    this.notifyListeners('user', this.state.user);
    this.notifyListeners('app', this.state.app);
    this.notifyListeners('questions', this.state.questions);
    this.notifyListeners('blocking', this.state.blocking);
    this.persistState();
  }

  // Debug methods
  debug() {
    console.log('🔍 Active listeners:', {
      auth: this.listeners.get('auth')?.size || 0,
      user: this.listeners.get('user')?.size || 0,
      app: this.listeners.get('app')?.size || 0,
      questions: this.listeners.get('questions')?.size || 0,
      blocking: this.listeners.get('blocking')?.size || 0
    });
  }
}

// Create global instance
if (typeof window !== 'undefined') {
  window.stateManager = window.stateManager || new StateManager();
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StateManager;
}
