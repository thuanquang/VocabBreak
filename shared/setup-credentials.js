/**
 * Setup credentials from .env file to chrome storage
 * This script should be run once during development setup
 */

// This would typically be handled by a build script that reads .env
// For now, developers need to manually set these in the extension

async function setupCredentials() {
  try {
    // In a real setup, these would come from your .env file
    // For now, developers need to replace these with actual values
    const credentials = {
      supabaseUrl: 'YOUR_SUPABASE_URL', // Replace with actual URL from .env
      supabaseKey: 'YOUR_SUPABASE_ANON_KEY' // Replace with actual key from .env
    };

    // Store credentials in chrome storage
    await chrome.storage.local.set(credentials);
    console.log('✅ Credentials stored successfully');
    
    // Verify storage
    const stored = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey']);
    console.log('Stored credentials:', {
      url: stored.supabaseUrl ? '✅ Set' : '❌ Missing',
      key: stored.supabaseKey ? '✅ Set' : '❌ Missing'
    });
    
  } catch (error) {
    console.error('❌ Failed to setup credentials:', error);
  }
}

// Auto-run if in extension context
if (typeof chrome !== 'undefined' && chrome.storage) {
  setupCredentials();
}

// Export for manual usage
if (typeof window !== 'undefined') {
  window.setupCredentials = setupCredentials;
}

