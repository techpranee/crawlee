const { getTwentyCrmService } = require('../src/services/twentyCrm');

async function testTwentyCrmRestService() {
    console.log('🧪 Testing Twenty CRM REST API Service...\n');

    try {
        const service = getTwentyCrmService();

        // Test 1: Health check
        console.log('1. Testing health check...');
        const isHealthy = await service.healthCheck();
        console.log(`✅ Health check: ${isHealthy ? 'PASSED' : 'FAILED'}\n`);

        if (!isHealthy) {
            console.log('❌ Service is not healthy, stopping tests');
            return;
        }

        // Test 2: Get current data counts
        console.log('2. Getting current data counts...');
        const counts = await service.getDataCounts();
        console.log(`📊 Current data: ${counts.people} people, ${counts.companies} companies, ${counts.leads} leads\n`);

        // Test 3: Sync a single LinkedIn lead
        console.log('3. Testing single lead sync...');
        const testLead = {
            name: 'John Doe',
            linkedinUrl: 'https://linkedin.com/in/johndoe-test',
            companyName: 'Test Company Inc',
            title: 'Software Engineer',
            location: 'San Francisco, CA',
            companyUrl: 'https://linkedin.com/company/testcompany',
            companyIndustry: 'Technology',
            postedAt: new Date(),
        };

        const result = await service.syncLinkedInLead(testLead, 'test-tenant');
        if (result.success) {
            console.log(`✅ Lead sync successful:`);
            console.log(`   Person ID: ${result.personId}`);
            console.log(`   Company ID: ${result.companyId}`);
            console.log(`   Lead ID: ${result.leadId || 'N/A (not supported in workspace)'}\n`);
        } else {
            console.log(`❌ Lead sync failed: ${result.error}\n`);
        }

        // Test 4: Sync multiple leads
        console.log('4. Testing batch lead sync...');
        const testLeads = [
            {
                name: 'Jane Smith',
                linkedinUrl: 'https://linkedin.com/in/janesmith-test',
                companyName: 'Another Company',
                title: 'Product Manager',
                location: 'New York, NY',
            },
            {
                name: 'Bob Johnson',
                linkedinUrl: 'https://linkedin.com/in/bobjohnson-test',
                companyName: 'Test Company Inc', // Should reuse existing company
                title: 'CTO',
                location: 'Austin, TX',
            },
        ];

        const batchResult = await service.syncLinkedInLeads(testLeads, 'test-tenant');
        console.log(`✅ Batch sync completed:`);
        console.log(`   Successful: ${batchResult.successful}`);
        console.log(`   Failed: ${batchResult.failed}`);
        if (batchResult.errors.length > 0) {
            console.log('   Errors:');
            batchResult.errors.forEach((error, index) => {
                console.log(`     ${index + 1}. ${error.lead.name}: ${error.error}`);
            });
        }
        console.log();

        // Test 5: Final data counts
        console.log('5. Getting final data counts...');
        const finalCounts = await service.getDataCounts();
        console.log(`📊 Final data: ${finalCounts.people} people, ${finalCounts.companies} companies, ${finalCounts.leads} leads\n`);

        console.log('🎉 All tests completed!');

    } catch (error) {
        console.log(`❌ Test failed: ${error.message}`);
    }
}

// Set the API key for testing
process.env.TWENTY_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0YTU5NmViMi1iMWJjLTQyZTgtODhhOS0wYTc3YTRiZTNkM2UiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiNGE1OTZlYjItYjFiYy00MmU4LTg4YTktMGE3N2E0YmUzZDNlIiwiaWF0IjoxNzU5NjkwNzM4LCJleHAiOjQ5MTMyOTA3MzcsImp0aSI6IjE3ZDMyZmRlLTNhNDgtNGI3Ny04NWE1LTI3NGZhYzc0ZTE5YiJ9.UKk8s9LBc_zWOBbyZh_djFj2pGSmBknD1QVSNclWJ3Q';

testTwentyCrmRestService();