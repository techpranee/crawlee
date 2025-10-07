require('dotenv').config();
const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
    tenantId: String,
    name: String,
    status: String,
    stats: Object,
}, { timestamps: true });

const CampaignModel = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);

const campaignId = process.argv[2];

if (!campaignId) {
    console.error('Usage: node scripts/reset-campaign.js <campaignId>');
    process.exit(1);
}

async function main() {
    await mongoose.connect(process.env.MONGO_URL);

    const result = await CampaignModel.findByIdAndUpdate(
        campaignId,
        {
            status: 'queued',
            'stats.totalLeads': 0,
            'stats.totalRequests': 0,
            progress: 0,
        },
        { new: true }
    );

    if (!result) {
        console.error(`Campaign ${campaignId} not found`);
        process.exit(1);
    }

    console.log('✅ Campaign reset successfully:');
    console.log(`   ID: ${result._id}`);
    console.log(`   Name: ${result.name}`);
    console.log(`   Status: ${result.status}`);

    process.exit(0);
}

main().catch(console.error);
