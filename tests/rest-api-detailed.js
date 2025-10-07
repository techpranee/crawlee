const axios = require('axios');

const TWENTY_REST_URL = 'https://20.techpranee.com/rest';
const TWENTY_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0YTU5NmViMi1iMWJjLTQyZTgtODhhOS0wYTc3YTRiZTNkM2UiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiNGE1OTZlYjItYjFiYy00MmU4LTg4YTktMGE3N2E0YmUzZDNlIiwiaWF0IjoxNzU5NjkwNzM4LCJleHAiOjQ5MTMyOTA3MzcsImp0aSI6IjE3ZDMyZmRlLTNhNDgtNGI3Ny04NWE1LTI3NGZhYzc0ZTE5YiJ9.UKk8s9LBc_zWOBbyZh_djFj2pGSmBknD1QVSNclWJ3Q';

async function testDetailedRestApi() {
    console.log('🔍 Detailed Twenty CRM REST API Testing...\n');

    try {
        // Test creating a Person with different field combinations
        console.log('=== Testing Person Creation ===');

        // Test 1: Minimal person
        console.log('1. Testing minimal person creation...');
        try {
            const minimalPerson = {
                name: {
                    firstName: 'John',
                    lastName: 'Doe'
                }
            };
            const response = await axios.post(`${TWENTY_REST_URL}/people`, minimalPerson, {
                headers: {
                    'Authorization': `Bearer ${TWENTY_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`✅ Minimal person created: ${response.status}\n`);
        } catch (error) {
            console.log(`❌ Minimal person: ${error.response?.status} - ${JSON.stringify(error.response?.data)}\n`);
        }

        // Test 2: Person with email
        console.log('2. Testing person with email...');
        try {
            const personWithEmail = {
                name: {
                    firstName: 'Jane',
                    lastName: 'Smith'
                },
                email: 'jane.smith@example.com'
            };
            const response = await axios.post(`${TWENTY_REST_URL}/people`, personWithEmail, {
                headers: {
                    'Authorization': `Bearer ${TWENTY_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`✅ Person with email created: ${response.status}\n`);
        } catch (error) {
            console.log(`❌ Person with email: ${error.response?.status} - ${JSON.stringify(error.response?.data)}\n`);
        }

        // Test 3: Person with company relation
        console.log('3. Testing person with company relation...');
        try {
            // First get existing companies
            const companiesResponse = await axios.get(`${TWENTY_REST_URL}/companies`, {
                headers: {
                    'Authorization': `Bearer ${TWENTY_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });
            const companies = companiesResponse.data?.data || [];
            console.log(`Found ${companies.length} companies`);

            if (companies.length > 0) {
                const personWithCompany = {
                    name: {
                        firstName: 'Bob',
                        lastName: 'Johnson'
                    },
                    email: 'bob.johnson@example.com',
                    companyId: companies[0].id
                };
                const response = await axios.post(`${TWENTY_REST_URL}/people`, personWithCompany, {
                    headers: {
                        'Authorization': `Bearer ${TWENTY_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                });
                console.log(`✅ Person with company created: ${response.status}\n`);
            } else {
                console.log('❌ No companies found to link person to\n');
            }
        } catch (error) {
            console.log(`❌ Person with company: ${error.response?.status} - ${JSON.stringify(error.response?.data)}\n`);
        }

        // Test creating Leads
        console.log('=== Testing Lead Creation ===');

        // Test 4: Minimal lead
        console.log('4. Testing minimal lead creation...');
        try {
            const minimalLead = {
                name: 'Test Lead',
                linkedinUrl: 'https://linkedin.com/in/testlead'
            };
            const response = await axios.post(`${TWENTY_REST_URL}/leadsLinkedinScrapings`, minimalLead, {
                headers: {
                    'Authorization': `Bearer ${TWENTY_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`✅ Minimal lead created: ${response.status}\n`);
        } catch (error) {
            console.log(`❌ Minimal lead: ${error.response?.status} - ${JSON.stringify(error.response?.data)}\n`);
        }

        // Test 5: Lead with more fields
        console.log('5. Testing lead with more fields...');
        try {
            const detailedLead = {
                name: 'Detailed Test Lead',
                linkedinUrl: 'https://linkedin.com/in/detailedtestlead',
                status: 'new',
                jobTitle: 'Software Engineer',
                companyName: 'Tech Corp'
            };
            const response = await axios.post(`${TWENTY_REST_URL}/leadsLinkedinScrapings`, detailedLead, {
                headers: {
                    'Authorization': `Bearer ${TWENTY_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`✅ Detailed lead created: ${response.status}\n`);
        } catch (error) {
            console.log(`❌ Detailed lead: ${error.response?.status} - ${JSON.stringify(error.response?.data)}\n`);
        }

        // Test 6: Check current data
        console.log('=== Checking Current Data ===');
        const [peopleRes, companiesRes, leadsRes] = await Promise.all([
            axios.get(`${TWENTY_REST_URL}/people`, { headers: { 'Authorization': `Bearer ${TWENTY_TOKEN}` } }),
            axios.get(`${TWENTY_REST_URL}/companies`, { headers: { 'Authorization': `Bearer ${TWENTY_TOKEN}` } }),
            axios.get(`${TWENTY_REST_URL}/leadsLinkedinScrapings`, { headers: { 'Authorization': `Bearer ${TWENTY_TOKEN}` } })
        ]);

        console.log(`📊 Current counts:`);
        console.log(`   People: ${peopleRes.data?.data?.length || 0}`);
        console.log(`   Companies: ${companiesRes.data?.data?.length || 0}`);
        console.log(`   Leads: ${leadsRes.data?.data?.length || 0}`);

    } catch (error) {
        console.log(`❌ Test Failed: ${error.message}`);
    }
}

testDetailedRestApi();