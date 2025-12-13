/**
 * Setup credentials from .env file to chrome storage
 * This script should be run once during development setup
 */

// This would typically be handled by a build script that reads .env
// For now, developers need to manually set these in the extension

async function setupCredentials() {
  try {
    // Check if credentials are already stored and valid
    const existingCredentials = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey']);
    if (existingCredentials.supabaseUrl && existingCredentials.supabaseKey && 
        existingCredentials.supabaseUrl !== 'YOUR_SUPABASE_URL' && 
        existingCredentials.supabaseKey !== 'YOUR_SUPABASE_ANON_KEY') {
      return; // Already set up with real values
    }
    
    // Use the hardcoded credentials that were injected by the setup script
    let supabaseUrl = 'https://nyxtigtweenrnsmaaoic.supabase.co'; // Will be injected by build script
    let supabaseKey = 'sb_publishable_V8LlV7Wjb4ssGpGtpP-52A_6XX2rmRA'; // Will be injected by build script
    

    const credentials = {
      supabaseUrl: supabaseUrl,
      supabaseKey: supabaseKey
    };

    // Store credentials in chrome storage
    await chrome.storage.local.set(credentials);
    
    // Verify storage
    const stored = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey']);
    console.log('Stored credentials:', {
      url: stored.supabaseUrl ? '✅ Set' : '❌ Missing',
      key: stored.supabaseKey ? '✅ Set' : '❌ Missing'
    });
    
    // Check if using placeholder values
    if (stored.supabaseUrl === 'YOUR_SUPABASE_URL' || stored.supabaseKey === 'YOUR_SUPABASE_ANON_KEY' || stored.supabaseKey === 'YOUR_SUPABASE_PUBLISHABLE_KEY') {
      console.error('❌ Please update the credentials in shared/setup-credentials.js with your actual Supabase values');
    }
    
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
  
  // Add a function to manually set credentials
  window.setSupabaseCredentials = async function(url, key) {
    try {
      await chrome.storage.local.set({
        supabaseUrl: url,
        supabaseKey: key
      });
    } catch (error) {
      console.error('❌ Failed to set credentials:', error);
    }
  };
  
  // Add a function to check current credentials
  window.checkCredentials = async function() {
    try {
      const stored = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey']);
      console.log('Current credentials:', {
        url: stored.supabaseUrl ? '✅ Set' : '❌ Missing',
        key: stored.supabaseKey ? '✅ Set' : '❌ Missing'
      });
      if (stored.supabaseUrl && stored.supabaseKey) {
      }
    } catch (error) {
      console.error('❌ Failed to check credentials:', error);
    }
  };
}

