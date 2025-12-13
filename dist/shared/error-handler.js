/**
 * Centralized Error Handling System for VocabBreak Extension
 * Provides consistent error handling, logging, and user feedback
 */

class ErrorHandler {
  constructor() {
    this.errorLog = [];
    this.maxLogSize = 100;
    this.errorCounts = new Map();
    this.suppressedErrors = new Set();
    
    this.init();
  }

  init() {
    // Set up global error handlers
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.handleGlobalError(event.error, 'global', {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        });
      });

      window.addEventListener('unhandledrejection', (event) => {
        this.handleGlobalError(event.reason, 'promise', {
          promise: event.promise
        });
      });
    }

    console.log('✅ Error handler initialized');
  }

  // Main error handling method
  handle(error, context = 'unknown', metadata = {}) {
    try {
      const errorInfo = this.processError(error, context, metadata);
      
      // Log the error
      this.logError(errorInfo);
      
      // Count error occurrences
      this.countError(errorInfo);
      
      // Determine if we should show user feedback
      if (this.shouldShowToUser(errorInfo)) {
        this.showUserError(errorInfo);
      }
      
      // Report to analytics if available
      this.reportError(errorInfo);
      
      return errorInfo;
    } catch (handlingError) {
      console.error('Error in error handler:', handlingError);
      console.error('Original error:', error);
    }
  }

  // Process error into standardized format
  processError(error, context, metadata) {
    const timestamp = new Date().toISOString();
    const errorId = this.generateErrorId();
    
    let errorInfo = {
      id: errorId,
      timestamp,
      context,
      metadata,
      level: 'error',
      message: 'Unknown error',
      stack: null,
      type: 'UnknownError',
      userMessage: 'Something went wrong. Please try again.',
      category: this.categorizeError(context),
      recoverable: true
    };

    if (error instanceof Error) {
      errorInfo.message = error.message;
      errorInfo.stack = error.stack;
      errorInfo.type = error.constructor.name;
    } else if (typeof error === 'string') {
      errorInfo.message = error;
    } else if (error && typeof error === 'object') {
      errorInfo.message = error.message || error.error || JSON.stringify(error);
      errorInfo.type = error.name || error.type || 'ObjectError';
    }

    // Enhance based on context
    errorInfo = this.enhanceErrorInfo(errorInfo, context);

    return errorInfo;
  }

  // Categorize errors for better handling
  categorizeError(context) {
    const categories = {
      auth: ['authentication', 'login', 'signup', 'session'],
      network: ['fetch', 'request', 'connection', 'timeout'],
      database: ['supabase', 'query', 'insert', 'update', 'delete'],
      ui: ['popup', 'options', 'render', 'dom'],
      content: ['blocker', 'injection', 'overlay'],
      background: ['timer', 'alarm', 'messaging'],
      storage: ['chrome.storage', 'indexeddb', 'localstorage']
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => context.toLowerCase().includes(keyword))) {
        return category;
      }
    }

    return 'general';
  }

  // Enhance error info based on context
  enhanceErrorInfo(errorInfo, context) {
    const enhancements = {
      auth: {
        userMessage: 'Authentication failed. Please check your credentials and try again.',
        recoverable: true
      },
      network: {
        userMessage: 'Network error. Please check your internet connection.',
        recoverable: true
      },
      database: {
        userMessage: 'Database error. Your data might not be saved.',
        recoverable: true
      },
      ui: {
        userMessage: 'Interface error. Please reload the extension.',
        recoverable: true
      },
      content: {
        userMessage: 'Page blocking error. Please refresh the page.',
        recoverable: true
      },
      background: {
        userMessage: 'Background service error. Extension functionality may be limited.',
        recoverable: false
      },
      storage: {
        userMessage: 'Storage error. Your settings might not be saved.',
        recoverable: true
      }
    };

    const enhancement = enhancements[errorInfo.category];
    if (enhancement) {
      Object.assign(errorInfo, enhancement);
    }

    return errorInfo;
  }

  // Log error to console and internal log
  logError(errorInfo) {
    const logMessage = `[${errorInfo.category.toUpperCase()}] ${errorInfo.message}`;
    
    switch (errorInfo.level) {
      case 'error':
        console.error(logMessage, errorInfo);
        break;
      case 'warn':
        console.warn(logMessage, errorInfo);
        break;
      default:
        console.log(logMessage, errorInfo);
    }

    // Add to internal log
    this.errorLog.push(errorInfo);
    
    // Limit log size
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize);
    }
  }

  // Count error occurrences
  countError(errorInfo) {
    const key = `${errorInfo.category}:${errorInfo.type}:${errorInfo.message}`;
    const count = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, count + 1);
  }

  // Determine if error should be shown to user
  shouldShowToUser(errorInfo) {
    // Don't show if suppressed
    if (this.suppressedErrors.has(errorInfo.type)) {
      return false;
    }

    // Don't show if too frequent
    const key = `${errorInfo.category}:${errorInfo.type}:${errorInfo.message}`;
    const count = this.errorCounts.get(key) || 0;
    if (count > 3) {
      return false;
    }

    // Show for critical errors
    if (errorInfo.level === 'error' && errorInfo.recoverable) {
      return true;
    }

    return false;
  }

  // Show error to user
  showUserError(errorInfo) {
    try {
      if (typeof window !== 'undefined' && window.stateManager) {
        // Update state with error
        window.stateManager.updateAppState({
          lastError: {
            message: errorInfo.userMessage,
            timestamp: errorInfo.timestamp,
            recoverable: errorInfo.recoverable
          }
        });
      }

      // Try to show in UI if available
      if (typeof window !== 'undefined') {
        // Try popup error display
        if (window.showError && typeof window.showError === 'function') {
          window.showError(errorInfo.userMessage);
        }
        // Try notification
        else if (chrome && chrome.notifications) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'assets/icon48.png',
            title: 'VocabBreak Error',
            message: errorInfo.userMessage
          });
        }
      }
    } catch (displayError) {
      console.error('Failed to show error to user:', displayError);
    }
  }

  // Report error to analytics (if available)
  reportError(errorInfo) {
    try {
      // This could be extended to send to analytics service
      if (typeof chrome !== 'undefined' && chrome.storage) {
        // Store error summary for debugging
        chrome.storage.local.get(['errorSummary']).then(result => {
          const summary = result.errorSummary || {};
          const key = `${errorInfo.category}:${errorInfo.type}`;
          summary[key] = (summary[key] || 0) + 1;
          
          chrome.storage.local.set({ errorSummary: summary });
        });
      }
    } catch (reportError) {
      console.error('Failed to report error:', reportError);
    }
  }

  // Global error handler
  handleGlobalError(error, type, metadata) {
    this.handle(error, `global-${type}`, metadata);
  }

  // Utility methods
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  suppressError(errorType) {
    this.suppressedErrors.add(errorType);
  }

  unsuppressError(errorType) {
    this.suppressedErrors.delete(errorType);
  }

  getErrorLog() {
    return [...this.errorLog];
  }

  getErrorStats() {
    return {
      totalErrors: this.errorLog.length,
      errorCounts: Object.fromEntries(this.errorCounts),
      suppressedTypes: Array.from(this.suppressedErrors),
      categories: this.getErrorsByCategory()
    };
  }

  getErrorsByCategory() {
    const categories = {};
    for (const error of this.errorLog) {
      categories[error.category] = (categories[error.category] || 0) + 1;
    }
    return categories;
  }

  clearLog() {
    this.errorLog = [];
    this.errorCounts.clear();
  }

  // Convenience methods for different error types
  handleAuthError(error, metadata = {}) {
    return this.handle(error, 'authentication', metadata);
  }

  handleNetworkError(error, metadata = {}) {
    return this.handle(error, 'network', metadata);
  }

  handleDatabaseError(error, metadata = {}) {
    return this.handle(error, 'database', metadata);
  }

  handleUIError(error, metadata = {}) {
    return this.handle(error, 'ui', metadata);
  }

  handleContentError(error, metadata = {}) {
    return this.handle(error, 'content', metadata);
  }

  handleBackgroundError(error, metadata = {}) {
    return this.handle(error, 'background', metadata);
  }

  handleStorageError(error, metadata = {}) {
    return this.handle(error, 'storage', metadata);
  }
}

// Create global instance
if (typeof window !== 'undefined') {
  window.errorHandler = window.errorHandler || new ErrorHandler();
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ErrorHandler;
}
