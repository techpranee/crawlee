/**
 * Step 1: Environment Setup Check
 * Verify TWENTY_API_KEY is configured
 */

require('dotenv').config();

function checkEnvironment() {
    console.log('🔧 Step 1: Environment Setup Check\n');

    const apiKey = process.env.TWENTY_API_KEY;

    if (!apiKey) {
        console.log('❌ TWENTY_API_KEY is not set in your .env file');
        console.log('\n📝 To fix this:');
        console.log('1. Get your API key from Twenty CRM:');
        console.log('   - Go to https://app.20.techpranee.com');
        console.log('   - Navigate to Settings > API Keys');
        console.log('   - Create a new API key with proper permissions');
        console.log('');
        console.log('2. Add it to your .env file:');
        console.log('   TWENTY_API_KEY=your_api_key_here');
        console.log('');
        console.log('3. Restart your development server:');
        console.log('   npm run dev');
        console.log('');
        process.exit(1);
    }

    console.log('✅ TWENTY_API_KEY is configured');
    console.log(`   Key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 5)}`);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Step 1 Complete: Environment is ready!');
    console.log('Next: Run connection test');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

checkEnvironment();