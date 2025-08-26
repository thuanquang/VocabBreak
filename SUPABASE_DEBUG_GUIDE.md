# 🔍 Supabase Integration Debug Guide

## 📋 Testing Steps

### 1. **Load the Extension**
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `dist` directory
4. **Open Developer Console** (F12) to see debug logs

### 2. **Check Supabase Initialization**
1. Click on the extension icon to open popup
2. In the console, look for these logs:
   ```
   🔧 Creating Supabase client...
     - SUPABASE_URL: https://nyxtigtweenrnsmaaoic.supabase.co
     - SUPABASE_ANON_KEY: eyJhbGciOiJIUzI1NiIs...
   ✅ Supabase client created successfully
   👤 Current user: Not authenticated
   ✅ Supabase client initialized successfully
   ```

### 3. **Sign Up for Real Account** (Recommended)
Instead of clicking "Continue Offline", **create a real account**:

1. Enter email and password
2. Click "Sign Up"
3. Look for console logs:
   ```
   🔄 Auth state changed: SIGNED_IN user@example.com
   👤 Current user: user@example.com (a1b2c3d4...)
   ```

### 4. **Test Question Answering**
1. Visit any website (like `google.com`)
2. Wait for a question to appear (or trigger one manually)
3. Answer the question correctly
4. **Check console logs** for database operations:
   ```
   🔍 Checking Supabase client for database recording...
     - window.supabaseClient exists: true
     - supabaseClient.initialized: true
     - supabaseClient.isAuthenticated(): true
     - supabaseClient.user: {email: "user@example.com", ...}
   📤 Sending interaction to Supabase database...
   📝 Recording interaction to Supabase: {...}
     - User ID: a1b2c3d4-...
     - Session ID: uuid-...
   ✅ Interaction recorded successfully: {...}
   📊 Updating gamification stats...
   ```

## 🚨 Common Issues & Solutions

### **Issue 1: "Supabase client not available or user not authenticated"**
**Solution**: You're using offline mode. Sign up for a real account instead.

### **Issue 2: "Supabase CDN not loaded"**
**Solution**: The extension should load the local Supabase library. Reload the extension.

### **Issue 3: No console logs at all**
**Solution**: Make sure you're looking at the correct console:
- **For popup**: Right-click popup → Inspect → Console
- **For content scripts**: F12 on the website → Console

### **Issue 4: Database errors**
**Solution**: Check if the database schema is correctly applied in your Supabase dashboard.

## 🎯 Expected Behavior

### **With Real Supabase Account:**
- ✅ All interactions saved to database
- ✅ Progress synced across devices
- ✅ Achievement tracking in database
- ✅ Detailed analytics available

### **With Offline Mode:**
- ❌ No database requests sent
- ❌ No cross-device sync
- ❌ Limited features
- ✅ Local progress tracking only

## 📊 Verify Database Records

1. Go to your **Supabase Dashboard**
2. Navigate to **Table Editor**
3. Check these tables for new records:
   - `users` - Should have your user profile
   - `user_interactions` - Should have question answers
   - `user_progress` - Should have progress updates

## 🔧 Manual Testing Commands

Open browser console and try:
```javascript
// Check Supabase client
console.log('Supabase client:', window.supabaseClient);
console.log('Is authenticated:', window.supabaseClient?.isAuthenticated());
console.log('Current user:', window.supabaseClient?.user);

// Check credentials
window.checkCredentials();
```

---

**🎉 Success Indicator**: You should see database records being created in real-time as you answer questions!




