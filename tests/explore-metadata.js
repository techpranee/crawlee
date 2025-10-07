const axios = require('axios');

const TWENTY_REST_URL = 'https://20.techpranee.com/rest';
const TWENTY_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0YTU5NmViMi1iMWJjLTQyZTgtODhhOS0wYTc3YTRiZTNkM2UiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiNGE1OTZlYjItYjFiYy00MmU4LTg4YTktMGE3N2E0YmUzZDNlIiwiaWF0IjoxNzU5NjkwNzM4LCJleHAiOjQ5MTMyOTA3MzcsImp0aSI6IjE3ZDMyZmRlLTNhNDgtNGI3Ny04NWE1LTI3NGZhYzc0ZTE5YiJ9.UKk8s9LBc_zWOBbyZh_djFj2pGSmBknD1QVSNclWJ3Q';

async function exploreObjectMetadata() {
    console.log('🔍 Exploring Twenty CRM Object Metadata...\n');

    try {
        // Check what objects are available
        console.log('=== Available Objects ===');
        const objectsResponse = await axios.get(`${TWENTY_REST_URL}/metadata/objects`, {
            headers: {
                'Authorization': `Bearer ${TWENTY_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log('Available objects:', objectsResponse.data?.data?.map(obj => obj.nameSingular) || []);

        // Get person object metadata
        console.log('\n=== Person Object Fields ===');
        try {
            const personMetadata = await axios.get(`${TWENTY_REST_URL}/metadata/objects/person`, {
                headers: {
                    'Authorization': `Bearer ${TWENTY_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });
            const personFields = personMetadata.data?.data?.fields || [];
            console.log('Person fields:');
            personFields.forEach(field => {
                console.log(`  - ${field.name} (${field.type}) ${field.isNullable ? '[optional]' : '[required]'}`);
            });
        } catch (error) {
            console.log(`❌ Person metadata: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
        }

        // Get leadsLinkedinScraping object metadata
        console.log('\n=== Leads LinkedIn Scraping Object Fields ===');
        try {
            const leadsMetadata = await axios.get(`${TWENTY_REST_URL}/metadata/objects/leadsLinkedinScraping`, {
                headers: {
                    'Authorization': `Bearer ${TWENTY_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });
            const leadsFields = leadsMetadata.data?.data?.fields || [];
            console.log('Leads fields:');
            leadsFields.forEach(field => {
                console.log(`  - ${field.name} (${field.type}) ${field.isNullable ? '[optional]' : '[required]'}`);
            });
        } catch (error) {
            console.log(`❌ Leads metadata: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
        }

        // Get company object metadata
        console.log('\n=== Company Object Fields ===');
        try {
            const companyMetadata = await axios.get(`${TWENTY_REST_URL}/metadata/objects/company`, {
                headers: {
                    'Authorization': `Bearer ${TWENTY_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });
            const companyFields = companyMetadata.data?.data?.fields || [];
            console.log('Company fields:');
            companyFields.forEach(field => {
                console.log(`  - ${field.name} (${field.type}) ${field.isNullable ? '[optional]' : '[required]'}`);
            });
        } catch (error) {
            console.log(`❌ Company metadata: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
        }

        // Try creating a person with only the available fields
        console.log('\n=== Testing Person Creation with Available Fields ===');
        try {
            const testPerson = {
                name: {
                    firstName: 'Test',
                    lastName: 'User'
                }
                // Only include fields that exist according to metadata
            };
            const response = await axios.post(`${TWENTY_REST_URL}/people`, testPerson, {
                headers: {
                    'Authorization': `Bearer ${TWENTY_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`✅ Person created successfully: ${response.status}`);
            console.log('Created person:', JSON.stringify(response.data, null, 2));
        } catch (error) {
            console.log(`❌ Person creation failed: ${error.response?.status} - ${JSON.stringify(error.response?.data)}`);
        }

    } catch (error) {
        console.log(`❌ Metadata exploration failed: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
    }
}

exploreObjectMetadata();