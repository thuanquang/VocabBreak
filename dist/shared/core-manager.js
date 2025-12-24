/**
 * Core Manager for VocabBreak Extension
 * Unified state management, caching, and initialization system
 * Replaces multiple separate managers with a single, cohesive system
 */

class CoreManager {
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
        syncStatus: 'idle',
        version: '1.0.0',
        initialized: false
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

    // Unified storage system
    this.storage = {
      chrome: null,
      indexedDB: null,
      localStorage: null
    };

    // Event system
    this.listeners = new Map();
    this.syncQueue = [];
    
    // Initialization promise for dependency management
    this.initPromise = null;
    this.isInitialized = false;
    
    this.init();
  }

  /**
   * Initialize the core manager
   * Single entry point for all initialization logic
   */
  async init() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._performInit();
    return this.initPromise;
  }

  async _performInit() {
    try {
      console.log('🚀 CoreManager initializing...');

      // 1. Initialize storage systems
      await this.initializeStorage();

      // 2. Load persisted state
      await this.loadPersistedState();

      // 3. Set up event listeners
      this.setupEventListeners();

      // 4. Initialize dependencies in order
      await this.initializeDependencies();

      this.isInitialized = true;
      this.updateAppState({ initialized: true });
      
      console.log('✅ CoreManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ CoreManager initialization failed:', error);
      this.handleError(error, 'core-init');
      throw error;
    }
  }

  /**
   * Initialize storage systems with fallbacks
   */
  async initializeStorage() {
    try {
      // Chrome storage (preferred for extensions)
      if (typeof chrome !== 'undefined' && chrome.storage) {
        this.storage.chrome = chrome.storage;
        console.log('✅ Chrome storage available');
      }
    } catch (error) {
      console.error('Storage initialization error:', error);
      // Continue without storage - app can still work with memory only
    }
  }

  /**
   * Initialize IndexedDB with unified schema
   */
  async initIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('VocabBreakCore', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Unified cache store
        if (!db.objectStoreNames.contains('cache')) {
          const cacheStore = db.createObjectStore('cache', { keyPath: 'key' });
          cacheStore.createIndex('type', 'type', { unique: false });
          cacheStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        // User data store
        if (!db.objectStoreNames.contains('userData')) {
          const userStore = db.createObjectStore('userData', { keyPath: 'key' });
          userStore.createIndex('userId', 'userId', { unique: false });
        }
        
        // Sync queue
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Online/offline detection
    window.addEventListener('online', () => {
      this.updateAppState({ isOnline: true });
      this.processSyncQueue();
    });
    
    window.addEventListener('offline', () => {
      this.updateAppState({ isOnline: false });
    });

    // Cleanup on unload
    window.addEventListener('beforeunload', () => {
      this.cleanup();
    });
  }

  /**
   * Initialize dependencies in correct order
   */
  async initializeDependencies() {
    const dependencies = [
      'errorHandler',
      'i18n',
      'supabaseClient',
      'authManager',
      'questionManager',
      'gamificationManager'
    ];

    for (const dep of dependencies) {
      try {
        if (window[dep] && typeof window[dep].init === 'function') {
          await window[dep].init();
          console.log(`✅ ${dep} initialized`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to initialize ${dep}:`, error);
        // Continue with other dependencies
      }
    }
  }

  // === STATE MANAGEMENT ===

  /**
   * Get state by key
   */
  getState(key = null) {
    if (key) {
      return key.split('.').reduce((obj, k) => obj?.[k], this.state);
    }
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Update state with validation and notifications
   */
  updateState(key, updates) {
    const validKeys = {
      auth: ['user', 'session', 'isAuthenticated', 'isLoading', 'lastError'],
      user: ['profile', 'settings', 'stats', 'preferences'],
      app: ['isOnline', 'currentScreen', 'lastSync', 'syncStatus', 'version', 'initialized', 'lastError'],
      questions: ['current', 'cache', 'lastFetched', 'difficulty'],
      blocking: ['isActive', 'currentTab', 'reason', 'startTime', 'penaltyEndTime']
    };

    if (!validKeys[key]) {
      console.warn(`Invalid state key: ${key}`);
      return;
    }

    // Validate updates
    const validatedUpdates = {};
    for (const [updateKey, value] of Object.entries(updates)) {
      if (validKeys[key].includes(updateKey)) {
        validatedUpdates[updateKey] = value;
      } else {
        console.warn(`Invalid update key for ${key}: ${updateKey}`);
      }
    }

    // Update state
    this.state[key] = { ...this.state[key], ...validatedUpdates };

    // Notify listeners
    this.notifyListeners(key, this.state[key]);

    // Persist if needed
    this.persistState();
  }

  // Convenience methods
  updateAuthState(updates) { this.updateState('auth', updates); }
  updateUserState(updates) { this.updateState('user', updates); }
  updateAppState(updates) { this.updateState('app', updates); }
  updateQuestionsState(updates) { this.updateState('questions', updates); }
  updateBlockingState(updates) { this.updateState('blocking', updates); }

  // Compatibility getters (stateManager-style)
  getAuthState() { return { ...this.state.auth }; }
  getUserState() { return { ...this.state.user }; }
  getAppState() { return { ...this.state.app }; }
  getQuestionsState() { return { ...this.state.questions }; }
  getBlockingState() { return { ...this.state.blocking }; }

  // === CACHING SYSTEM ===

  /**
   * Unified cache get/set operations
   */
  async getCache(key, options = {}) {
    const { maxAge = 3600000, fallback = null } = options; // 1 hour default

    try {
      // Try memory cache first
      if (this.state.questions.cache.has(key)) {
        const cached = this.state.questions.cache.get(key);
        if (Date.now() - cached.timestamp < maxAge) {
          return cached.data;
        }
      }

      // Try Chrome storage
      if (this.storage.chrome) {
        const result = await this.storage.chrome.local.get(key);
        if (result[key] && Date.now() - result[key].timestamp < maxAge) {
          return result[key].data;
        }
      }

      return fallback;
    } catch (error) {
      console.error(`Cache get error for ${key}:`, error);
      return fallback;
    }
  }

  async setCache(key, data, options = {}) {
    const { persist = true, type = 'general' } = options;
    const cacheEntry = {
      key,
      data,
      timestamp: Date.now(),
      type
    };

    try {
      // Always update memory cache
      this.state.questions.cache.set(key, cacheEntry);

      if (!persist) return;

      // Persist to Chrome storage for small data
      if (this.storage.chrome && JSON.stringify(data).length < 8000) {
        await this.storage.chrome.local.set({ [key]: cacheEntry });
      }
    } catch (error) {
      console.error(`Cache set error for ${key}:`, error);
    }
  }

  /**
   * Clear cache by type or key
   */
  async clearCache(pattern = null) {
    try {
      if (pattern) {
        // Clear specific pattern
        const keysToDelete = [];
        for (const [key] of this.state.questions.cache) {
          if (key.includes(pattern)) {
            keysToDelete.push(key);
          }
        }
        keysToDelete.forEach(key => this.state.questions.cache.delete(key));
      } else {
        // Clear all
        this.state.questions.cache.clear();
      }

    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  // === EVENT SYSTEM ===

  /**
   * Subscribe to state changes
   */
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

  // === PERSISTENCE ===

  async persistState() {
    try {
      const stateToPersist = {
        user: this.state.user,
        app: {
          ...this.state.app,
          currentScreen: 'loading' // Reset on restart
        }
      };

      if (this.storage.chrome) {
        await this.storage.chrome.local.set({ 
          vocabbreak_core_state: stateToPersist 
        });
      } else if (this.storage.localStorage) {
        this.storage.localStorage.setItem(
          'vocabbreak_core_state', 
          JSON.stringify(stateToPersist)
        );
      }
    } catch (error) {
      console.error('State persistence error:', error);
    }
  }

  async loadPersistedState() {
    try {
      let persistedState = null;

      if (this.storage.chrome) {
        const result = await this.storage.chrome.local.get('vocabbreak_core_state');
        persistedState = result.vocabbreak_core_state;
      } else if (this.storage.localStorage) {
        const stored = this.storage.localStorage.getItem('vocabbreak_core_state');
        persistedState = stored ? JSON.parse(stored) : null;
      }

      if (persistedState) {
        this.state = {
          ...this.state,
          user: { ...this.state.user, ...persistedState.user },
          app: { ...this.state.app, ...persistedState.app }
        };
        console.log('✅ State loaded from persistence');
      }
    } catch (error) {
      console.error('State loading error:', error);
    }
  }

  // === SYNC SYSTEM ===

  /**
   * Add operation to sync queue
   */
  addToSyncQueue() { /* offline sync removed */ }

  /**
   * Process sync queue when online
   */
  async processSyncQueue() { /* offline sync removed */ }

  async processSync() { /* offline sync removed */ }

  // === UTILITY METHODS ===

  async getFromIndexedDB() { return null; }

  async saveToIndexedDB() { return null; }

  handleError(error, context) {
    console.error(`CoreManager error in ${context}:`, error);
    if (window.errorHandler) {
      window.errorHandler.handle(error, context, { source: 'CoreManager' });
    }
  }

  cleanup() {
    // Clear timers, close connections, etc.
  }

  // === DEBUG METHODS ===

  debug() {
    console.group('🔍 CoreManager Debug Info');
    console.log('State:', this.getState());
    console.log('Cache size:', this.state.questions.cache.size);
    console.log('Sync queue length:', this.syncQueue.length);
    console.log('Listeners:', Object.fromEntries(
      Array.from(this.listeners.entries()).map(([key, map]) => [key, map.size])
    ));
    console.log('Storage:', {
      chrome: !!this.storage.chrome,
      indexedDB: !!this.storage.indexedDB,
      localStorage: !!this.storage.localStorage
    });
    console.groupEnd();
  }

  reset() {
    this.state = {
      auth: { user: null, session: null, isAuthenticated: false, isLoading: false, lastError: null },
      user: { profile: null, settings: null, stats: null, preferences: { difficultyLevels: ['A1', 'A2'], questionTypes: ['multiple-choice', 'text-input'], topics: ['general'], interfaceLanguage: 'en', theme: 'light' }},
      app: { isOnline: navigator.onLine, currentScreen: 'loading', lastSync: null, syncStatus: 'idle', version: '1.0.0', initialized: false },
      questions: { current: null, cache: new Map(), lastFetched: null, difficulty: 'A1' },
      blocking: { isActive: false, currentTab: null, reason: null, startTime: null, penaltyEndTime: null }
    };
    this.syncQueue = [];
    this.clearCache();
    this.persistState();
  }
}

// Global instance
if (typeof window !== 'undefined') {
  window.coreManager = window.coreManager || new CoreManager();
  // Maintain backward compatibility
  window.stateManager = window.coreManager;
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CoreManager;
}
