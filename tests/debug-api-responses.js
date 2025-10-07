const axios = require('axios');

const TWENTY_REST_URL = 'https://20.techpranee.com/rest';
const TWENTY_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0YTU5NmViMi1iMWJjLTQyZTgtODhhOS0wYTc3YTRiZTNkM2UiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiNGE1OTZlYjItYjFiYy00MmU4LTg4YTktMGE3N2E0YmUzZDNlIiwiaWF0IjoxNzU5NjkwNzM4LCJleHAiOjQ5MTMyOTA3MzcsImp0aSI6IjE3ZDMyZmRlLTNhNDgtNGI3Ny04NWE1LTI3NGZhYzc0ZTE5YiJ9.UKk8s9LBc_zWOBbyZh_djFj2pGSmBknD1QVSNclWJ3Q';

async function debugApiResponses() {
    console.log('🔍 Debugging Twenty CRM API Response Structure...\n');

    try {
        // Test companies endpoint
        console.log('=== Companies Response ===');
        const companiesResponse = await axios.get(`${TWENTY_REST_URL}/companies`, {
            headers: {
                'Authorization': `Bearer ${TWENTY_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log('Status:', companiesResponse.status);
        console.log('Response data type:', typeof companiesResponse.data);
        console.log('Response data keys:', Object.keys(companiesResponse.data));
        console.log('Response data:', JSON.stringify(companiesResponse.data, null, 2));
        console.log();

        // Test people endpoint
        console.log('=== People Response ===');
        const peopleResponse = await axios.get(`${TWENTY_REST_URL}/people`, {
            headers: {
                'Authorization': `Bearer ${TWENTY_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log('Status:', peopleResponse.status);
        console.log('Response data type:', typeof peopleResponse.data);
        console.log('Response data keys:', Object.keys(peopleResponse.data));
        console.log('Response data:', JSON.stringify(peopleResponse.data, null, 2));
        console.log();

        // Test leads endpoint
        console.log('=== Leads Response ===');
        const leadsResponse = await axios.get(`${TWENTY_REST_URL}/leadsLinkedinScrapings`, {
            headers: {
                'Authorization': `Bearer ${TWENTY_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log('Status:', leadsResponse.status);
        console.log('Response data type:', typeof leadsResponse.data);
        console.log('Response data keys:', Object.keys(leadsResponse.data));
        console.log('Response data:', JSON.stringify(leadsResponse.data, null, 2));

    } catch (error) {
        console.log(`❌ Debug failed: ${error.response?.status} - ${JSON.stringify(error.response?.data)}`);
    }
}

debugApiResponses();