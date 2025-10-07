/**
 * Check and list tenants in the database
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function checkTenants() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✓ Connected to MongoDB\n');

    // Get all unique tenant IDs
    const campaigns = await mongoose.connection.db.collection('campaigns').find({}).toArray();
    const leads = await mongoose.connection.db.collection('linkedinleads').find({}).toArray();

    console.log('📊 Database Summary:\n');

    // Campaigns
    console.log('Campaigns:');
    const tenantCampaigns = {};
    campaigns.forEach(c => {
      if (!tenantCampaigns[c.tenantId]) {
        tenantCampaigns[c.tenantId] = [];
      }
      tenantCampaigns[c.tenantId].push(c);
    });

    Object.keys(tenantCampaigns).forEach(tenantId => {
      console.log(`  Tenant: ${tenantId}`);
      tenantCampaigns[tenantId].forEach(c => {
        console.log(`    - ${c.name} (${c.status}) - ${c.stats?.leadsExtracted || 0} leads`);
        console.log(`      ID: ${c._id}`);
      });
    });

    console.log('\nLinkedIn Leads:');
    const tenantLeads = {};
    leads.forEach(l => {
      tenantLeads[l.tenantId] = (tenantLeads[l.tenantId] || 0) + 1;
    });

    Object.keys(tenantLeads).forEach(tenantId => {
      console.log(`  Tenant: ${tenantId} - ${tenantLeads[tenantId]} leads`);
    });

    // Get your main tenant from .env or tenants collection
    const tenants = await mongoose.connection.db.collection('tenants').find({}).toArray();
    console.log('\n\nRegistered Tenants:');
    if (tenants.length === 0) {
      console.log('  No tenants found in tenants collection');
    } else {
      tenants.forEach(t => {
        console.log(`  - ${t.name} (ID: ${t._id})`);
        console.log(`    API Key: ${t.apiKey}`);
      });
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkTenants();
