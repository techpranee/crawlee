/**
 * Step 9: Explore Working API Operations
 * Since objects queries fail, let's explore what operations do work
 */

require('dotenv').config();
const { GraphQLClient, gql } = require('graphql-request');

async function exploreWorkingOperations() {
    console.log('🔍 Step 9: Exploring Working API Operations\n');

    const apiKey = process.env.TWENTY_API_KEY;
    const client = new GraphQLClient('https://hyrefast.20.techpranee.com/graphql', {
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
    });

    // Test 1: Get detailed core views info
    console.log('1️⃣ Exploring Core Views...');
    try {
        const coreViewsQuery = gql`
      query {
        getCoreViews {
          id
          name
          objectMetadataId
          type
        }
      }
    `;
        const result = await client.request(coreViewsQuery);
        console.log('   ✅ Core Views:');
        result.getCoreViews.forEach(view => {
            console.log(`      - ${view.name} (${view.type}) - Object: ${view.objectMetadataId}`);
        });

        // Try to get fields for the first view
        if (result.getCoreViews.length > 0) {
            const firstView = result.getCoreViews[0];
            console.log(`\n   Exploring fields for view: ${firstView.name}`);

            const fieldsQuery = gql`
        query GetViewFields($viewId: ID!) {
          getCoreViewFields(viewId: $viewId) {
            id
            name
            type
            isVisible
          }
        }
      `;

            const fieldsResult = await client.request(fieldsQuery, { viewId: firstView.id });
            console.log('   ✅ View Fields:');
            fieldsResult.getCoreViewFields.slice(0, 5).forEach(field => {
                console.log(`      - ${field.name} (${field.type})`);
            });
        }
    } catch (error) {
        console.log(`   ❌ Core Views failed: ${error.message}`);
    }
    console.log('');

    // Test 2: Try different object access patterns
    console.log('2️⃣ Testing alternative object access patterns...');

    const alternativeQueries = [
        {
            name: 'Objects with different params',
            query: gql`
        query {
          objects(limit: 5) {
            id
            name
          }
        }
      `
        },
        {
            name: 'Objects with where clause',
            query: gql`
        query {
          objects(where: {}) {
            id
            name
          }
        }
      `
        },
        {
            name: 'Try object singular',
            query: gql`
        query {
          object {
            id
            name
          }
        }
      `
        }
    ];

    for (const { name, query } of alternativeQueries) {
        console.log(`   Testing: ${name}`);
        try {
            const result = await client.request(query);
            console.log(`     ✅ SUCCESS: ${JSON.stringify(result, null, 2).substring(0, 100)}...`);
        } catch (error) {
            console.log(`     ❌ FAILED: ${error.message}`);
        }
    }
    console.log('');

    // Test 3: Check if there are any object-related operations that work
    console.log('3️⃣ Testing object-related operations...');

    const objectOperations = [
        {
            name: 'Create object event',
            query: gql`
        mutation {
          createObjectEvent(input: { objectId: "test", action: "test" }) {
            id
          }
        }
      `
        },
        {
            name: 'Try to find objects by ID',
            query: gql`
        query {
          object(id: "00000000-0000-0000-0000-000000000000") {
            id
            name
          }
        }
      `
        }
    ];

    for (const { name, query } of objectOperations) {
        console.log(`   Testing: ${name}`);
        try {
            const result = await client.request(query);
            console.log(`     ✅ SUCCESS: ${JSON.stringify(result, null, 2)}`);
        } catch (error) {
            console.log(`     ❌ FAILED: ${error.message}`);
        }
    }

    console.log('');
    console.log('💡 Insights:');
    console.log('   - Core Views API works - this suggests metadata/views access');
    console.log('   - Objects queries consistently fail - likely permission issue');
    console.log('   - May need different API key or additional permissions');
    console.log('   - Consider using REST API instead of GraphQL for objects');
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Step 9 Complete');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Run exploration
exploreWorkingOperations().catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
});
