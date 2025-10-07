/**
 * Migrate LinkedIn leads from test tenants to main tenant
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MAIN_TENANT_ID = '68de6146e586465c343a5ed9'; // Development Tenant

async function migrateLeads() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✓ Connected to MongoDB\n');

    // Get test tenant campaigns with leads
    const testTenantCampaigns = [
      'perf-test-india-20251003-235223',
      'perf-test-20251003-225543'
    ];

    console.log('📦 Migrating campaigns and leads to main tenant...\n');

    for (const testTenantId of testTenantCampaigns) {
      // Get campaigns for this test tenant
      const campaigns = await mongoose.connection.db.collection('campaigns')
        .find({ tenantId: testTenantId })
        .toArray();

      console.log(`\n🔄 Processing tenant: ${testTenantId}`);
      console.log(`   Found ${campaigns.length} campaign(s)`);

      for (const campaign of campaigns) {
        const leadCount = await mongoose.connection.db.collection('linkedinleads')
          .countDocuments({ tenantId: testTenantId, campaignId: campaign._id });

        if (leadCount === 0) {
          console.log(`   ⚠️  Campaign "${campaign.name}" has no leads, skipping...`);
          continue;
        }

        console.log(`\n   📋 Campaign: ${campaign.name}`);
        console.log(`      Leads: ${leadCount}`);
        console.log(`      Status: ${campaign.status}`);

        // Update campaign tenant ID
        await mongoose.connection.db.collection('campaigns').updateOne(
          { _id: campaign._id },
          {
            $set: {
              tenantId: MAIN_TENANT_ID,
              status: 'completed' // Ensure it's marked as completed
            }
          }
        );
        console.log(`      ✅ Campaign migrated to main tenant`);

        // Update all leads for this campaign (one by one to handle duplicates)
        const leadsToMigrate = await mongoose.connection.db.collection('linkedinleads')
          .find({
            tenantId: testTenantId,
            campaignId: campaign._id
          })
          .toArray();

        let migrated = 0;
        let skipped = 0;

        for (const lead of leadsToMigrate) {
          try {
            // Check if lead already exists in main tenant
            const existing = await mongoose.connection.db.collection('linkedinleads')
              .findOne({
                tenantId: MAIN_TENANT_ID,
                linkedInId: lead.linkedInId
              });

            if (existing) {
              skipped++;
              continue;
            }

            // Update the lead
            await mongoose.connection.db.collection('linkedinleads').updateOne(
              { _id: lead._id },
              { $set: { tenantId: MAIN_TENANT_ID } }
            );
            migrated++;
          } catch (err) {
            console.log(`      ⚠️  Skipping duplicate lead: ${lead.linkedInId}`);
            skipped++;
          }
        }

        console.log(`      ✅ ${migrated} leads migrated`);
        if (skipped > 0) {
          console.log(`      ⚠️  ${skipped} leads skipped (duplicates)`);
        }
      }
    }

    // Summary
    console.log('\n\n📊 Final Summary:');
    const mainTenantCampaigns = await mongoose.connection.db.collection('campaigns')
      .find({ tenantId: MAIN_TENANT_ID })
      .toArray();

    const linkedInCampaigns = mainTenantCampaigns.filter(c =>
      c.name.toLowerCase().includes('hiring')
    );

    console.log(`\nMain Tenant (${MAIN_TENANT_ID}):`);
    console.log(`  Total campaigns: ${mainTenantCampaigns.length}`);
    console.log(`  LinkedIn hiring campaigns: ${linkedInCampaigns.length}`);

    for (const campaign of linkedInCampaigns) {
      const leadCount = await mongoose.connection.db.collection('linkedinleads')
        .countDocuments({ tenantId: MAIN_TENANT_ID, campaignId: campaign._id });

      if (leadCount > 0) {
        console.log(`    - ${campaign.name}: ${leadCount} leads (${campaign.status})`);
      }
    }

    const totalLeads = await mongoose.connection.db.collection('linkedinleads')
      .countDocuments({ tenantId: MAIN_TENANT_ID });

    console.log(`\n  Total LinkedIn leads: ${totalLeads}`);

    console.log('\n✅ Migration completed successfully!');
    console.log('\nYou can now view the campaigns and leads in the UI at:');
    console.log('  http://localhost:8080/linkedin\n');

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

migrateLeads();
