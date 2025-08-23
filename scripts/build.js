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

// Copy directory recursively
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Inject credentials into setup-credentials.js in build directory
function injectCredentials(env, buildDir) {
  const setupPath = path.join(buildDir, 'shared', 'setup-credentials.js');
  let setupContent = fs.readFileSync(setupPath, 'utf8');
  
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    // Replace placeholder values with actual credentials
    setupContent = setupContent.replace(
      'supabaseUrl: \'YOUR_SUPABASE_URL\'',
      `supabaseUrl: '${env.SUPABASE_URL}'`
    );
    
    setupContent = setupContent.replace(
      'supabaseKey: \'YOUR_SUPABASE_ANON_KEY\'',
      `supabaseKey: '${env.SUPABASE_ANON_KEY}'`
    );
    
    fs.writeFileSync(setupPath, setupContent);
    console.log('✅ Credentials injected into build');
  } else {
    console.log('📝 No credentials found - extension will use manual setup');
  }
}

// Main build function
function build() {
  console.log('🔨 Building VocabBreak extension...');
  
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
    
    // Files and directories to copy
    const itemsToCopy = [
      'manifest.json',
      'background.js',
      'content',
      'popup',
      'options',
      'shared',
      'assets',
      '_locales',
      'database'
    ];
    
    // Copy all extension files
    for (const item of itemsToCopy) {
      const srcPath = path.join(srcDir, item);
      const destPath = path.join(buildDir, item);
      
      if (fs.existsSync(srcPath)) {
        const stat = fs.statSync(srcPath);
        if (stat.isDirectory()) {
          copyDir(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
        console.log(`📁 Copied ${item}`);
      }
    }
    
    // Load environment variables
    const env = loadEnvFile();
    
    // Inject credentials into build (not source)
    injectCredentials(env, buildDir);
    
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

