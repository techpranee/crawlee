import axios from 'axios';
import { config } from 'dotenv';
import { logger } from '../src/utils/logger';

config();

const client = axios.create({
    baseURL: 'https://20.techpranee.com/rest',
    headers: {
        'Authorization': `Bearer ${process.env.TWENTY_API_KEY}`,
        'Content-Type': 'application/json'
    }
});

async function cleanupCRM() {
    try {
        // Get all leads
        const leadsResp = await client.get('/leadsLinkedinScrapings');
        const leads = leadsResp.data.data.leadsLinkedinScrapings || [];
        logger.info(`Found ${leads.length} leads to delete`);

        // Delete all leads
        for (const lead of leads) {
            try {
                await client.delete(`/leadsLinkedinScrapings/${lead.id}`);
                logger.info(`✅ Deleted lead: ${lead.name || lead.id}`);
            } catch (error: any) {
                logger.error(`❌ Failed to delete lead ${lead.id}: ${error.message}`);
            }
        }

        // Get all people
        const peopleResp = await client.get('/people');
        const people = peopleResp.data.data.people || [];
        logger.info(`\nFound ${people.length} people to delete`);

        // Delete all people (created by our sync)
        for (const person of people) {
            if (person.createdBy?.name === 'Lead Sync - Crawlee') {
                try {
                    await client.delete(`/people/${person.id}`);
                    logger.info(`✅ Deleted person: ${person.name?.firstName} ${person.name?.lastName}`);
                } catch (error: any) {
                    logger.error(`❌ Failed to delete person ${person.id}: ${error.message}`);
                }
            }
        }

        // Get all companies
        const companiesResp = await client.get('/companies');
        const companies = companiesResp.data.data.companies || [];
        logger.info(`\nFound ${companies.length} companies to delete`);

        // Delete all companies (created by our sync)
        for (const company of companies) {
            if (company.createdBy?.name === 'Lead Sync - Crawlee' || company.name.startsWith('Test Company')) {
                try {
                    await client.delete(`/companies/${company.id}`);
                    logger.info(`✅ Deleted company: ${company.name}`);
                } catch (error: any) {
                    logger.error(`❌ Failed to delete company ${company.id}: ${error.message}`);
                }
            }
        }

        logger.info('\n✅ Cleanup complete!');
    } catch (error: any) {
        logger.error('Error during cleanup:', error.message);
    }
}

// Set the API key
process.env.TWENTY_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0YTU5NmViMi1iMWJjLTQyZTgtODhhOS0wYTc3YTRiZTNkM2UiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiNGE1OTZlYjItYjFiYy00MmU4LTg4YTktMGE3N2E0YmUzZDNlIiwiaWF0IjoxNzU5NjkwNzM4LCJleHAiOjQ5MTMyOTA3MzcsImp0aSI6IjE3ZDMyZmRlLTNhNDgtNGI3Ny04NWE1LTI3NGZhYzc0ZTE5YiJ9.UKk8s9LBc_zWOBbyZh_djFj2pGSmBknD1QVSNclWJ3Q';

cleanupCRM();
