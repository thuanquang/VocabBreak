/**
 * Internationalization (i18n) utility for VocabBreak extension
 * Handles English and Vietnamese language support
 */

class I18n {
  constructor() {
    this.currentLocale = 'en';
    this.messages = {};
    this.ready = null;
    this.init();
  }

  async init() {
    // Get user's preferred language from storage or browser locale
    const stored = await chrome.storage.sync.get(['interfaceLanguage']);
    if (stored.interfaceLanguage) {
      this.currentLocale = stored.interfaceLanguage;
    } else {
      // Detect browser locale, default to 'en' if not supported
      const browserLocale = navigator.language.split('-')[0];
      this.currentLocale = ['en', 'vi'].includes(browserLocale) ? browserLocale : 'en';
    }
    // Begin loading messages and expose readiness promise
    this.ready = this.loadMessages();
    await this.ready;
    // Set document language
    if (typeof document !== 'undefined') {
      document.documentElement.lang = this.currentLocale;
    }
  }

  async loadMessages() {
    try {
      // Load messages for current locale
      const response = await fetch(chrome.runtime.getURL(`_locales/${this.currentLocale}/messages.json`));
      this.messages = await response.json();
    } catch (error) {
      console.error('Failed to load messages:', error);
      // Fallback to English if loading fails
      if (this.currentLocale !== 'en') {
        this.currentLocale = 'en';
        await this.loadMessages();
      }
    }
  }

  /**
   * Get localized message
   * @param {string} key - Message key
   * @param {Array} substitutions - Array of substitution values
   * @returns {string} Localized message
   */
  getMessage(key, substitutions = []) {
    if (!this.messages[key]) {
      console.warn(`Missing translation for key: ${key}`);
      return key;
    }

    let message = this.messages[key].message;
    
    // Handle placeholders
    if (substitutions.length > 0) {
      substitutions.forEach((sub, index) => {
        message = message.replace(`$${index + 1}`, sub);
      });
      
      // Handle named placeholders (like $TIME$, $POINTS$)
      message = message.replace(/\$(\w+)\$/g, (match, placeholder) => {
        const index = parseInt(placeholder) - 1;
        return substitutions[index] || match;
      });
    }

    return message;
  }

  /**
   * Set interface language
   * @param {string} locale - Language code ('en' or 'vi')
   */
  async setLocale(locale) {
    if (!['en', 'vi'].includes(locale)) {
      throw new Error(`Unsupported locale: ${locale}`);
    }
    
    this.currentLocale = locale;
    // Update messages and readiness
    this.ready = this.loadMessages();
    await this.ready;
    await chrome.storage.sync.set({ interfaceLanguage: locale });
    
    // Notify other parts of the extension about language change
    chrome.runtime.sendMessage({
      type: 'LOCALE_CHANGED',
      locale: locale
    });
    // Update <html lang>
    if (typeof document !== 'undefined') {
      document.documentElement.lang = this.currentLocale;
    }
  }

  /**
   * Get current locale
   * @returns {string} Current locale code
   */
  getCurrentLocale() {
    return this.currentLocale;
  }

  /**
   * Get all available locales
   * @returns {Array} Array of available locale objects
   */
  getAvailableLocales() {
    return [
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' }
    ];
  }

  /**
   * Localize DOM elements with data-i18n attributes
   * @param {Element} container - Container element to search within
   */
  localizePage(container = document) {
    const elements = container.querySelectorAll('[data-i18n]');
    elements.forEach(element => {
      const key = element.getAttribute('data-i18n');
      const substitutions = element.getAttribute('data-i18n-args');
      const args = substitutions ? substitutions.split(',') : [];
      
      const message = this.getMessage(key, args);
      
      if (element.tagName === 'INPUT' && element.type === 'text') {
        element.placeholder = message;
      } else {
        element.textContent = message;
      }
    });
  }

  /**
   * Format numbers according to locale
   * @param {number} number - Number to format
   * @returns {string} Formatted number
   */
  formatNumber(number) {
    const localeMap = {
      'en': 'en-US',
      'vi': 'vi-VN'
    };
    
    return new Intl.NumberFormat(localeMap[this.currentLocale] || 'en-US').format(number);
  }

  /**
   * Format dates according to locale
   * @param {Date} date - Date to format
   * @param {Object} options - Formatting options
   * @returns {string} Formatted date
   */
  formatDate(date, options = {}) {
    const localeMap = {
      'en': 'en-US',
      'vi': 'vi-VN'
    };
    
    const defaultOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    };
    
    return new Intl.DateTimeFormat(
      localeMap[this.currentLocale] || 'en-US',
      { ...defaultOptions, ...options }
    ).format(date);
  }
}

// Global instance
const i18n = new I18n();

// Auto-initialize when DOM is ready and localize after messages are loaded
if (typeof document !== 'undefined') {
  const localizeWhenReady = async () => {
    try {
      if (i18n.ready) {
        await i18n.ready;
      }
      // Only localize if we're not in a content script context
      // Content scripts should handle their own localization
      if (!window.chrome || !window.chrome.runtime || !window.chrome.runtime.getManifest) {
        i18n.localizePage(document);
      }
    } catch (e) {
      console.error('Localization init failed:', e);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', localizeWhenReady);
  } else {
    localizeWhenReady();
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = I18n;
} else if (typeof window !== 'undefined') {
  window.I18n = I18n;
  window.i18n = i18n;
}



