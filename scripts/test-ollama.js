/**
 * Test Ollama API Connection
 * Quick script to verify Ollama service is working correctly
 */

require('dotenv').config();
const { getOllamaService, initOllamaService } = require('../src/services/ollama');

async function testOllama() {
  console.log('🧪 Testing Ollama API Connection\n');

  const ollamaUrl = process.env.OLLAMA_URL || 'https://ollama2.havenify.ai';
  const ollamaModel = process.env.OLLAMA_MODEL || 'deepseek-r1:14b';

  console.log('📋 Configuration:');
  console.log(`   URL: ${ollamaUrl}`);
  console.log(`   Model: ${ollamaModel}\n`);

  // Initialize Ollama service
  const ollama = initOllamaService(ollamaUrl, ollamaModel);

  // Test 1: Health Check
  console.log('1️⃣ Testing health check...');
  const isHealthy = await ollama.healthCheck();
  console.log(`   ${isHealthy ? '✅' : '❌'} Health check: ${isHealthy ? 'PASSED' : 'FAILED'}\n`);

  if (!isHealthy) {
    console.error('❌ Ollama service is not available. Please check:');
    console.error('   - Is the URL correct?');
    console.error('   - Is the service running?');
    console.error('   - Is there a network connection?\n');
    process.exit(1);
  }

  // Test 2: List Models
  console.log('2️⃣ Listing available models...');
  const models = await ollama.listModels();
  if (models.length > 0) {
    console.log(`   ✅ Found ${models.length} models:`);
    models.forEach(model => console.log(`      - ${model}`));
  } else {
    console.log('   ⚠️  No models found or unable to list models');
  }
  console.log('');

  // Test 3: Simple Completion
  console.log('3️⃣ Testing simple completion...');
  const simplePrompt = 'Say "Hello, World!" in JSON format with a key called "message".';
  console.log(`   Prompt: "${simplePrompt}"`);

  const simpleResponse = await ollama.complete(simplePrompt, {
    temperature: 0.1,
  });

  if (simpleResponse) {
    console.log('   ✅ Response received:');
    console.log(`   ${simpleResponse.substring(0, 200)}${simpleResponse.length > 200 ? '...' : ''}\n`);
  } else {
    console.log('   ❌ No response received\n');
  }

  // Test 4: JSON Extraction
  console.log('4️⃣ Testing JSON extraction...');
  const jsonPrompt = `Extract job information from this text:
"We are hiring a Senior Software Engineer in San Francisco. Must know Python and React. Salary: $150k-$180k."

Return JSON with: company, jobTitle, location, skills, salaryRange`;

  console.log('   Prompt: Extract job info from hiring text');

  const jsonResponse = await ollama.extractJSON(
    jsonPrompt,
    'You are a job data extractor. Return only valid JSON.'
  );

  if (jsonResponse) {
    console.log('   ✅ JSON parsed successfully:');
    console.log('   ' + JSON.stringify(jsonResponse, null, 2).split('\n').join('\n   '));
  } else {
    console.log('   ❌ Failed to extract JSON');
  }
  console.log('');

  // Test 5: Chat Completion
  console.log('5️⃣ Testing chat with system prompt...');
  const chatResponse = await ollama.chat(
    [
      { role: 'user', content: 'What is 2+2? Answer with just the number.' }
    ],
    {
      systemPrompt: 'You are a helpful math assistant. Be concise.',
      temperature: 0.1,
    }
  );

  if (chatResponse) {
    console.log('   ✅ Chat response:');
    console.log(`   "${chatResponse.trim()}"\n`);
  } else {
    console.log('   ❌ No chat response\n');
  }

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Test Summary:');
  console.log(`   Health Check: ${isHealthy ? '✅' : '❌'}`);
  console.log(`   List Models: ${models.length > 0 ? '✅' : '⚠️'}`);
  console.log(`   Simple Completion: ${simpleResponse ? '✅' : '❌'}`);
  console.log(`   JSON Extraction: ${jsonResponse ? '✅' : '❌'}`);
  console.log(`   Chat Completion: ${chatResponse ? '✅' : '❌'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const allPassed = isHealthy && simpleResponse && jsonResponse && chatResponse;

  if (allPassed) {
    console.log('✅ All tests passed! Ollama service is working correctly.');
    console.log('   You can now run the LinkedIn scraper.\n');
  } else {
    console.log('⚠️  Some tests failed. Please check the configuration.');
    console.log('   The scraper may not work correctly.\n');
  }

  process.exit(allPassed ? 0 : 1);
}

// Run tests
testOllama().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
