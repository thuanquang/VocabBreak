/**
 * Test script to verify question filtering functionality
 * Run this in the browser console to test different filter combinations
 */

// Test function to check question filtering
async function testQuestionFiltering() {
  console.log('🧪 Testing question filtering...');
  
  if (!window.supabaseClient) {
    console.error('❌ Supabase client not available');
    return;
  }
  
  const testCases = [
    {
      name: 'All levels (A1, A2, B1)',
      filters: { level: ['A1', 'A2', 'B1'] }
    },
    {
      name: 'Only A1 level',
      filters: { level: ['A1'] }
    },
    {
      name: 'Multiple choice questions only',
      filters: { level: ['A1', 'A2', 'B1'], type: ['multiple-choice'] }
    },
    {
      name: 'Text input questions only',
      filters: { level: ['A1', 'A2', 'B1'], type: ['text-input'] }
    },
    {
      name: 'Difficulty range 1-5',
      filters: { level: ['A1', 'A2', 'B1'], difficulty: { min: 1, max: 5 } }
    },
    {
      name: 'Difficulty range 6-10',
      filters: { level: ['A1', 'A2', 'B1'], difficulty: { min: 6, max: 10 } }
    },
    {
      name: 'Exact difficulty 5',
      filters: { level: ['A1', 'A2', 'B1'], difficulty: 5 }
    },
    {
      name: 'With topics filter (if available)',
      filters: { level: ['A1', 'A2', 'B1'], topics: ['vocabulary'] }
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n🧪 Test: ${testCase.name}`);
    console.log('🔍 Filters:', JSON.stringify(testCase.filters, null, 2));
    
    try {
      const question = await window.supabaseClient.getRandomQuestion(testCase.filters);
      
      if (question) {
        console.log('✅ Question found:', {
          id: question.id,
          level: question.metadata?.level,
          type: question.metadata?.type,
          difficulty: question.metadata?.difficulty,
          topics: question.metadata?.topics,
          questionText: question.content?.text?.en || 'No text'
        });
      } else {
        console.log('❌ No question found for these filters');
      }
    } catch (error) {
      console.error('❌ Error in test case:', error);
    }
  }
}

// Test function to get all questions with specific filters
async function getAllQuestions(filters = {}) {
  console.log('📋 Getting all questions with filters:', JSON.stringify(filters, null, 2));
  
  if (!window.supabaseClient) {
    console.error('❌ Supabase client not available');
    return;
  }
  
  try {
    const questions = await window.supabaseClient.getQuestions(filters);
    console.log(`📋 Found ${questions.length} questions`);
    
    questions.forEach((q, index) => {
      console.log(`${index + 1}. ID: ${q.id}, Level: ${q.metadata?.level}, Type: ${q.metadata?.type}, Difficulty: ${q.metadata?.difficulty}`);
    });
    
    return questions;
  } catch (error) {
    console.error('❌ Error getting questions:', error);
    return [];
  }
}

// Test function to check database structure
async function checkDatabaseStructure() {
  console.log('🔍 Checking database structure...');
  
  if (!window.supabaseClient) {
    console.error('❌ Supabase client not available');
    return;
  }
  
  try {
    // Get a sample question to understand structure
    const sampleQuestion = await window.supabaseClient.getRandomQuestion({});
    
    if (sampleQuestion) {
      console.log('📋 Sample question structure:');
      console.log('- ID:', sampleQuestion.id);
      console.log('- Content:', sampleQuestion.content);
      console.log('- Answers:', sampleQuestion.answers);
      console.log('- Metadata:', sampleQuestion.metadata);
      console.log('- Scoring:', sampleQuestion.scoring);
    } else {
      console.log('❌ No questions found in database');
    }
  } catch (error) {
    console.error('❌ Error checking database structure:', error);
  }
}

// Export functions for console use
window.testQuestionFiltering = testQuestionFiltering;
window.getAllQuestions = getAllQuestions;
window.checkDatabaseStructure = checkDatabaseStructure;

console.log('🧪 Question filtering test functions loaded:');
console.log('- testQuestionFiltering() - Test different filter combinations');
console.log('- getAllQuestions(filters) - Get all questions with filters');
console.log('- checkDatabaseStructure() - Check database structure');

