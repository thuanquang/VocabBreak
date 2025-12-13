/**
 * Offline data management using IndexedDB for VocabBreak extension
 * Handles question caching, user progress storage, and offline synchronization
 */

class OfflineManager {
  constructor() {
    this.dbName = 'VocabBreakDB';
    this.dbVersion = 1;
    this.db = null;
    this.isOnline = navigator.onLine;
    this.syncQueue = [];
    
    this.init();
    this.setupOnlineListener();
  }

  async init() {
    try {
      this.db = await this.openDatabase();
    } catch (error) {
      console.error('❌ Failed to initialize IndexedDB:', error);
      console.warn('⚠️ IndexedDB unavailable (incognito mode, quota exceeded, or permissions denied)');
      this.db = null; // Disable IndexedDB features
    }
  }

  openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Questions store
        if (!db.objectStoreNames.contains('questions')) {
          const questionsStore = db.createObjectStore('questions', { keyPath: 'id' });
          questionsStore.createIndex('level', 'level', { unique: false });
          questionsStore.createIndex('topic', 'topic', { unique: false });
          questionsStore.createIndex('type', 'type', { unique: false });
          questionsStore.createIndex('difficulty', 'difficulty', { unique: false });
        }
        
        // User progress store
        if (!db.objectStoreNames.contains('userProgress')) {
          const progressStore = db.createObjectStore('userProgress', { keyPath: 'id' });
          progressStore.createIndex('questionId', 'questionId', { unique: false });
          progressStore.createIndex('answeredAt', 'answeredAt', { unique: false });
          progressStore.createIndex('correct', 'correct', { unique: false });
        }
        
        // Cached settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        
        // Sync queue store
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
          syncStore.createIndex('type', 'type', { unique: false });
        }
        
        // Cache metadata store
        if (!db.objectStoreNames.contains('cacheMetadata')) {
          db.createObjectStore('cacheMetadata', { keyPath: 'key' });
        }
      };
    });
  }

  setupOnlineListener() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processSyncQueue();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  // Question caching methods
  async cacheQuestions(questions) {
    // Check if IndexedDB is available
    if (!this.db) {
      console.warn('⚠️ IndexedDB not available - skipping offline cache');
      return false;
    }

    const transaction = this.db.transaction(['questions', 'cacheMetadata'], 'readwrite');
    const questionsStore = transaction.objectStore('questions');
    const metadataStore = transaction.objectStore('cacheMetadata');
    
    try {
      // Clear existing questions
      await questionsStore.clear();
      
      // Add new questions
      for (const question of questions) {
        await questionsStore.add({
          ...question,
          cachedAt: Date.now()
        });
      }
      
      // Update cache metadata
      await metadataStore.put({
        key: 'lastCacheUpdate',
        value: Date.now(),
        questionCount: questions.length
      });
      
      return true;
    } catch (error) {
      console.error('❌ Failed to cache questions:', error);
      return false;
    }
  }

  async getCachedQuestions(filters = {}) {
    // Check if IndexedDB is available
    if (!this.db) {
      console.warn('⚠️ IndexedDB not available - returning empty cache');
      return [];
    }

    const transaction = this.db.transaction(['questions'], 'readonly');
    const store = transaction.objectStore('questions');
    
    try {
      let questions;
      
      if (filters.level && filters.level.length > 0) {
        const levelIndex = store.index('level');
        questions = [];
        for (const level of filters.level) {
          const levelQuestions = await this.getFromIndex(levelIndex, level);
          questions.push(...levelQuestions);
        }
      } else {
        questions = await this.getAllFromStore(store);
      }
      
      // Apply additional filters
      let filteredQuestions = questions;
      
      if (filters.topic && filters.topic.length > 0) {
        filteredQuestions = filteredQuestions.filter(q => 
          filters.topic.includes(q.topic)
        );
      }
      
      if (filters.type && filters.type.length > 0) {
        filteredQuestions = filteredQuestions.filter(q => 
          filters.type.includes(q.type)
        );
      }
      
      if (filters.difficulty) {
        filteredQuestions = filteredQuestions.filter(q => 
          q.difficulty >= filters.difficulty.min && 
          q.difficulty <= filters.difficulty.max
        );
      }
      
      // Shuffle and limit results
      if (filters.shuffle) {
        filteredQuestions = this.shuffleArray(filteredQuestions);
      }
      
      if (filters.limit) {
        filteredQuestions = filteredQuestions.slice(0, filters.limit);
      }
      
      return filteredQuestions;
    } catch (error) {
      console.error('Failed to get cached questions:', error);
      return [];
    }
  }

  async getRandomQuestion(filters = {}) {
    const questions = await this.getCachedQuestions({ ...filters, shuffle: true, limit: 1 });
    return questions.length > 0 ? questions[0] : null;
  }

  // Progress tracking methods
  async saveProgress(progressData) {
    const transaction = this.db.transaction(['userProgress'], 'readwrite');
    const store = transaction.objectStore('userProgress');
    
    try {
      const progress = {
        id: `${progressData.questionId}_${Date.now()}`,
        questionId: progressData.questionId,
        answeredAt: Date.now(),
        correct: progressData.correct,
        timeTaken: progressData.timeTaken,
        pointsEarned: progressData.pointsEarned,
        streakAtTime: progressData.streakAtTime,
        synced: false
      };
      
      await store.add(progress);
      
      // Add to sync queue if online
      if (this.isOnline) {
        await this.addToSyncQueue('progress', progress);
      }
      
      return progress;
    } catch (error) {
      console.error('Failed to save progress:', error);
      throw error;
    }
  }

  async getProgress(filters = {}) {
    const transaction = this.db.transaction(['userProgress'], 'readonly');
    const store = transaction.objectStore('userProgress');
    
    try {
      let progress = await this.getAllFromStore(store);
      
      // Apply filters
      if (filters.questionId) {
        progress = progress.filter(p => p.questionId === filters.questionId);
      }
      
      if (filters.correct !== undefined) {
        progress = progress.filter(p => p.correct === filters.correct);
      }
      
      if (filters.dateRange) {
        progress = progress.filter(p => 
          p.answeredAt >= filters.dateRange.start && 
          p.answeredAt <= filters.dateRange.end
        );
      }
      
      // Sort by most recent
      progress.sort((a, b) => b.answeredAt - a.answeredAt);
      
      if (filters.limit) {
        progress = progress.slice(0, filters.limit);
      }
      
      return progress;
    } catch (error) {
      console.error('Failed to get progress:', error);
      return [];
    }
  }

  // Settings management
  async saveSetting(key, value) {
    const transaction = this.db.transaction(['settings'], 'readwrite');
    const store = transaction.objectStore('settings');
    
    try {
      await store.put({
        key: key,
        value: value,
        updatedAt: Date.now(),
        synced: false
      });
      
      // Add to sync queue if online
      if (this.isOnline) {
        await this.addToSyncQueue('setting', { key, value });
      }
      
      return true;
    } catch (error) {
      console.error('Failed to save setting:', error);
      return false;
    }
  }

  async getSetting(key, defaultValue = null) {
    const transaction = this.db.transaction(['settings'], 'readonly');
    const store = transaction.objectStore('settings');
    
    try {
      const result = await store.get(key);
      return result ? result.value : defaultValue;
    } catch (error) {
      console.error('Failed to get setting:', error);
      return defaultValue;
    }
  }

  async getAllSettings() {
    const transaction = this.db.transaction(['settings'], 'readonly');
    const store = transaction.objectStore('settings');
    
    try {
      const settings = await this.getAllFromStore(store);
      const settingsObject = {};
      settings.forEach(setting => {
        settingsObject[setting.key] = setting.value;
      });
      return settingsObject;
    } catch (error) {
      console.error('Failed to get all settings:', error);
      return {};
    }
  }

  // Sync queue management
  async addToSyncQueue(type, data) {
    const transaction = this.db.transaction(['syncQueue'], 'readwrite');
    const store = transaction.objectStore('syncQueue');
    
    try {
      await store.add({
        type: type,
        data: data,
        timestamp: Date.now(),
        retryCount: 0
      });
      
      // Process immediately if online
      if (this.isOnline) {
        setTimeout(() => this.processSyncQueue(), 1000);
      }
    } catch (error) {
      console.error('Failed to add to sync queue:', error);
    }
  }

  async processSyncQueue() {
    // Check if we have a supabase client available
    const client = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (!this.isOnline || !client?.isAuthenticated()) {
      return;
    }
    
    const transaction = this.db.transaction(['syncQueue'], 'readwrite');
    const store = transaction.objectStore('syncQueue');
    
    try {
      const queueItems = await this.getAllFromStore(store);
      
      for (const item of queueItems) {
        try {
          await this.syncItem(item);
          await store.delete(item.id);
        } catch (error) {
          console.error(`Failed to sync ${item.type}:`, error);
          
          // Increment retry count
          item.retryCount = (item.retryCount || 0) + 1;
          
          // Remove from queue after 3 failed attempts
          if (item.retryCount >= 3) {
            await store.delete(item.id);
            console.error(`Removed ${item.type} from sync queue after 3 failed attempts`);
          } else {
            await store.put(item);
          }
        }
      }
    } catch (error) {
      console.error('Failed to process sync queue:', error);
    }
  }

  async syncItem(item) {
    const client = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (!client) {
      throw new Error('Supabase client not available');
    }

    switch (item.type) {
      case 'progress':
        await client.recordInteraction({
          type: 'question_answer',
          targetId: item.data.questionId,
          correct: item.data.correct,
          timeTaken: item.data.timeTaken,
          pointsEarned: item.data.pointsEarned,
          streakAtTime: item.data.streakAtTime
        });
        break;
        
      case 'setting':
        await client.updateUserSettings('user_preferences', item.data.key, item.data.value);
        break;
        
      default:
        console.warn(`Unknown sync item type: ${item.type}`);
    }
  }

  // Cache management
  async getCacheInfo() {
    const transaction = this.db.transaction(['cacheMetadata', 'questions'], 'readonly');
    const metadataStore = transaction.objectStore('cacheMetadata');
    const questionsStore = transaction.objectStore('questions');
    
    try {
      const lastUpdate = await metadataStore.get('lastCacheUpdate');
      const questionCount = await this.getStoreCount(questionsStore);
      
      return {
        lastUpdate: lastUpdate ? lastUpdate.value : null,
        questionCount: questionCount,
        isExpired: lastUpdate ? (Date.now() - lastUpdate.value) > (7 * 24 * 60 * 60 * 1000) : true // 7 days
      };
    } catch (error) {
      console.error('Failed to get cache info:', error);
      return { lastUpdate: null, questionCount: 0, isExpired: true };
    }
  }

  async clearCache() {
    const transaction = this.db.transaction(['questions', 'cacheMetadata'], 'readwrite');
    
    try {
      await transaction.objectStore('questions').clear();
      await transaction.objectStore('cacheMetadata').clear();
      return true;
    } catch (error) {
      console.error('Failed to clear cache:', error);
      return false;
    }
  }

  // Utility methods
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  getFromIndex(index, key) {
    return new Promise((resolve, reject) => {
      const request = index.getAll(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  getAllFromStore(store) {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  getStoreCount(store) {
    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Statistics methods
  async getStats() {
    try {
      const progress = await this.getProgress();
      const total = progress.length;
      const correct = progress.filter(p => p.correct).length;
      const accuracy = total > 0 ? (correct / total * 100) : 0;
      
      // Calculate current streak
      let currentStreak = 0;
      const sortedProgress = progress.sort((a, b) => b.answeredAt - a.answeredAt);
      for (const p of sortedProgress) {
        if (p.correct) {
          currentStreak++;
        } else {
          break;
        }
      }
      
      // Calculate total points
      const totalPoints = progress.reduce((sum, p) => sum + p.pointsEarned, 0);
      
      return {
        totalQuestions: total,
        correctAnswers: correct,
        accuracy: Math.round(accuracy * 10) / 10,
        currentStreak: currentStreak,
        totalPoints: totalPoints
      };
    } catch (error) {
      console.error('Failed to get stats:', error);
      return {
        totalQuestions: 0,
        correctAnswers: 0,
        accuracy: 0,
        currentStreak: 0,
        totalPoints: 0
      };
    }
  }
}

// Global instance
const offlineManager = new OfflineManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OfflineManager;
} else if (typeof window !== 'undefined') {
  window.offlineManager = offlineManager;
}

