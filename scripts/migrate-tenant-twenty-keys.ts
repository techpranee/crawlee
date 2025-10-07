import mongoose from 'mongoose';
import { TenantModel } from '../src/db/models/Tenant';
import { config } from 'dotenv';

config();

async function updateTenantsWithTwentyCrmKeys() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost:27017/crawlee');
        console.log('Connected to MongoDB');

        // Get all tenants
        const tenants = await TenantModel.find({});
        console.log(`Found ${tenants.length} tenants`);

        // Update each tenant with Twenty CRM API key
        for (const tenant of tenants) {
            console.log(`\nProcessing tenant: ${tenant.name} (${tenant._id})`);

            // For now, set the same API key for all tenants - in production, you'd get this from user input or config
            // You can customize this based on your tenant requirements
            const twentyCrmApiKey = process.env.TWENTY_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0YTU5NmViMi1iMWJjLTQyZTgtODhhOS0wYTc3YTRiZTNkM2UiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiNGE1OTZlYjItYjFiYy00MmU4LTg4YTktMGE3N2E0YmUzZDNlIiwiaWF0IjoxNzU5NjkwNzM4LCJleHAiOjQ5MTMyOTA3MzcsImp0aSI6IjE3ZDMyZmRlLTNhNDgtNGI3Ny04NWE1LTI3NGZhYzc0ZTE5YiJ9.UKk8s9LBc_zWOBbyZh_djFj2pGSmBknD1QVSNclWJ3Q';

            // Update the tenant
            await TenantModel.updateOne(
                { _id: tenant._id },
                { $set: { twentyCrmApiKey } }
            );

            console.log(`✅ Updated tenant ${tenant.name} with Twenty CRM API key`);
        }

        console.log('\n🎉 Migration completed!');

        // Show summary
        const updatedTenants = await TenantModel.find({ twentyCrmApiKey: { $exists: true, $ne: null } });
        console.log(`\n📊 Summary:`);
        console.log(`Total tenants: ${tenants.length}`);
        console.log(`Tenants with Twenty CRM keys: ${updatedTenants.length}`);

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

// Run the migration
updateTenantsWithTwentyCrmKeys();