require('dotenv').config();

const API_URL = process.env.API_URL || 'http://localhost:3011';
const BASIC_AUTH_USER = 'techpranee';
const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS || 'password';

const auth = Buffer.from(`${BASIC_AUTH_USER}:${BASIC_AUTH_PASS}`).toString('base64');

const campaignData = {
    name: 'India Manufacturing Companies (1000+ employees)',
    description: 'Manufacturing companies in India with 1000+ employees from LinkedIn search',
    searchUrl: 'https://www.linkedin.com/search/results/companies/?companyHqGeo=%5B%22102713980%22%5D&companySize=%5B%22D%22%5D&keywords=Manufacture&origin=FACETED_SEARCH',
    limit: 4900
};

async function createCampaign() {
    try {
        console.log('\n🚀 Creating LinkedIn Company Campaign...\n');
        console.log('Campaign Details:');
        console.log(`   Name: ${campaignData.name}`);
        console.log(`   URL: ${campaignData.searchUrl}`);
        console.log(`   Target: ${campaignData.limit} companies\n`);

        const response = await fetch(`${API_URL}/api/linkedin/companies/campaigns`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(campaignData)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`API Error (${response.status}): ${error}`);
        }

        const result = await response.json();

        console.log('✅ Campaign created successfully!\n');
        console.log('📋 Campaign Info:');
        console.log(`   ID: ${result.campaign.id}`);
        console.log(`   Name: ${result.campaign.name}`);
        console.log(`   Status: ${result.campaign.status}`);
        console.log(`   Max Items: ${result.campaign.maxItems}\n`);

        console.log('🎯 Next Steps:');
        console.log(`   ${result.instructions.message}`);
        console.log(`   ${result.instructions.command}\n`);

        return result;
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

createCampaign();
