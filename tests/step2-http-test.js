/**
 * Step 2: Basic HTTP Test
 * Test raw HTTP connection to Twenty CRM
 */

require('dotenv').config();
const https = require('https');

async function testHttpConnection() {
    console.log('🌐 Step 2: Basic HTTP Connection Test\n');

    const apiKey = process.env.TWENTY_API_KEY;
    if (!apiKey) {
        console.error('❌ TWENTY_API_KEY not set');
        process.exit(1);
    }

    const url = 'https://hyrefast.20.techpranee.com/graphql';
    console.log(`Testing endpoint: ${url}`);

    return new Promise((resolve) => {
        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
        }, (res) => {
            console.log(`Status: ${res.statusCode}`);
            console.log(`Headers:`, JSON.stringify(res.headers, null, 2));

            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                console.log('\nResponse body preview:');
                console.log(data.substring(0, 200) + (data.length > 200 ? '...' : ''));

                if (res.statusCode === 200) {
                    console.log('\n✅ HTTP connection successful!');
                    console.log('Next: Test GraphQL queries');
                } else {
                    console.log(`\n❌ HTTP error: ${res.statusCode}`);
                    console.log('Possible issues:');
                    console.log('- API key is incorrect');
                    console.log('- API key lacks permissions');
                    console.log('- Endpoint URL is wrong');
                    console.log('- Twenty CRM instance is down');
                }
                resolve();
            });
        });

        req.on('error', (error) => {
            console.error('\n❌ Network error:', error.message);
            console.log('Check your internet connection');
            resolve();
        });

        // Send a simple GraphQL query
        const query = JSON.stringify({
            query: `query { __typename }`
        });

        req.write(query);
        req.end();
    });
}

testHttpConnection().then(() => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Step 2 Complete');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});