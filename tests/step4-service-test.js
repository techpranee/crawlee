/**
 * Step 4: Test TwentyCrmService
 * Test the core service functionality
 */

require('dotenv').config();
const { TwentyCrmService } = require('ts-node/register');
require('../src/services/twentyCrm');

async function testTwentyCrmService() {
    console.log('🔧 Step 4: Testing TwentyCrmService\n');

    const apiKey = process.env.TWENTY_API_KEY;
    if (!apiKey) {
        console.error('❌ TWENTY_API_KEY not set');
        process.exit(1);
    }

    const service = new TwentyCrmService(apiKey);

    // Test 1: Health Check
    console.log('1️⃣ Testing health check...');
    const isHealthy = await service.healthCheck();
    console.log(`   ${isHealthy ? '✅' : '❌'} Health check: ${isHealthy ? 'PASSED' : 'FAILED'}\n`);

    if (!isHealthy) {
        console.error('❌ Service is not healthy. Cannot continue testing.');
        process.exit(1);
    }

    // Test 2: Sync a test lead
    console.log('2️⃣ Testing lead sync...');

    const testLead = {
        name: 'Test User',
        linkedinUrl: 'https://www.linkedin.com/in/test-user-' + Date.now(),
        companyName: 'Test Company',
        title: 'Software Engineer',
        location: 'San Francisco, CA',
        postUrl: 'https://www.linkedin.com/posts/test-post',
        postTitle: 'We are hiring!',
        companyUrl: 'https://www.linkedin.com/company/test-company',
        companyIndustry: 'Technology',
        postedAt: new Date(),
    };

    console.log(`   Syncing test lead: ${testLead.name}`);
    console.log(`   LinkedIn URL: ${testLead.linkedinUrl}`);

    const result = await service.syncLinkedInLead(testLead, 'test-tenant');

    if (result.success) {
        console.log('   ✅ Lead sync successful!');
        console.log(`   Created lead ID: ${result.leadId}`);
    } else {
        console.log('   ❌ Lead sync failed:');
        console.log(`   Error: ${result.error}`);
    }
    console.log('');

    // Test 3: Batch sync
    console.log('3️⃣ Testing batch sync...');

    const batchLeads = [
        {
            name: 'Batch User 1',
            linkedinUrl: 'https://www.linkedin.com/in/batch-user-1-' + Date.now(),
            companyName: 'Batch Company 1',
            title: 'Product Manager',
        },
        {
            name: 'Batch User 2',
            linkedinUrl: 'https://www.linkedin.com/in/batch-user-2-' + Date.now(),
            companyName: 'Batch Company 2',
            title: 'Designer',
        },
    ];

    console.log(`   Syncing ${batchLeads.length} leads...`);

    const batchResult = await service.syncLinkedInLeads(batchLeads, 'test-tenant');

    console.log(`   ✅ Batch sync completed:`);
    console.log(`      Successful: ${batchResult.successful}`);
    console.log(`      Failed: ${batchResult.failed}`);

    if (batchResult.errors.length > 0) {
        console.log('   Errors:');
        batchResult.errors.forEach((error, index) => {
            console.log(`      ${index + 1}. ${error.lead.name}: ${error.error}`);
        });
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Step 4 Complete: TwentyCrmService is working!');
    console.log('Next: Test the job handler');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Run test
testTwentyCrmService().catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
});
