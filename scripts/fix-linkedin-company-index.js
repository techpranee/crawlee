require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✓ Connected to MongoDB');

    const db = mongoose.connection.db;

    // Drop the problematic unique index
    try {
        await db.collection('linkedincompanies').dropIndex('linkedInId_1');
        console.log('✓ Dropped linkedInId_1 unique index');
    } catch (e) {
        console.log('⚠️  Index linkedInId_1 not found or already dropped:', e.message);
    }

    // Recreate as non-unique
    try {
        await db.collection('linkedincompanies').createIndex({ linkedInId: 1 });
        console.log('✓ Created linkedInId non-unique index');
    } catch (e) {
        console.log('⚠️  Could not create index:', e.message);
    }

    console.log('\n✅ Migration complete!');
    process.exit(0);
}

main().catch(e => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
});
