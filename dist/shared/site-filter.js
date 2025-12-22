/**
 * Site filtering system for VocabBreak extension
 * Handles whitelist/blacklist logic and URL pattern matching
 */

class SiteFilter {
  constructor() {
    this.mode = 'blacklist'; // 'whitelist' or 'blacklist'
    this.siteList = [];
    this.defaultExclusions = [
      'chrome://*',
      'chrome-extension://*',
      'moz-extension://*',
      'edge://*',
      'about:*',
      'file://*',
      'localhost',
      'localhost:*',
      '127.0.0.1',
      '127.0.0.1:*',
      '*.local',
      'chrome.google.com/webstore*',
      'addons.mozilla.org*',
      'microsoftedge.microsoft.com*'
    ];
    
    this.bankingPatterns = [
      '*bank*.com',
      '*banking*.com',
      '*paypal*.com',
      '*stripe*.com',
      '*square*.com',
      '*venmo*.com',
      '*zelle*.com',
      '*creditkarma*.com',
      '*mint*.com',
      '*turbotax*.com',
      '*irs.gov*',
      '*treasury.gov*'
    ];
    
    this.init();
  }

  async init() {
    await this.loadSettings();
  }

  async loadSettings() {
    try {
      const settings = await window.offlineManager?.getAllSettings() || {};
      
      this.mode = settings.blockingMode || 'blacklist';
      this.siteList = settings.siteList || [];
      
      // Add default exclusions to blacklist if not present
      if (this.mode === 'blacklist') {
        const allExclusions = [...new Set([...this.siteList, ...this.defaultExclusions])];
        if (allExclusions.length !== this.siteList.length) {
          this.siteList = allExclusions;
          await this.saveSettings();
        }
      }
    } catch (error) {
      console.error('Failed to load site filter settings:', error);
    }
  }

  async saveSettings() {
    try {
      await window.offlineManager?.saveSetting('blockingMode', this.mode);
      await window.offlineManager?.saveSetting('siteList', this.siteList);
    } catch (error) {
      console.error('Failed to save site filter settings:', error);
    }
  }

  /**
   * Check if a URL should be blocked (show question)
   * @param {string} url - The URL to check
   * @returns {boolean} - True if should be blocked, false otherwise
   */
  shouldBlock(url) {
    if (!url) return false;
    
    try {
      const urlObj = new URL(url);
      
      // Always exclude default patterns
      if (this.matchesPatterns(url, this.defaultExclusions)) {
        return false;
      }
      
      // Check against user's site list
      const matchesUserList = this.matchesPatterns(url, this.siteList);
      
      if (this.mode === 'whitelist') {
        // Whitelist mode: only block if URL matches the list
        return matchesUserList;
      } else {
        // Blacklist mode: block unless URL matches the list
        return !matchesUserList;
      }
    } catch (error) {
      console.error('Error checking URL:', error);
      return false;
    }
  }

  /**
   * Check if URL matches any of the given patterns
   * @param {string} url - The URL to check
   * @param {Array} patterns - Array of patterns to match against
   * @returns {boolean} - True if matches any pattern
   */
  matchesPatterns(url, patterns) {
    if (!patterns || patterns.length === 0) return false;
    
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      const fullUrl = url.toLowerCase();
      
      return patterns.some(pattern => {
        const normalizedPattern = pattern.toLowerCase().trim();
        
        if (!normalizedPattern) return false;
        
        // Exact match
        if (normalizedPattern === fullUrl || normalizedPattern === hostname) {
          return true;
        }
        
        // Wildcard matching
        if (normalizedPattern.includes('*')) {
          const regexPattern = normalizedPattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
            .replace(/\*/g, '.*'); // Convert * to .*
          
          const regex = new RegExp(`^${regexPattern}$`);
          
          return regex.test(fullUrl) || regex.test(hostname);
        }
        
        // Domain matching (without protocol)
        if (hostname.includes(normalizedPattern) || normalizedPattern.includes(hostname)) {
          return true;
        }
        
        // Path matching
        if (fullUrl.includes(normalizedPattern)) {
          return true;
        }
        
        return false;
      });
    } catch (error) {
      console.error('Error matching patterns:', error);
      return false;
    }
  }

  /**
   * Add a site to the list
   * @param {string} pattern - URL pattern to add
   * @returns {boolean} - Success status
   */
  async addSite(pattern) {
    if (!pattern || typeof pattern !== 'string') {
      return false;
    }
    
    const normalizedPattern = pattern.trim().toLowerCase();
    
    if (this.siteList.includes(normalizedPattern)) {
      return true; // Already exists
    }
    
    this.siteList.push(normalizedPattern);
    await this.saveSettings();
    return true;
  }

  /**
   * Remove a site from the list
   * @param {string} pattern - URL pattern to remove
   * @returns {boolean} - Success status
   */
  async removeSite(pattern) {
    if (!pattern || typeof pattern !== 'string') {
      return false;
    }
    
    const normalizedPattern = pattern.trim().toLowerCase();
    const index = this.siteList.indexOf(normalizedPattern);
    
    if (index === -1) {
      return true; // Doesn't exist anyway
    }
    
    this.siteList.splice(index, 1);
    await this.saveSettings();
    return true;
  }

  /**
   * Set the blocking mode
   * @param {string} mode - 'whitelist' or 'blacklist'
   * @returns {boolean} - Success status
   */
  async setMode(mode) {
    if (mode !== 'whitelist' && mode !== 'blacklist') {
      return false;
    }
    
    this.mode = mode;
    
    // If switching to blacklist mode, ensure default exclusions are included
    if (mode === 'blacklist') {
      const allExclusions = [...new Set([...this.siteList, ...this.defaultExclusions])];
      this.siteList = allExclusions;
    }
    
    await this.saveSettings();
    return true;
  }

  /**
   * Get current settings
   * @returns {Object} - Current filter settings
   */
  getSettings() {
    return {
      mode: this.mode,
      siteList: [...this.siteList],
      defaultExclusions: [...this.defaultExclusions]
    };
  }

  /**
   * Import sites from array
   * @param {Array} sites - Array of site patterns
   * @param {boolean} replace - Whether to replace existing list
   * @returns {boolean} - Success status
   */
  async importSites(sites, replace = false) {
    if (!Array.isArray(sites)) {
      return false;
    }
    
    const validSites = sites
      .filter(site => typeof site === 'string' && site.trim())
      .map(site => site.trim().toLowerCase());
    
    if (replace) {
      this.siteList = validSites;
    } else {
      this.siteList = [...new Set([...this.siteList, ...validSites])];
    }
    
    await this.saveSettings();
    return true;
  }

  /**
   * Export current site list
   * @returns {Array} - Current site list
   */
  exportSites() {
    return [...this.siteList];
  }

  /**
   * Get suggested sites for common categories
   * @param {string} category - Category name
   * @returns {Array} - Array of suggested patterns
   */
  getSuggestedSites(category) {
    const suggestions = {
      social: [
        'facebook.com',
        'twitter.com',
        'instagram.com',
        'linkedin.com',
        'reddit.com',
        'tiktok.com',
        'snapchat.com',
        'discord.com',
        'telegram.org'
      ],
      news: [
        'cnn.com',
        'bbc.com',
        'reuters.com',
        'nytimes.com',
        'washingtonpost.com',
        'theguardian.com',
        'npr.org',
        'apnews.com'
      ],
      entertainment: [
        'youtube.com',
        'netflix.com',
        'hulu.com',
        'twitch.tv',
        'spotify.com',
        'soundcloud.com',
        'imdb.com',
        'rottentomatoes.com'
      ],
      shopping: [
        'amazon.com',
        'ebay.com',
        'etsy.com',
        'walmart.com',
        'target.com',
        'bestbuy.com',
        'costco.com',
        'alibaba.com'
      ],
      work: [
        'gmail.com',
        'outlook.com',
        'slack.com',
        'zoom.us',
        'teams.microsoft.com',
        'notion.so',
        'trello.com',
        'asana.com',
        'github.com',
        'stackoverflow.com'
      ],
      banking: [...this.bankingPatterns]
    };
    
    return suggestions[category] || [];
  }

  /**
   * Add suggested sites for a category
   * @param {string} category - Category name
   * @returns {boolean} - Success status
   */
  async addSuggestedCategory(category) {
    const suggestions = this.getSuggestedSites(category);
    if (suggestions.length === 0) {
      return false;
    }
    
    return await this.importSites(suggestions, false);
  }

  /**
   * Check if current site should show emergency bypass
   * @param {string} url - The URL to check
   * @returns {boolean} - True if should show bypass option
   */
  shouldShowEmergencyBypass(url) {
    // Show bypass for banking/financial sites even in strict mode
    return this.matchesPatterns(url, this.bankingPatterns);
  }

  /**
   * Validate URL pattern
   * @param {string} pattern - Pattern to validate
   * @returns {Object} - Validation result with isValid and message
   */
  validatePattern(pattern) {
    if (!pattern || typeof pattern !== 'string') {
      return { isValid: false, message: 'Pattern cannot be empty' };
    }
    
    const trimmed = pattern.trim();
    if (trimmed.length === 0) {
      return { isValid: false, message: 'Pattern cannot be empty' };
    }
    
    // Check for invalid characters
    const invalidChars = /[<>"|{}^`\[\]\\]/;
    if (invalidChars.test(trimmed)) {
      return { isValid: false, message: 'Pattern contains invalid characters' };
    }
    
    // Check if it's a reasonable pattern
    if (trimmed.length > 200) {
      return { isValid: false, message: 'Pattern is too long' };
    }
    
    // Try to create regex to test pattern validity
    try {
      const regexPattern = trimmed
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      new RegExp(`^${regexPattern}$`);
    } catch (error) {
      return { isValid: false, message: 'Invalid pattern syntax' };
    }
    
    return { isValid: true, message: 'Valid pattern' };
  }

  /**
   * Get statistics about blocking
   * @returns {Object} - Statistics object
   */
  getStats() {
    return {
      mode: this.mode,
      totalSites: this.siteList.length,
      userSites: this.siteList.length - (this.mode === 'blacklist' ? this.defaultExclusions.length : 0),
      defaultExclusions: this.defaultExclusions.length
    };
  }
}

// Global instance
const siteFilter = new SiteFilter();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SiteFilter;
} else if (typeof window !== 'undefined') {
  window.siteFilter = siteFilter;
}

