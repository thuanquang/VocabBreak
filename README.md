# VocabBreak - Language Learning Browser Extension

VocabBreak is an innovative browser extension that gamifies English vocabulary learning by strategically blocking web access until users correctly answer language questions. Transform your browsing habits into productive learning sessions!

## 🌟 Features

### Core Learning Experience
- **Strategic Web Blocking**: Questions appear when visiting new sites or every 30 minutes (configurable)
- **Unbypassable Interface**: Professional, secure overlay that prevents easy circumvention
- **Multiple Question Types**: Multiple choice, text input, and voice input (coming soon)
- **CEFR Difficulty Levels**: A1 (Beginner) to C2 (Proficiency) vocabulary
- **Topic Categories**: Business, travel, technology, health, education, and more

### Gamification System
- **Points & Levels**: Earn points based on difficulty and performance
- **Streak System**: Build consecutive correct answer streaks with multipliers
- **Achievements**: Unlock badges for various milestones and accomplishments
- **Progress Tracking**: Detailed statistics on accuracy, speed, and improvement

### Customization & Control
- **Site Management**: Whitelist or blacklist specific websites
- **Flexible Timing**: Adjust question frequency and penalty durations
- **Offline Support**: Cache questions locally for uninterrupted learning
- **Bilingual Interface**: English and Vietnamese language support

### Data & Sync
- **Supabase Integration**: Cloud storage for progress and settings sync
- **Cross-Device Sync**: Access your progress from any browser
- **Data Export**: Backup your learning data and achievements
- **Privacy First**: Secure data handling with user control

## 🚀 Quick Start

### Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/yourusername/vocabbreak.git
   cd vocabbreak
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Supabase** (Optional but recommended)
   - Create a [Supabase](https://supabase.com) account
   - Create a new project
   - Update `shared/supabase-client.js` with your credentials:
   ```javascript
   const SUPABASE_URL = 'your-project-url';
   const SUPABASE_ANON_KEY = 'your-anon-key';
   ```

4. **Create Extension Icons**
   - Add icon files to `assets/` directory:
     - `icon16.png` (16x16)
     - `icon32.png` (32x32)
     - `icon48.png` (48x48)
     - `icon128.png` (128x128)
   - See `assets/README.md` for design guidelines

5. **Load Extension in Browser**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the project directory

### First Time Setup

1. **Open Extension Options**
   - Click the VocabBreak icon in the toolbar
   - Select "Settings" or right-click the icon and choose "Options"

2. **Configure Your Learning**
   - Choose your difficulty levels (A1-C2)
   - Select question types and topics
   - Set up site blocking preferences
   - Adjust timing settings

3. **Create Account** (Optional)
   - Sign up for cloud sync and progress tracking
   - Or continue in offline mode

## 🔧 Development

### Project Structure

```
VocabBreak/
├── manifest.json          # Extension configuration
├── background.js           # Service worker for tab management
├── content/               # Content scripts and blocking UI
│   ├── blocker.js         # Main blocking logic
│   └── blocker.css        # Overlay styling
├── popup/                 # Extension popup interface
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/               # Settings page
│   ├── options.html
│   ├── options.css
│   └── options.js
├── shared/                # Shared utilities
│   ├── i18n.js           # Internationalization
│   ├── supabase-client.js # Database integration
│   ├── offline-manager.js # IndexedDB operations
│   ├── gamification.js   # Points and achievements
│   ├── question-manager.js # Question handling
│   └── site-filter.js    # URL filtering logic
├── locales/              # Language files
│   ├── en/messages.json  # English translations
│   └── vi/messages.json  # Vietnamese translations
└── assets/               # Icons and resources
```

### Key Components

#### Background Script (`background.js`)
- Tracks tab states and schedules questions
- Manages timers and persistence
- Handles cross-component communication

#### Content Script (`content/blocker.js`)
- Injects blocking overlay into web pages
- Handles question display and user interaction
- Prevents bypass attempts

#### Shared Utilities (`shared/`)
- **I18n**: Multi-language support system
- **Supabase Client**: Database operations and auth
- **Offline Manager**: IndexedDB caching and sync
- **Gamification**: Points, streaks, and achievements
- **Question Manager**: Question selection and validation
- **Site Filter**: URL pattern matching and filtering

### Database Schema (Supabase)

```sql
-- Users table
CREATE TABLE users (
  id UUID REFERENCES auth.users PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  settings_json JSONB DEFAULT '{}',
  total_points INTEGER DEFAULT 0,
  current_level INTEGER DEFAULT 1,
  current_streak INTEGER DEFAULT 0
);

-- Questions table
CREATE TABLE questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  level TEXT NOT NULL CHECK (level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  topic TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('multiple-choice', 'text-input', 'voice-input')),
  question_text_en TEXT NOT NULL,
  question_text_vi TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  options_json JSONB,
  explanation_en TEXT,
  explanation_vi TEXT,
  points_value INTEGER NOT NULL,
  difficulty INTEGER DEFAULT 5 CHECK (difficulty >= 1 AND difficulty <= 10),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User progress tracking
CREATE TABLE user_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  answered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  correct BOOLEAN NOT NULL,
  time_taken INTEGER NOT NULL,
  points_earned INTEGER NOT NULL,
  streak_at_time INTEGER DEFAULT 0,
  attempt_number INTEGER DEFAULT 1
);

-- User settings
CREATE TABLE user_settings (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, setting_key)
);

-- Cached questions metadata
CREATE TABLE cached_questions (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE PRIMARY KEY,
  question_ids_json JSONB NOT NULL,
  cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  level_filter TEXT[],
  topic_filter TEXT[]
);
```

## 🎯 Usage Guide

### Basic Operation

1. **Browse Normally**: VocabBreak runs silently in the background
2. **Answer Questions**: When a question appears, select or type your answer
3. **Learn from Mistakes**: Wrong answers trigger a 30-second wait period
4. **Build Streaks**: Consecutive correct answers multiply your points
5. **Track Progress**: View stats and achievements in the popup

### Site Management

**Blacklist Mode** (Default)
- Blocks all sites except those in your exclusion list
- Good for general learning while protecting work/banking sites

**Whitelist Mode**
- Only blocks sites you specifically target
- Ideal for focused learning on social media or entertainment sites

### Timing Configuration

- **Question Frequency**: 5-120 minutes between questions
- **New Site Trigger**: Immediate questions when visiting new domains
- **Penalty Duration**: 10-300 seconds wait after wrong answers

### Difficulty Progression

- **A1-A2**: Basic vocabulary and common words
- **B1-B2**: Intermediate expressions and concepts
- **C1-C2**: Advanced vocabulary and nuanced meanings

## 🌍 Internationalization

VocabBreak supports multiple interface languages:

- **English**: Default language
- **Vietnamese**: Full translation available

To add a new language:

1. Create `locales/[lang]/messages.json`
2. Update `shared/i18n.js` to include the new language
3. Add language option to settings page

## 🔒 Privacy & Security

- **Local First**: Core functionality works offline
- **Encrypted Storage**: Sensitive data is properly secured
- **User Control**: Complete control over data export and deletion
- **Minimal Permissions**: Only requests necessary browser permissions
- **Open Source**: Full transparency in code and data handling

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Fork the Repository**
2. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make Your Changes**
4. **Test Thoroughly**
5. **Submit a Pull Request**

### Development Guidelines

- Follow existing code style and patterns
- Add comments for complex logic
- Test across different browsers
- Update documentation for new features
- Ensure accessibility compliance

### Areas for Contribution

- **Question Database**: Add more vocabulary questions
- **Language Support**: Translate interface to new languages
- **Voice Features**: Implement pronunciation checking
- **UI/UX**: Improve design and user experience
- **Performance**: Optimize loading and caching
- **Testing**: Add automated tests

## 📚 Learning Resources

- [CEFR Language Levels](https://www.coe.int/en/web/common-european-framework-reference-languages)
- [Vocabulary Learning Strategies](https://www.cambridge.org/core/journals/language-teaching)
- [Spaced Repetition Research](https://www.gwern.net/Spaced-repetition)

## 🐛 Troubleshooting

### Common Issues

**Extension Not Loading**
- Check that all required files are present
- Verify manifest.json syntax
- Enable Developer mode in Chrome

**Questions Not Appearing**
- Check site filtering settings
- Verify timing configuration
- Look for JavaScript errors in console

**Sync Issues**
- Verify Supabase credentials
- Check internet connection
- Try manual sync from settings

**Performance Problems**
- Clear extension data and restart
- Check for conflicting extensions
- Update to latest Chrome version

### Getting Help

- Check the [Issues](https://github.com/yourusername/vocabbreak/issues) page
- Create a new issue with detailed information
- Include browser version and error messages
- Provide steps to reproduce the problem

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- Supabase for backend infrastructure
- Chrome Extensions team for excellent documentation
- Language learning community for feedback and suggestions
- Open source contributors who make projects like this possible

---

**Happy Learning! 🎓**

Transform your browsing time into vocabulary mastery with VocabBreak.



