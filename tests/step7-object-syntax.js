/**
 * Step 7: Explore Correct Object Query Syntax
 * Find the correct syntax for querying objects
 */

require('dotenv').config();
const { GraphQLClient, gql } = require('graphql-request');

async function exploreObjectSyntax() {
    console.log('🔍 Step 7: Exploring Correct Object Query Syntax\n');

    const apiKey = process.env.TWENTY_API_KEY;
    if (!apiKey) {
        console.error('❌ TWENTY_API_KEY not set');
        process.exit(1);
    }

    const client = new GraphQLClient('https://hyrefast.20.techpranee.com/graphql', {
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
    });

    // Test different object query syntaxes
    const queries = [
        {
            name: 'Simple objects query',
            query: gql`
        query {
          objects {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      `
        },
        {
            name: 'Objects with filter',
            query: gql`
        query {
          objects(filter: {}) {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      `
        },
        {
            name: 'Objects with take',
            query: gql`
        query {
          objects(take: 5) {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      `
        },
        {
            name: 'Single object query',
            query: gql`
        query {
          object(id: "some-id") {
            id
            name
          }
        }
      `
        }
    ];

    for (const { name, query } of queries) {
        console.log(`Testing: ${name}`);
        try {
            const result = await client.request(query);
            console.log('   ✅ SUCCESS');
            console.log(`   Result keys: ${Object.keys(result).join(', ')}`);
            if (result.objects) {
                console.log(`   Objects structure: ${JSON.stringify(result.objects, null, 2).substring(0, 200)}...`);
            }
        } catch (error) {
            console.log(`   ❌ FAILED: ${error.message}`);
        }
        console.log('');
    }

    // Test createOneObject with different syntaxes
    console.log('Testing object creation syntaxes...\n');

    const createQueries = [
        {
            name: 'Create with input object',
            query: gql`
        mutation CreateObject($input: CreateOneObjectInput!) {
          createOneObject(input: $input) {
            id
            name
          }
        }
      `,
            variables: {
                input: {
                    name: "Test Person",
                    data: { linkedinUrl: "https://test.com" }
                }
            }
        },
        {
            name: 'Create with direct params',
            query: gql`
        mutation {
          createOneObject(
            name: "Test Person"
            data: { linkedinUrl: "https://test.com" }
          ) {
            id
            name
          }
        }
      `
        }
    ];

    for (const { name, query, variables } of createQueries) {
        console.log(`Testing: ${name}`);
        try {
            const result = await client.request(query, variables);
            console.log('   ✅ SUCCESS');
            console.log(`   Created: ${JSON.stringify(result, null, 2)}`);
        } catch (error) {
            console.log(`   ❌ FAILED: ${error.message}`);
        }
        console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Step 7 Complete');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Run exploration
exploreObjectSyntax().catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
});
