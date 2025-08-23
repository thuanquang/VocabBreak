/**
 * Build script to inject .env credentials into extension
 * Run this script before loading the extension in development
 */

const fs = require('fs');
const path = require('path');

// Read .env file
function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found. Please create one with SUPABASE_URL and SUPABASE_ANON_KEY');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};
  
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length) {
      env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
    }
  });

  return env;
}

// Inject credentials into setup-credentials.js
function injectCredentials(env) {
  const setupPath = path.join(__dirname, '..', 'shared', 'setup-credentials.js');
  let setupContent = fs.readFileSync(setupPath, 'utf8');
  
  // Replace placeholder values
  setupContent = setupContent.replace(
    'supabaseUrl: \'YOUR_SUPABASE_URL\'',
    `supabaseUrl: '${env.SUPABASE_URL || 'YOUR_SUPABASE_URL'}'`
  );
  
  setupContent = setupContent.replace(
    'supabaseKey: \'YOUR_SUPABASE_ANON_KEY\'',
    `supabaseKey: '${env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'}'`
  );
  
  fs.writeFileSync(setupPath, setupContent);
  console.log('✅ Credentials injected into setup-credentials.js');
}

// Main build function
function build() {
  console.log('🔨 Building VocabBreak extension...');
  
  try {
    const env = loadEnvFile();
    
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env file');
      process.exit(1);
    }
    
    injectCredentials(env);
    
    console.log('✅ Build complete! Extension is ready to load.');
    console.log('📝 Next steps:');
    console.log('   1. Load extension in Chrome: chrome://extensions/');
    console.log('   2. Enable Developer mode');
    console.log('   3. Click "Load unpacked" and select this directory');
    
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  build();
}

module.exports = { build };

