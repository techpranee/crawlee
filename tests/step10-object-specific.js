/**
 * Step 10: Test Object-Specific Queries
 * Try to query specific objects using the metadata IDs discovered
 */

require('dotenv').config();
const { GraphQLClient, gql } = require('graphql-request');

async function testObjectSpecificQueries() {
    console.log('🎯 Step 10: Testing Object-Specific Queries\n');

    const apiKey = process.env.TWENTY_API_KEY;
    const client = new GraphQLClient('https://hyrefast.20.techpranee.com/graphql', {
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
    });

    // Object metadata IDs from the views
    const objectIds = {
        people: 'e5880032-7bb1-4ce7-a9f4-544f4e410163',
        companies: '1902e293-a004-4cc6-a111-9390231c4955',
        leads: '3ace724d-3975-4602-9430-9728b28a2507',
    };

    // Test 1: Try querying by object metadata ID
    console.log('1️⃣ Testing queries by object metadata ID...');

    for (const [name, objectId] of Object.entries(objectIds)) {
        console.log(`   Testing ${name} (ID: ${objectId})...`);

        const queries = [
            {
                name: 'objects with objectMetadataId',
                query: gql`
          query GetObjects($objectId: ID!) {
            objects(objectMetadataId: $objectId) {
              edges {
                node {
                  id
                  name
                  data
                }
              }
            }
          }
        `,
                variables: { objectId }
            },
            {
                name: 'objects with filter',
                query: gql`
          query GetObjects($objectId: ID!) {
            objects(filter: { objectMetadataId: { eq: $objectId } }) {
              edges {
                node {
                  id
                  name
                  data
                }
              }
            }
          }
        `,
                variables: { objectId }
            }
        ];

        for (const { name: queryName, query, variables } of queries) {
            try {
                const result = await client.request(query, variables);
                console.log(`     ✅ ${queryName}: Found ${result.objects?.edges?.length || 0} ${name}`);
                if (result.objects?.edges?.length > 0) {
                    console.log(`        Sample: ${result.objects.edges[0].node.name}`);
                }
            } catch (error) {
                console.log(`     ❌ ${queryName}: ${error.message}`);
            }
        }
        console.log('');
    }

    // Test 2: Try createOneObject with objectMetadataId
    console.log('2️⃣ Testing object creation with metadata ID...');

    try {
        const createQuery = gql`
      mutation CreateObject($objectMetadataId: ID!) {
        createOneObject(
          objectMetadataId: $objectMetadataId
          data: {
            name: "Test Lead from LinkedIn"
            linkedinUrl: "https://linkedin.com/in/test"
            source: "LinkedIn Scrapings"
          }
        ) {
          id
          name
          data
        }
      }
    `;

        const result = await client.request(createQuery, { objectMetadataId: objectIds.leads });
        console.log('   ✅ Object creation successful!');
        console.log(`   Created: ${result.createOneObject.name} (${result.createOneObject.id})`);
    } catch (error) {
        console.log(`   ❌ Object creation failed: ${error.message}`);
    }

    console.log('');
    console.log('📋 Summary:');
    console.log('   - Discovered object metadata IDs for People, Companies, and Leads');
    console.log('   - All object queries still failing with 400 errors');
    console.log('   - API key may need additional permissions or scopes');
    console.log('');
    console.log('🔧 Next Steps:');
    console.log('   1. Contact Twenty CRM support about API permissions');
    console.log('   2. Check if API key needs specific scopes for object access');
    console.log('   3. Consider using REST API endpoints instead');
    console.log('   4. Verify API key is configured correctly in Twenty CRM admin');
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Step 10 Complete - Investigation Complete');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Run test
testObjectSpecificQueries().catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
});
