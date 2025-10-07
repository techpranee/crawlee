// services/twentySync.js
// Comprehensive sync logic for your custom LinkedIn LeadGen system to Twenty CRM
// Steps:
// 1. Create or find Person (unique by LinkedIn profile URL)
// 2. Create or find Company (unique by name)
// 3. Link Person to Company
// 4. Create a custom Lead record under 'LinkedIn Scrapings'

import { GraphQLClient, gql } from "graphql-request";

// Configure Twenty GraphQL client
const client = new GraphQLClient("https://app.20.techpranee.com/api/graphql", {
    headers: {
        Authorization: "Bearer YOUR_TWENTY_API_KEY",
    },
});

// ---------------------------
// GraphQL Queries and Mutations
// ---------------------------
const FIND_PERSON_BY_LINKEDIN = gql`
  query FindPerson($linkedin: String!) {
    persons(where: { linkedinUrl: { equals: $linkedin } }) {
      id
      name
      linkedinUrl
      company {
        id
        name
      }
    }
  }
`;

const CREATE_PERSON = gql`
  mutation CreatePerson($data: PersonCreateInput!) {
    createPerson(data: $data) {
      id
      name
      linkedinUrl
    }
  }
`;

const FIND_COMPANY = gql`
  query FindCompany($name: String!) {
    companies(where: { name: { equals: $name } }) {
      id
      name
    }
  }
`;

const CREATE_COMPANY = gql`
  mutation CreateCompany($data: CompanyCreateInput!) {
    createCompany(data: $data) {
      id
      name
    }
  }
`;

const CREATE_LEAD = gql`
  mutation CreateLead($data: LeadCreateInput!) {
    createLead(data: $data) {
      id
      title
      status
      source
    }
  }
`;

// ---------------------------
// Core Sync Logic
// ---------------------------
export async function syncLinkedInLead({ name, linkedinUrl, companyName, title, source = "LinkedIn Scrapings" }) {
    try {
        // 1️⃣ Find or create Company
        let companyId;
        if (companyName) {
            const { companies } = await client.request(FIND_COMPANY, { name: companyName });
            if (companies?.length) {
                companyId = companies[0].id;
            } else {
                const newCompany = await client.request(CREATE_COMPANY, {
                    data: { name: companyName },
                });
                companyId = newCompany.createCompany.id;
            }
        }

        // 2️⃣ Find or create Person (unique by LinkedIn URL)
        let personId;
        const { persons } = await client.request(FIND_PERSON_BY_LINKEDIN, { linkedin: linkedinUrl });
        if (persons?.length) {
            personId = persons[0].id;
        } else {
            const newPerson = await client.request(CREATE_PERSON, {
                data: {
                    name,
                    linkedinUrl,
                    company: companyId ? { connect: { id: companyId } } : undefined,
                },
            });
            personId = newPerson.createPerson.id;
        }

        // 3️⃣ Create custom Lead entry under 'LinkedIn Scrapings'
        const leadRes = await client.request(CREATE_LEAD, {
            data: {
                title: title || `${name} via LinkedIn`,
                source,
                status: "New",
                person: { connect: { id: personId } },
                company: companyId ? { connect: { id: companyId } } : undefined,
                customFields: {
                    create: [
                        {
                            key: "LinkedIn URL",
                            value: linkedinUrl,
                        },
                    ],
                },
            },
        });

        console.log(`✅ Synced lead for ${name} (${linkedinUrl}) →`, leadRes.createLead.id);
    } catch (error) {
        console.error("❌ Error syncing LinkedIn lead:", error.message);
    }
}

// ---------------------------
// Example usage
// ---------------------------
(async () => {
    await syncLinkedInLead({
        name: "Ravi Kumar",
        linkedinUrl: "https://www.linkedin.com/in/ravi-kumar",
        companyName: "Techpranee Pvt Ltd",
        title: "ERP Inquiry",
    });
})();
