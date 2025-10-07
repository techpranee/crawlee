import mongoose from 'mongoose';
import { CampaignModel } from '../src/db/models/Campaign';
import { config as loadEnv } from 'dotenv';

loadEnv();

async function createZoviaCampaign() {
    await mongoose.connect(process.env.MONGO_URL!);

    const zoviaTenantId = '68e3667734a7ec048f9e87a8';

    const campaign = await CampaignModel.create({
        name: 'Zovia Test Campaign',
        description: 'Testing tenant isolation for zovia',
        source: 'custom',
        tenantId: zoviaTenantId,
        status: 'done',
        maxItems: 5,
        stats: { test: true }
    });

    console.log('Created campaign:', campaign._id, campaign.name, 'for tenant:', campaign.tenantId);
    await mongoose.disconnect();
}

createZoviaCampaign().catch(console.error);