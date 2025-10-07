require('dotenv').config();
const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
    name: String,
    apiKey: String,
    basicAuthUser: String,
    basicAuthPass: String,
}, { timestamps: true });

const TenantModel = mongoose.models.Tenant || mongoose.model('Tenant', tenantSchema);

async function main() {
    await mongoose.connect(process.env.MONGO_URL);
    const tenants = await TenantModel.find();
    console.log('\n📋 Available Tenants:\n');
    tenants.forEach((t, i) => {
        console.log(`${i + 1}. ID: ${t._id.toString()}`);
        console.log(`   Name: ${t.name}`);
        console.log(`   User: ${t.basicAuthUser}`);
        console.log('');
    });
    process.exit(0);
}

main().catch(console.error);
