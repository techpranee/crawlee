const axios = require('axios');

const TWENTY_REST_URL = 'https://20.techpranee.com/rest';
const TWENTY_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0YTU5NmViMi1iMWJjLTQyZTgtODhhOS0wYTc3YTRiZTNkM2UiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiNGE1OTZlYjItYjFiYy00MmU4LTg4YTktMGE3N2E0YmUzZDNlIiwiaWF0IjoxNzU5NjkwNzM4LCJleHAiOjQ5MTMyOTA3MzcsImp0aSI6IjE3ZDMyZmRlLTNhNDgtNGI3Ny04NWE1LTI3NGZhYzc0ZTE5YiJ9.UKk8s9LBc_zWOBbyZh_djFj2pGSmBknD1QVSNclWJ3Q';

async function testRestApi() {
    console.log('🔍 Testing Twenty CRM REST API...\n');

    try {
        // Test 1: Get People
        console.log('1. Testing GET /people...');
        const peopleResponse = await axios.get(`${TWENTY_REST_URL}/people`, {
            headers: {
                'Authorization': `Bearer ${TWENTY_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`✅ GET /people: ${peopleResponse.status} - Found ${peopleResponse.data?.data?.length || 0} people\n`);

        // Test 2: Get Companies
        console.log('2. Testing GET /companies...');
        const companiesResponse = await axios.get(`${TWENTY_REST_URL}/companies`, {
            headers: {
                'Authorization': `Bearer ${TWENTY_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`✅ GET /companies: ${companiesResponse.status} - Found ${companiesResponse.data?.data?.length || 0} companies\n`);

        // Test 3: Get Leads
        console.log('3. Testing GET /leadsLinkedinScrapings...');
        const leadsResponse = await axios.get(`${TWENTY_REST_URL}/leadsLinkedinScrapings`, {
            headers: {
                'Authorization': `Bearer ${TWENTY_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`✅ GET /leadsLinkedinScrapings: ${leadsResponse.status} - Found ${leadsResponse.data?.data?.length || 0} leads\n`);

        // Test 4: Try to create a Person
        console.log('4. Testing POST /people (create person)...');
        const testPerson = {
            name: {
                firstName: 'Test',
                lastName: 'User'
            },
            email: 'test@example.com'
        };

        try {
            const createPersonResponse = await axios.post(`${TWENTY_REST_URL}/people`, testPerson, {
                headers: {
                    'Authorization': `Bearer ${TWENTY_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`✅ POST /people: ${createPersonResponse.status} - Created person successfully\n`);
        } catch (error) {
            console.log(`❌ POST /people: ${error.response?.status} - ${error.response?.data?.message || error.message}\n`);
        }

        // Test 5: Try to create a Company
        console.log('5. Testing POST /companies (create company)...');
        const testCompany = {
            name: 'Test Company Inc',
            domainName: 'testcompany.com'
        };

        try {
            const createCompanyResponse = await axios.post(`${TWENTY_REST_URL}/companies`, testCompany, {
                headers: {
                    'Authorization': `Bearer ${TWENTY_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`✅ POST /companies: ${createCompanyResponse.status} - Created company successfully\n`);
        } catch (error) {
            console.log(`❌ POST /companies: ${error.response?.status} - ${error.response?.data?.message || error.message}\n`);
        }

        // Test 6: Try to create a Lead
        console.log('6. Testing POST /leadsLinkedinScrapings (create lead)...');
        const testLead = {
            name: 'Test Lead',
            linkedinUrl: 'https://linkedin.com/in/testlead',
            status: 'new'
        };

        try {
            const createLeadResponse = await axios.post(`${TWENTY_REST_URL}/leadsLinkedinScrapings`, testLead, {
                headers: {
                    'Authorization': `Bearer ${TWENTY_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`✅ POST /leadsLinkedinScrapings: ${createLeadResponse.status} - Created lead successfully\n`);
        } catch (error) {
            console.log(`❌ POST /leadsLinkedinScrapings: ${error.response?.status} - ${error.response?.data?.message || error.message}\n`);
        }

    } catch (error) {
        console.log(`❌ REST API Test Failed: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
    }
}

testRestApi();