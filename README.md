# 🎯 VocabBreak - Language Learning Extension

Learn English vocabulary through strategic web interruptions. Gamified language learning that blocks websites until you answer questions correctly.

## ✨ Features

- **Smart Web Blocking**: Interrupts browsing every 30 minutes with vocabulary questions
- **Gamification**: Points, levels, streaks, and achievements to motivate learning
- **Real-time Progress**: Track your learning progress with detailed statistics
- **Supabase Integration**: Cloud-based user profiles and progress synchronization
- **Offline Support**: Continue learning even without internet connection
- **Multiple Question Types**: Multiple choice and text input questions
- **Difficulty Levels**: A1 to C2 CEFR levels with adaptive difficulty
- **Bilingual Support**: English and Vietnamese interface

## 🚀 Quick Start

### Prerequisites
- Chrome browser with Developer mode enabled
- Node.js 16+ for building from source
- Supabase account for cloud features

### Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd VocabBreak
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
Create a `.env` file in the root directory:
```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. **Build the extension**
```bash
npm run build
```

5. **Load in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist` directory

## 🏗️ Architecture

### Core Components
- **Background Script** (`background.js`) - Handles timing, tab management, and question scheduling
- **Content Script** (`content/blocker.js`) - Injects blocking overlay and question UI
- **Popup** (`popup/`) - Extension popup interface for authentication and dashboard
- **Options** (`options/`) - Settings and configuration page

### Shared Modules
- **State Manager** (`shared/state-manager.js`) - Centralized state management
- **Error Handler** (`shared/error-handler.js`) - Comprehensive error handling
- **Auth Manager** (`shared/auth-manager.js`) - Authentication and user management
- **Supabase Client** (`shared/supabase-client.js`) - Database operations
- **Question Manager** (`shared/question-manager.js`) - Question selection and validation
- **Offline Manager** (`shared/offline-manager.js`) - IndexedDB for offline storage

## 🗄️ Database Setup

1. **Create Supabase Project**
   - Go to [supabase.com](https://supabase.com) and create a new project
   - Note your project URL and anon key

2. **Apply Database Schema**
   - Go to your Supabase dashboard → SQL Editor
   - Copy the contents of `database/schema.sql`
   - Execute the SQL to create tables, functions, and policies

3. **Configure Authentication**
   - Enable email authentication in Supabase Auth settings
   - Configure any additional auth providers as needed

For detailed setup instructions, see `database/SETUP_INSTRUCTIONS.md`.

## 🛠️ Development

### Available Scripts
- `npm run build` - Build the extension for production
- `npm install` - Install dependencies

### Project Structure
```
VocabBreak/
├── _locales/           # Internationalization files
├── assets/             # Extension icons and assets
├── background.js       # Service worker
├── content/            # Content scripts and styles
├── database/           # Database schema and setup
├── dist/              # Built extension (generated)
├── options/           # Options page
├── popup/             # Extension popup
├── scripts/           # Build scripts
└── shared/            # Shared modules and utilities
```

### Key Features Implementation
- **Centralized State Management**: All application state managed through `StateManager`
- **Comprehensive Error Handling**: Global error boundaries with user-friendly messages
- **Reactive UI Updates**: State-driven interface updates across all components
- **Memory Leak Prevention**: Proper cleanup patterns and subscription management
- **Robust Authentication**: Retry logic, input validation, and session management

## 🎮 Usage

1. **First Time Setup**
   - Click the extension icon and create an account
   - Configure your learning preferences in the options page
   - Set difficulty levels, topics, and timing preferences

2. **Learning Flow**
   - Browse the web normally
   - Every 30 minutes, a vocabulary question appears
   - Answer correctly to continue browsing
   - Wrong answers result in a 30-second penalty

3. **Progress Tracking**
   - View your stats in the popup dashboard
   - Track points, streaks, and accuracy
   - Unlock achievements as you progress
   - Monitor your learning in the options page

## 🔧 Configuration

### Timing Settings
- **Periodic Interval**: How often questions appear (default: 30 minutes)
- **Penalty Duration**: Delay after wrong answers (default: 30 seconds)

### Learning Settings
- **Difficulty Levels**: A1, A2, B1, B2, C1, C2
- **Question Types**: Multiple choice, text input
- **Topics**: General vocabulary, specific categories

### Site Management
- **Blacklist Mode**: Block specific sites
- **Whitelist Mode**: Only block certain sites
- **Exclusion Patterns**: Skip localhost, file://, etc.

## 🎯 Gamification

- **Points System**: Earn points for correct answers
- **Level Progression**: Advance through 6 levels
- **Streak Tracking**: Maintain daily learning streaks
- **Achievements**: Unlock badges for milestones
- **Leaderboards**: Compare progress with other learners

## 🔒 Privacy & Security

- **Local Storage**: Sensitive data stored locally when possible
- **Encrypted Communication**: All API calls use HTTPS
- **Row Level Security**: Database access controlled by user permissions
- **Input Validation**: All user inputs validated and sanitized
- **Error Sanitization**: No sensitive data in error messages

## 🌐 Browser Compatibility

- **Chrome**: Full support (primary target)
- **Edge**: Compatible with Chromium-based Edge
- **Other Browsers**: May work with Manifest V3 support

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🐛 Bug Reports

Please use the GitHub Issues tab to report bugs. Include:
- Chrome version
- Extension version
- Steps to reproduce
- Console errors (if any)

## 📚 Documentation

- `database/SETUP_INSTRUCTIONS.md` - Detailed database setup guide
- Code comments throughout the codebase
- JSDoc comments for all major functions

---

**Built with ❤️ for language learners everywhere**