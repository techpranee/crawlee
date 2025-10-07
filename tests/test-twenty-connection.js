/**
 * Test Twenty CRM Connection
 * Step 1: Test basic connection and health check
 */

require('dotenv').config();
const { GraphQLClient, gql } = require('graphql-request');

async function testTwentyCrmConnection() {
    console.log('🧪 Testing Twenty CRM Connection\n');

    const apiKey = process.env.TWENTY_API_KEY;
    if (!apiKey) {
        console.error('❌ TWENTY_API_KEY environment variable is not set');
        console.log('Please add TWENTY_API_KEY=your_api_key to your .env file');
        process.exit(1);
    }

    console.log('📋 Configuration:');
    console.log(`   URL: https://app.20.techpranee.com/api/graphql`);
    console.log(`   API Key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 5)}\n`);

    const client = new GraphQLClient('https://app.20.techpranee.com/api/graphql', {
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
    });

    // Test 1: Basic health check
    console.log('1️⃣ Testing basic connection...');
    try {
        const testQuery = gql`
      query {
        persons(take: 1) {
          id
          name
        }
      }
    `;
        const result = await client.request(testQuery);
        console.log('   ✅ Connection successful');
        console.log(`   Found ${result.persons?.length || 0} persons in CRM\n`);
    } catch (error) {
        console.error('   ❌ Connection failed:', error.message);
        console.log('\nTroubleshooting:');
        console.log('   - Check if TWENTY_API_KEY is correct');
        console.log('   - Verify API key has proper permissions');
        console.log('   - Check network connectivity\n');
        process.exit(1);
    }

    // Test 2: Test GraphQL schema
    console.log('2️⃣ Testing GraphQL schema...');
    try {
        // Test person creation query structure
        const schemaQuery = gql`
      query Introspection {
        __schema {
          types {
            name
            kind
            fields {
              name
            }
          }
        }
      }
    `;
        await client.request(schemaQuery);
        console.log('   ✅ GraphQL schema accessible\n');
    } catch (error) {
        console.log('   ⚠️ Schema introspection failed, but this might be expected');
        console.log('   Continuing with basic operations...\n');
    }

    // Test 3: Test our specific queries
    console.log('3️⃣ Testing our GraphQL queries...');

    // Test FIND_PERSON_BY_LINKEDIN
    try {
        const findPersonQuery = gql`
      query FindPerson($linkedin: String!) {
        persons(where: { linkedinUrl: { equals: $linkedin } }) {
          id
          name
          linkedinUrl
        }
      }
    `;
        const result = await client.request(findPersonQuery, { linkedin: 'https://test-url.com' });
        console.log('   ✅ Person lookup query works');
    } catch (error) {
        console.log('   ❌ Person lookup query failed:', error.message);
    }

    // Test FIND_COMPANY
    try {
        const findCompanyQuery = gql`
      query FindCompany($name: String!) {
        companies(where: { name: { equals: $name } }) {
          id
          name
        }
      }
    `;
        const result = await client.request(findCompanyQuery, { name: 'Test Company' });
        console.log('   ✅ Company lookup query works');
    } catch (error) {
        console.log('   ❌ Company lookup query failed:', error.message);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Step 1 Complete: Twenty CRM connection is working!');
    console.log('Next: Implement the core TwentyCrmService class');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Run test
testTwentyCrmConnection().catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
});
