import mongoose from 'mongoose';
import { getTwentyCrmServiceForTenant } from '../src/services/twentyCrm';
import { logger } from '../src/utils/logger';
import { LinkedInLeadModel, LinkedInLeadDocument } from '../src/db/models/LinkedInLead';
import { CampaignModel, CampaignDocument } from '../src/db/models/Campaign';

async function syncCampaignLeadsToCRM() {
    const campaignId = '68e25e8a202a8705d0c77dc4';

    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost:27017/crawlee');
        logger.info('Connected to MongoDB');

        // Find the campaign
        const campaign = await CampaignModel.findById(campaignId);
        if (!campaign) {
            throw new Error(`Campaign with ID ${campaignId} not found`);
        }

        logger.info(`Found campaign: ${campaign.name} (tenant: ${campaign.tenantId})`);

        // Get all leads for this campaign
        const leads = await LinkedInLeadModel.find({ campaignId });
        logger.info(`Found ${leads.length} leads to sync`);

        if (leads.length === 0) {
            logger.info('No leads to sync');
            return;
        }

        // Initialize Twenty CRM service for this tenant
        const crmService = await getTwentyCrmServiceForTenant(campaign.tenantId);

        // Get initial counts
        const initialDetails = await crmService.getDataDetails();
        const initialCounts = {
            people: initialDetails.people.length,
            companies: initialDetails.companies.length,
            leads: initialDetails.leads.length
        };
        logger.info(`Initial CRM counts: ${initialCounts.people} people, ${initialCounts.companies} companies, ${initialCounts.leads} leads`);

        // Convert leads to the format expected by CRM service
        const crmLeads = leads.map((lead: LinkedInLeadDocument) => {
            // Clean up the author name - extract just the first line (actual name)
            const cleanName = lead.authorName?.split('\n')[0]?.trim() || 'Unknown';

            return {
                name: cleanName,
                linkedinUrl: lead.authorProfile || `https://linkedin.com/in/${cleanName.toLowerCase().replace(/\s+/g, '')}`,
                companyName: lead.company || undefined,
                title: (lead.jobTitles?.[0] || lead.authorHeadline?.split('\n')[0]) || undefined,
                location: lead.locations?.[0] || undefined,
                postUrl: lead.postUrl || undefined,
                postTitle: lead.postTitle || undefined,
                companyUrl: lead.companyUrl || undefined,
                companyIndustry: lead.companyIndustry || undefined,
                postedAt: lead.postedAt || undefined,
                authorHeadline: lead.authorHeadline?.split('\n')[0] || undefined,
                jobTitles: lead.jobTitles || undefined,
                locations: lead.locations || undefined,
                seniority: lead.seniority || undefined,
                skills: lead.skills || undefined,
                salaryRange: lead.salaryRange || undefined,
                enrichmentStatus: lead.enrichmentStatus || undefined,
                status: lead.status || undefined,
                tags: lead.tags || undefined,
            };
        });

        logger.info(`Starting sync of ${crmLeads.length} leads to Twenty CRM...`);

        // Sync all leads
        const result = await crmService.syncLinkedInLeads(crmLeads, campaign.tenantId);

        // Get final counts
        const finalDetails = await crmService.getDataDetails();
        const finalCounts = {
            people: finalDetails.people.length,
            companies: finalDetails.companies.length,
            leads: finalDetails.leads.length
        };
        logger.info(`Final CRM counts: ${finalCounts.people} people, ${finalCounts.companies} companies, ${finalCounts.leads} leads`);

        // Summary
        logger.info('=== SYNC SUMMARY ===');
        logger.info(`Campaign: ${campaign.name}`);
        logger.info(`Total leads processed: ${leads.length}`);
        logger.info(`Successful syncs: ${result.successful}`);
        logger.info(`Failed syncs: ${result.failed}`);
        logger.info(`Leads created: ${finalCounts.leads - initialCounts.leads}`);

        if (result.errors.length > 0) {
            logger.warn('=== SYNC ERRORS ===');
            result.errors.forEach((error, index) => {
                logger.warn(`${index + 1}. ${error.lead.name}: ${error.error}`);
            });
        }

        logger.info('✅ Campaign sync completed!');

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`❌ Campaign sync failed: ${errorMessage}`);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        logger.info('Disconnected from MongoDB');
    }
}

// Set the API key (fallback for backward compatibility)
process.env.TWENTY_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0YTU5NmViMi1iMWJjLTQyZTgtODhhOS0wYTc3YTRiZTNkM2UiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiNGE1OTZlYjItYjFiYy00MmU4LTg4YTktMGE3N2E0YmUzZDNlIiwiaWF0IjoxNzU5NjkwNzM4LCJleHAiOjQ5MTMyOTA3MzcsImp0aSI6IjE3ZDMyZmRlLTNhNDgtNGI3Ny04NWE1LTI3NGZhYzc0ZTE5YiJ9.UKk8s9LBc_zWOBbyZh_djFj2pGSmBknD1QVSNclWJ3Q';

syncCampaignLeadsToCRM();