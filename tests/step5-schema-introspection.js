/**
 * Step 5: Schema Introspection
 * Discover the actual Twenty CRM GraphQL schema
 */

require('dotenv').config();
const { GraphQLClient, gql } = require('graphql-request');

async function introspectSchema() {
    console.log('🔍 Step 5: Schema Introspection\n');

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

    console.log('Querying GraphQL schema...\n');

    // Test basic types
    try {
        const typeQuery = gql`
      query {
        __schema {
          types {
            name
            kind
            description
          }
        }
      }
    `;
        const result = await client.request(typeQuery);
        console.log('Available types:');
        const objectTypes = result.__schema.types.filter(t => t.kind === 'OBJECT' && !t.name.startsWith('__'));
        objectTypes.slice(0, 10).forEach(type => {
            console.log(`   - ${type.name}: ${type.description || 'No description'}`);
        });
        if (objectTypes.length > 10) {
            console.log(`   ... and ${objectTypes.length - 10} more types`);
        }
    } catch (error) {
        console.log('❌ Could not get schema types:', error.message);
    }

    console.log('');

    // Test query type fields
    try {
        const queryTypeQuery = gql`
      query {
        __schema {
          queryType {
            fields {
              name
              description
              type {
                name
                kind
              }
            }
          }
        }
      }
    `;
        const result = await client.request(queryTypeQuery);
        console.log('Available query fields:');
        result.__schema.queryType.fields.slice(0, 15).forEach(field => {
            const typeName = field.type.kind === 'NON_NULL' ? field.type.ofType?.name : field.type.name;
            console.log(`   - ${field.name}: ${typeName} - ${field.description || 'No description'}`);
        });
    } catch (error) {
        console.log('❌ Could not get query fields:', error.message);
    }

    console.log('');

    // Test mutation type fields
    try {
        const mutationTypeQuery = gql`
      query {
        __schema {
          mutationType {
            fields {
              name
              description
              type {
                name
                kind
              }
            }
          }
        }
      }
    `;
        const result = await client.request(mutationTypeQuery);
        console.log('Available mutation fields:');
        if (result.__schema.mutationType?.fields) {
            result.__schema.mutationType.fields.slice(0, 10).forEach(field => {
                const typeName = field.type.kind === 'NON_NULL' ? field.type.ofType?.name : field.type.name;
                console.log(`   - ${field.name}: ${typeName} - ${field.description || 'No description'}`);
            });
        } else {
            console.log('   No mutations available');
        }
    } catch (error) {
        console.log('❌ Could not get mutation fields:', error.message);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Step 5 Complete: Schema discovered!');
    console.log('Update the service code based on the actual schema.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Run introspection
introspectSchema().catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
});
