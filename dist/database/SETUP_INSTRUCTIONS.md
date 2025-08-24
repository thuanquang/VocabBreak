# VocabBreak Database Setup Instructions

## Overview
This guide will help you set up the optimized, flexible database schema for VocabBreak using Supabase.

## Prerequisites
1. A Supabase account (free tier is sufficient for development)
2. Node.js installed (v14 or higher)
3. Basic knowledge of SQL and PostgreSQL

## Step 1: Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in to your account
3. Click "New Project"
4. Fill in the project details:
   - **Name**: VocabBreak
   - **Database Password**: Choose a strong password
   - **Region**: Select the closest region to your users
   - **Pricing Plan**: Free tier for development

## Step 2: Set Up the Database Schema

### Option A: Using Supabase SQL Editor (Recommended)

1. In your Supabase dashboard, go to **SQL Editor**
2. Click **New Query**
3. Copy the entire contents of `database/schema.sql`
4. Paste it into the SQL editor
5. Click **Run** to execute the schema creation

### Option B: Using Supabase CLI

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

3. Link your project:
   ```bash
   supabase link --project-ref your-project-ref
   ```

4. Run the migration:
   ```bash
   supabase db push database/schema.sql
   ```

## Step 3: Configure Environment Variables

1. Create a `.env` file in your project root:
   ```bash
   touch .env
   ```

2. Get your Supabase credentials:
   - Go to your Supabase project dashboard
   - Navigate to **Settings** → **API**
   - Copy the **Project URL** and **anon public** key

3. Add to `.env`:
   ```env
   SUPABASE_URL=your-project-url
   SUPABASE_ANON_KEY=your-anon-key
   ```

4. Add `.env` to `.gitignore`:
   ```gitignore
   .env
   .env.local
   ```

## Step 4: Install Dependencies

```bash
npm install @supabase/supabase-js
```

## Step 5: Seed Initial Data (Optional)

### Add Sample Questions

```sql
-- Insert sample questions for testing
INSERT INTO questions (content, answers, metadata, scoring) VALUES
(
  jsonb_build_object(
    'text', jsonb_build_object(
      'en', 'What is the capital of France?',
      'vi', 'Thủ đô của Pháp là gì?'
    ),
    'explanation', jsonb_build_object(
      'en', 'Paris has been the capital of France since 987 AD.',
      'vi', 'Paris là thủ đô của Pháp từ năm 987 sau Công nguyên.'
    )
  ),
  jsonb_build_object(
    'correct', ARRAY['Paris'],
    'options', ARRAY[
      jsonb_build_object('text', 'London', 'id', 'opt1'),
      jsonb_build_object('text', 'Berlin', 'id', 'opt2'),
      jsonb_build_object('text', 'Paris', 'id', 'opt3'),
      jsonb_build_object('text', 'Madrid', 'id', 'opt4')
    ]
  ),
  jsonb_build_object(
    'level', 'A1',
    'topics', ARRAY['geography', 'culture'],
    'tags', ARRAY['capital', 'europe', 'france'],
    'type', 'multiple-choice',
    'difficulty', 2
  ),
  jsonb_build_object(
    'base_points', 10,
    'time_bonus_enabled', true,
    'time_bonus_threshold', 10
  )
),
(
  jsonb_build_object(
    'text', jsonb_build_object(
      'en', 'Complete the sentence: I ___ to school every day.',
      'vi', 'Hoàn thành câu: Tôi ___ đến trường mỗi ngày.'
    ),
    'hints', ARRAY[
      jsonb_build_object('en', 'Think about present simple tense', 'vi', 'Nghĩ về thì hiện tại đơn')
    ]
  ),
  jsonb_build_object(
    'correct', ARRAY['go', 'walk', 'run'],
    'options', ARRAY[
      jsonb_build_object('text', 'go', 'id', 'opt1'),
      jsonb_build_object('text', 'goes', 'id', 'opt2'),
      jsonb_build_object('text', 'going', 'id', 'opt3'),
      jsonb_build_object('text', 'went', 'id', 'opt4')
    ]
  ),
  jsonb_build_object(
    'level', 'A1',
    'topics', ARRAY['grammar', 'daily-life'],
    'tags', ARRAY['present-simple', 'verbs'],
    'type', 'multiple-choice',
    'difficulty', 3
  ),
  jsonb_build_object(
    'base_points', 15
  )
);
```

## Step 6: Test the Connection

Create a test file `test-connection.js`:

```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  try {
    // Test fetching questions
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .limit(5);
    
    if (error) throw error;
    
    console.log('✅ Connection successful!');
    console.log(`Found ${data.length} questions`);
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  }
}

testConnection();
```

Run the test:
```bash
node test-connection.js
```

## Step 7: Enable Real-time Subscriptions (Optional)

1. Go to your Supabase dashboard
2. Navigate to **Database** → **Replication**
3. Enable replication for tables you want real-time updates:
   - `user_interactions`
   - `learning_sessions`
   - `user_achievements`

## Step 8: Set Up Storage Buckets (Optional)

For storing question media (images, audio, video):

1. Go to **Storage** in your Supabase dashboard
2. Create a new bucket:
   - Name: `question-media`
   - Public: Yes (for easy access)
3. Set up policies for upload permissions

## Security Best Practices

### 1. Enable Row Level Security (RLS)
The schema already includes RLS policies, but ensure they're enabled:

```sql
-- Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

### 2. Configure CORS
In Supabase dashboard → **Settings** → **API**:
- Add your extension's origin to allowed CORS origins
- For development: `chrome-extension://your-extension-id`

### 3. API Rate Limiting
Configure rate limiting in your extension:

```javascript
// Add to supabase-client.js
const rateLimiter = {
  requests: 0,
  resetTime: Date.now() + 60000, // 1 minute
  maxRequests: 60,
  
  checkLimit() {
    if (Date.now() > this.resetTime) {
      this.requests = 0;
      this.resetTime = Date.now() + 60000;
    }
    
    if (this.requests >= this.maxRequests) {
      throw new Error('Rate limit exceeded');
    }
    
    this.requests++;
  }
};
```

## Troubleshooting

### Common Issues and Solutions

1. **"relation does not exist" error**
   - Ensure you've run the entire schema.sql file
   - Check that you're connected to the correct database

2. **Authentication errors**
   - Verify your SUPABASE_URL and SUPABASE_ANON_KEY are correct
   - Check that RLS policies allow the operation

3. **CORS errors in browser extension**
   - Add your extension ID to Supabase CORS settings
   - Use the background script for API calls

4. **Slow queries**
   - Check that all indexes were created
   - Use the query performance analyzer in Supabase dashboard

## Monitoring and Maintenance

### Database Metrics
Monitor in Supabase dashboard → **Database** → **Reports**:
- Query performance
- Storage usage
- Connection pool status

### Backup Strategy
1. Enable Point-in-Time Recovery (PITR) for production
2. Set up daily backups in Supabase dashboard
3. Export critical data regularly:

```bash
# Export all data
supabase db dump -f backup.sql

# Export specific tables
supabase db dump -f questions.sql --data-only -t questions
```

## Next Steps

1. ✅ Database schema is set up
2. ✅ Environment variables are configured
3. ✅ Connection is tested
4. 🔄 Implement the extension features using the new schema
5. 🔄 Add more questions to the database
6. 🔄 Set up monitoring and analytics

## Support

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL JSONB Documentation](https://www.postgresql.org/docs/current/datatype-json.html)
- [VocabBreak GitHub Issues](https://github.com/your-repo/vocabbreak/issues)

