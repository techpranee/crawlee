/**
 * Step 8: Debug API Access Issues
 * Get detailed error information and check API access
 */

require('dotenv').config();
const { GraphQLClient, gql } = require('graphql-request');

async function debugApiAccess() {
    console.log('🐛 Step 8: Debugging API Access Issues\n');

    const apiKey = process.env.TWENTY_API_KEY;
    if (!apiKey) {
        console.error('❌ TWENTY_API_KEY not set');
        process.exit(1);
    }

    console.log('🔑 API Key details:');
    console.log(`   Length: ${apiKey.length} characters`);
    console.log(`   Starts with: ${apiKey.substring(0, 10)}...`);
    console.log(`   Format: ${apiKey.includes('.') ? 'JWT' : 'API Key'}`);
    console.log('');

    const client = new GraphQLClient('https://hyrefast.20.techpranee.com/graphql', {
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
    });

    // Test 1: Check if the endpoint is accessible at all
    console.log('1️⃣ Testing endpoint accessibility...');
    try {
        const response = await fetch('https://hyrefast.20.techpranee.com/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                query: '{ __typename }'
            })
        });

        console.log(`   Status: ${response.status}`);
        console.log(`   Headers:`, Object.fromEntries(response.headers.entries()));

        const text = await response.text();
        console.log(`   Response: ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`);

        if (response.status === 200) {
            console.log('   ✅ Endpoint is accessible');
        } else {
            console.log('   ❌ Endpoint returned error');
        }
    } catch (error) {
        console.log(`   ❌ Network error: ${error.message}`);
    }
    console.log('');

    // Test 2: Try different authorization methods
    console.log('2️⃣ Testing different authorization methods...');

    const authMethods = [
        { name: 'Bearer', header: `Bearer ${apiKey}` },
        { name: 'API Key direct', header: apiKey },
        { name: 'Authorization', header: `Bearer ${apiKey}` },
    ];

    for (const { name, header } of authMethods) {
        console.log(`   Testing ${name}...`);
        try {
            const testClient = new GraphQLClient('https://hyrefast.20.techpranee.com/graphql', {
                headers: {
                    Authorization: header,
                },
            });

            const result = await testClient.request(gql`{ __typename }`);
            console.log(`     ✅ ${name} works: ${JSON.stringify(result)}`);
        } catch (error) {
            console.log(`     ❌ ${name} failed: ${error.message}`);
        }
    }
    console.log('');

    // Test 3: Check if there are any working queries
    console.log('3️⃣ Testing known working queries from schema...');

    const knownQueries = [
        { name: 'getCoreViews', query: gql`query { getCoreViews { id } }` },
        { name: 'index', query: gql`query { index }` },
    ];

    for (const { name, query } of knownQueries) {
        console.log(`   Testing ${name}...`);
        try {
            const result = await client.request(query);
            console.log(`     ✅ ${name} works: ${JSON.stringify(result, null, 2).substring(0, 100)}...`);
        } catch (error) {
            console.log(`     ❌ ${name} failed: ${error.message}`);
        }
    }

    console.log('');
    console.log('🔍 Analysis:');
    console.log('   - If all queries fail, the API key may not have proper permissions');
    console.log('   - Check if the API key is for the correct workspace/tenant');
    console.log('   - Verify the API key hasn\'t expired');
    console.log('   - Contact Twenty CRM support for API access issues');
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Step 8 Complete');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Run debug
debugApiAccess().catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
});
