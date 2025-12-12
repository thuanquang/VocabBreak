/**
 * Build script for VocabBreak extension
 * Creates a production-ready build in the 'dist' directory
 */

const fs = require('fs');
const path = require('path');

// Read .env file
function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  
  if (!fs.existsSync(envPath)) {
    console.warn('⚠️ .env file not found. Extension will work with manual credential setup.');
    return {};
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

// Strip development logs from JavaScript files
function stripDevLogs(content) {
  // Remove console.log, console.debug, console.info statements
  // Keeps console.warn and console.error for production debugging
  const lines = content.split('\n');
  const result = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Skip lines that are console.log/debug/info statements
    // This handles simple single-line cases
    if (/^console\.(log|debug|info)\s*\(.*\)\s*;?\s*$/.test(trimmed)) {
      continue; // Skip this line entirely
    }
    
    result.push(line);
  }
  
  // Join back and clean up multiple empty lines
  let output = result.join('\n');
  output = output.replace(/\n{3,}/g, '\n\n');
  
  return output;
}

// Copy directory recursively (with optional JS processing)
function copyDir(src, dest, processJS = false) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, processJS);
    } else if (processJS && entry.name.endsWith('.js')) {
      // Process JS files to strip dev logs
      let content = fs.readFileSync(srcPath, 'utf8');
      content = stripDevLogs(content);
      fs.writeFileSync(destPath, content);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Inject credentials into build directory
function injectCredentials(env, buildDir) {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('📝 No credentials found - extension will use manual setup');
    return;
  }

  console.log('🔧 Injecting Supabase credentials...');

  // Update setup-credentials.js
  const setupPath = path.join(buildDir, 'shared', 'setup-credentials.js');
  let setupContent = fs.readFileSync(setupPath, 'utf8');
  
  // Replace placeholder values with actual credentials in setup-credentials.js
  setupContent = setupContent.replace(
    /let supabaseUrl = 'YOUR_SUPABASE_URL'/g,
    `let supabaseUrl = '${supabaseUrl}'`
  );
  
  setupContent = setupContent.replace(
    /let supabaseKey = 'YOUR_SUPABASE_(?:ANON|PUBLISHABLE)_KEY'/g,
    `let supabaseKey = '${supabaseKey}'`
  );
  
  fs.writeFileSync(setupPath, setupContent);
  console.log('✅ Credentials injected into setup-credentials.js');

  // Update supabase-client.js
  const clientPath = path.join(buildDir, 'shared', 'supabase-client.js');
  let clientContent = fs.readFileSync(clientPath, 'utf8');
  
  // Replace placeholder values with actual credentials in supabase-client.js
  clientContent = clientContent.replace(
    /let SUPABASE_URL = 'YOUR_SUPABASE_URL'/g,
    `let SUPABASE_URL = '${supabaseUrl}'`
  );
  
  clientContent = clientContent.replace(
    /let SUPABASE_ANON_KEY = 'YOUR_SUPABASE_PUBLISHABLE_KEY'/g,
    `let SUPABASE_ANON_KEY = '${supabaseKey}'`
  );
  
  fs.writeFileSync(clientPath, clientContent);
  console.log('✅ Credentials injected into supabase-client.js');
  
  console.log('🎉 All credentials injected successfully!');
}

// Main build function
function build(options = {}) {
  const stripLogs = options.stripLogs ?? process.argv.includes('--strip-logs');
  const mode = stripLogs ? 'production' : 'development';
  
  console.log(`🔨 Building VocabBreak extension (${mode} mode)...`);
  if (stripLogs) {
    console.log('📋 Console.log/debug/info statements will be stripped');
  }
  
  try {
    const srcDir = path.join(__dirname, '..');
    const buildDir = path.join(__dirname, '..', 'dist');
    
    // Clean build directory
    if (fs.existsSync(buildDir)) {
      fs.rmSync(buildDir, { recursive: true, force: true });
      console.log('🧹 Cleaned previous build');
    }
    
    // Create build directory
    fs.mkdirSync(buildDir, { recursive: true });
    
    // Files and directories to copy (with JS processing flag)
    const itemsToCopy = [
      { name: 'manifest.json', processJS: false },
      { name: 'background.js', processJS: stripLogs },
      { name: 'content', processJS: stripLogs },
      { name: 'popup', processJS: stripLogs },
      { name: 'options', processJS: stripLogs },
      { name: 'shared', processJS: stripLogs },
      { name: 'assets', processJS: false },
      { name: '_locales', processJS: false },
      { name: 'database', processJS: false }
    ];
    
    // Copy all extension files
    for (const item of itemsToCopy) {
      const srcPath = path.join(srcDir, item.name);
      const destPath = path.join(buildDir, item.name);
      
      if (fs.existsSync(srcPath)) {
        const stat = fs.statSync(srcPath);
        if (stat.isDirectory()) {
          copyDir(srcPath, destPath, item.processJS);
        } else if (item.processJS && item.name.endsWith('.js')) {
          let content = fs.readFileSync(srcPath, 'utf8');
          content = stripDevLogs(content);
          fs.writeFileSync(destPath, content);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
        console.log(`📁 Copied ${item.name}${item.processJS && stripLogs ? ' (logs stripped)' : ''}`);
      }
    }
    
    // Load environment variables
    const env = loadEnvFile();
    
    // Inject credentials into build (not source)
    injectCredentials(env, buildDir);

    // Copy Supabase library - HARD REQUIREMENT for extension functionality
    console.log('📦 Copying Supabase library...');
    try {
      const { copySupabase } = require('./copy-supabase.js');
      if (!copySupabase()) {
        throw new Error('Failed to copy Supabase library. Ensure @supabase/supabase-js is installed via npm.');
      }
      console.log('✅ Supabase library copied successfully');
    } catch (e) {
      console.error('❌ Critical build error: Cannot copy Supabase library');
      console.error('   Error:', e.message);
      console.error('   Fix: Run "npm install @supabase/supabase-js"');
      process.exit(1);
    }
    
    console.log('✅ Build complete! Extension built in ./dist directory');
    console.log('📝 Next steps:');
    console.log('   1. Open Chrome: chrome://extensions/');
    console.log('   2. Enable Developer mode');
    console.log('   3. Click "Load unpacked" and select the ./dist directory');
    console.log('');
    console.log('🔒 Your source code remains clean - credentials only in build directory');
    
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

