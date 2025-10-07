/**
 * Step 3: Endpoint Discovery
 * Try different common GraphQL endpoints
 */

require('dotenv').config();
const https = require('https');

const endpoints = [
    'https://hyrefast.20.techpranee.com/graphql',
    'https://20.techpranee.com/graphql',
    'https://hyrefast.20.techpranee.com/api/graphql',
];

async function testEndpoint(endpoint) {
    return new Promise((resolve) => {
        const apiKey = process.env.TWENTY_API_KEY;

        const url = new URL(endpoint);
        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                resolve({
                    endpoint,
                    status: res.statusCode,
                    success: res.statusCode === 200,
                    response: data.substring(0, 100)
                });
            });
        });

        req.on('error', () => resolve({ endpoint, status: 'ERROR', success: false }));

        const query = JSON.stringify({
            query: `query { __typename }`
        });

        req.write(query);
        req.end();
    });
}

async function discoverEndpoint() {
    console.log('🔍 Step 3: Endpoint Discovery\n');
    console.log('Trying different GraphQL endpoints...\n');

    const results = [];

    for (const endpoint of endpoints) {
        console.log(`Testing: ${endpoint}`);
        const result = await testEndpoint(endpoint);
        results.push(result);

        if (result.success) {
            console.log(`   ✅ SUCCESS: ${result.status} - ${result.response}`);
        } else {
            console.log(`   ❌ FAILED: ${result.status}`);
        }
        console.log('');
    }

    const successful = results.filter(r => r.success);
    if (successful.length > 0) {
        console.log('🎉 Found working endpoint(s):');
        successful.forEach(r => console.log(`   ${r.endpoint}`));
        console.log('\nUpdate your code to use the correct endpoint!');
    } else {
        console.log('❌ No working endpoints found.');
        console.log('\nPossible solutions:');
        console.log('1. Check Twenty CRM documentation for correct API endpoint');
        console.log('2. Verify your API key permissions');
        console.log('3. Contact Twenty CRM support');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Step 3 Complete');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

discoverEndpoint();