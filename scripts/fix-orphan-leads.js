/**
 * Fix orphaned LinkedIn leads by creating campaign records
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MAIN_TENANT_ID = '68de6146e586465c343a5ed9';

async function fixOrphanLeads() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;

    // Find all campaign IDs referenced by leads
    const leadCampaignIds = await db.collection('linkedinleads').distinct('campaignId', {
      tenantId: MAIN_TENANT_ID,
    });

    console.log(`\nFound ${leadCampaignIds.length} campaign IDs in leads`);

    // Check which campaigns don't exist
    const orphanedCampaigns = [];
    for (const campaignId of leadCampaignIds) {
      const campaign = await db.collection('campaigns').findOne({
        _id: new mongoose.Types.ObjectId(campaignId),
        tenantId: MAIN_TENANT_ID,
      });

      if (!campaign) {
        // Count leads for this campaign
        const leadCount = await db.collection('linkedinleads').countDocuments({
          campaignId: campaignId,
          tenantId: MAIN_TENANT_ID,
        });

        orphanedCampaigns.push({
          campaignId,
          leadCount,
        });
      }
    }

    console.log(`\nFound ${orphanedCampaigns.length} orphaned campaigns`);

    // Create campaign records for orphaned leads
    for (const orphan of orphanedCampaigns) {
      console.log(`\nCreating campaign for ${orphan.campaignId} (${orphan.leadCount} leads)`);

      // Get a sample lead to determine the campaign name
      const sampleLead = await db.collection('linkedinleads').findOne({
        campaignId: orphan.campaignId,
        tenantId: MAIN_TENANT_ID,
      });

      const campaignName =
        orphan.leadCount === 55
          ? 'LinkedIn Hiring Posts - India (Migrated)'
          : 'LinkedIn Hiring Posts - Initial Run (Migrated)';

      const campaign = {
        _id: new mongoose.Types.ObjectId(orphan.campaignId),
        name: campaignName,
        description: `Migrated campaign with ${orphan.leadCount} hiring leads`,
        source: 'linkedin',
        tenantId: MAIN_TENANT_ID,
        auth: 'linkedin',
        strategy: 'playwright',
        mode: 'local-runner',
        output: 'database',
        status: 'done',
        maxItems: orphan.leadCount,
        stats: {
          totalLeads: orphan.leadCount,
          totalRequests: orphan.leadCount,
          contactsCreated: 0,
          contactsUpdated: 0,
          companiesCreated: 0,
          errors: [],
        },
        query: {
          roles: 'hiring',
          period: 'past week',
          limit: orphan.leadCount,
          location: orphan.leadCount === 55 ? 'India' : 'Global',
        },
        createdAt: sampleLead.createdAt || new Date(),
        updatedAt: new Date(),
      };

      await db.collection('campaigns').insertOne(campaign);
      console.log(`✓ Created campaign: ${campaignName}`);
    }

    console.log('\n✅ All orphaned campaigns fixed!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

fixOrphanLeads();
