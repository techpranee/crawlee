/**
 * Step 6: Generic Object API Exploration
 * Explore how Twenty CRM's generic object API works
 */

require('dotenv').config();
const { GraphQLClient, gql } = require('graphql-request');

async function exploreGenericAPI() {
    console.log('🔍 Step 6: Generic Object API Exploration\n');

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

    // Test 1: Try to get objects
    console.log('1️⃣ Testing generic object queries...');
    try {
        const objectsQuery = gql`
      query {
        objects {
          id
          name
          __typename
        }
      }
    `;
        const result = await client.request(objectsQuery);
        console.log('   ✅ Objects query works');
        console.log(`   Found ${result.objects?.length || 0} objects`);
        if (result.objects?.length > 0) {
            console.log('   Sample objects:');
            result.objects.slice(0, 3).forEach(obj => {
                console.log(`      - ${obj.name} (${obj.__typename})`);
            });
        }
    } catch (error) {
        console.log('   ❌ Objects query failed:', error.message);
    }

    console.log('');

    // Test 2: Try to find person objects
    console.log('2️⃣ Testing person object queries...');
    try {
        const personQuery = gql`
      query {
        objects(filter: { __typename: { eq: "person" } }) {
          id
          name
          data
          __typename
        }
      }
    `;
        const result = await client.request(personQuery);
        console.log('   ✅ Person objects query works');
        console.log(`   Found ${result.objects?.length || 0} person objects`);
    } catch (error) {
        console.log('   ❌ Person objects query failed:', error.message);
    }

    console.log('');

    // Test 3: Try to find company objects
    console.log('3️⃣ Testing company object queries...');
    try {
        const companyQuery = gql`
      query {
        objects(filter: { __typename: { eq: "company" } }) {
          id
          name
          data
          __typename
        }
      }
    `;
        const result = await client.request(companyQuery);
        console.log('   ✅ Company objects query works');
        console.log(`   Found ${result.objects?.length || 0} company objects`);
    } catch (error) {
        console.log('   ❌ Company objects query failed:', error.message);
    }

    console.log('');

    // Test 4: Try to find lead/opportunity objects
    console.log('4️⃣ Testing lead/opportunity object queries...');
    try {
        const leadQuery = gql`
      query {
        objects(filter: { __typename: { in: ["lead", "opportunity", "deal"] } }) {
          id
          name
          data
          __typename
        }
      }
    `;
        const result = await client.request(leadQuery);
        console.log('   ✅ Lead/Opportunity objects query works');
        console.log(`   Found ${result.objects?.length || 0} lead/opportunity objects`);
    } catch (error) {
        console.log('   ❌ Lead/Opportunity objects query failed:', error.message);
    }

    console.log('');

    // Test 5: Try createOneObject mutation
    console.log('5️⃣ Testing object creation...');
    try {
        const createQuery = gql`
      mutation {
        createOneObject(
          input: {
            __typename: "person"
            name: "Test Person"
            data: {
              linkedinUrl: "https://test.com"
            }
          }
        ) {
          id
          name
          __typename
        }
      }
    `;
        const result = await client.request(createQuery);
        console.log('   ✅ Object creation works');
        console.log(`   Created: ${result.createOneObject.name} (${result.createOneObject.id})`);
    } catch (error) {
        console.log('   ❌ Object creation failed:', error.message);
        console.log('   This is expected if API key lacks write permissions');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Step 6 Complete: Generic API explored!');
    console.log('Twenty CRM uses a generic object system.');
    console.log('Need to update service to use createOneObject, etc.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Run exploration
exploreGenericAPI().catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
});
