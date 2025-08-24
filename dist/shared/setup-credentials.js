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
      console.log('✅ Using stored credentials');
      return; // Already set up with real values
    }
    
    // Use the hardcoded credentials that were injected by the setup script
    let supabaseUrl = 'https://nyxtigtweenrnsmaaoic.supabase.co'; // Replace with actual URL
    let supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55eHRpZ3R3ZWVucm5zbWFhb2ljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MzE5NzIsImV4cCI6MjA3MTQwNzk3Mn0.w8nGFtcUpJnJ_UuH1zRqjvz22HuVrQIZjjR9JsGlByI'; // Replace with actual key
    
    console.log('✅ Using injected Supabase credentials');

    const credentials = {
      supabaseUrl: supabaseUrl,
      supabaseKey: supabaseKey
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
    
    // Check if using placeholder values
    if (stored.supabaseUrl === 'YOUR_SUPABASE_URL' || stored.supabaseKey === 'YOUR_SUPABASE_ANON_KEY') {
      console.error('❌ Please update the credentials in shared/setup-credentials.js with your actual Supabase values');
      console.log('📝 Instructions:');
      console.log('   1. Get your Supabase URL from your project dashboard');
      console.log('   2. Get your Supabase anon key from Settings > API');
      console.log('   3. Replace the placeholder values in this file');
      console.log('   4. Reload the extension');
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
      console.log('✅ Credentials set successfully');
      console.log('🔄 Please reload the extension for changes to take effect');
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
        console.log('URL:', stored.supabaseUrl);
        console.log('Key:', stored.supabaseKey.substring(0, 20) + '...');
      }
    } catch (error) {
      console.error('❌ Failed to check credentials:', error);
    }
  };
}

