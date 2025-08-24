/**
 * Copy Supabase from node_modules to dist for local loading
 */

const fs = require('fs');
const path = require('path');

function copySupabase() {
  const sourcePath = path.join(__dirname, '..', 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js');
  const destPath = path.join(__dirname, '..', 'dist', 'shared', 'supabase.js');
  
  try {
    // Check if source exists
    if (!fs.existsSync(sourcePath)) {
      console.error('❌ Supabase source not found at:', sourcePath);
      console.log('💡 Try running: npm install @supabase/supabase-js');
      return false;
    }
    
    // Copy the file
    fs.copyFileSync(sourcePath, destPath);
    console.log('✅ Supabase copied to:', destPath);
    return true;
  } catch (error) {
    console.error('❌ Failed to copy Supabase:', error.message);
    return false;
  }
}

// Run if called directly
if (require.main === module) {
  copySupabase();
}

module.exports = { copySupabase };
