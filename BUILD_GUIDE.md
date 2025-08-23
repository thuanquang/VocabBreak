# VocabBreak - Build Guide

## 🔒 Secure Build Process

This extension uses a **secure build process** that separates source code from production builds, ensuring your sensitive credentials are never exposed in version control.

## 📁 Directory Structure

```
VocabBreak/
├── src/                  # Source code (version controlled)
│   ├── manifest.json
│   ├── background.js
│   ├── content/
│   ├── popup/
│   ├── shared/
│   └── ...
├── dist/                 # Build output (gitignored)
│   └── [built extension files with credentials]
├── .env                  # Your credentials (gitignored)
└── scripts/build.js      # Build script
```

## 🚀 Quick Start

### 1. Set Up Environment Variables

Create a `.env` file in the root directory:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 2. Build the Extension

```bash
# Build production version
npm run build

# Or use development build
npm run dev
```

### 3. Load in Chrome

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `./dist` directory (NOT the root directory)

## 🔧 Build Scripts

- **`npm run build`** - Creates production build in `./dist`
- **`npm run dev`** - Same as build but with helpful message
- **`npm run clean`** - Removes `./dist` directory

## 🛡️ Security Features

### ✅ What's Protected:
- **Source code** remains credential-free
- **`.env` file** is gitignored
- **`dist/` directory** is gitignored
- **Credentials** only exist in build directory

### ❌ What NOT to Do:
- Don't commit `.env` file
- Don't commit `dist/` directory
- Don't load the root directory in Chrome (use `dist/` instead)

## 🔄 Development Workflow

1. **Make changes** to source files
2. **Run `npm run build`** to create new build
3. **Reload extension** in Chrome (Extensions page > Reload button)
4. **Test changes**

## 🚨 Emergency Recovery

If you accidentally committed sensitive files:

```bash
# Remove from git history
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch .env dist/' \
  --prune-empty --tag-name-filter cat -- --all

# Force push (dangerous - coordinate with team)
git push origin --force --all
```

## 📝 Manual Setup (No .env)

If you don't have a `.env` file, the extension will still work:

1. Build normally: `npm run build`
2. Load extension in Chrome
3. Open extension popup → F12 → Console
4. Run: `window.setSupabaseCredentials("your_url", "your_key")`

## 🔍 Troubleshooting

### Build fails with "Missing credentials"
- Check if `.env` file exists
- Verify `.env` has correct format
- Extension will still work with manual setup

### Extension doesn't load
- Make sure you're loading `./dist` directory, not root
- Check Chrome DevTools for errors
- Try `npm run clean` then `npm run build`

### Credentials not working
- Verify Supabase URL and key are correct
- Check browser console for authentication errors
- Try manual credential setup method
