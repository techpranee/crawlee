#!/usr/bin/env node
/**
 * Script to check and update LinkedIn cookies for a tenant
 * 
 * Usage: node scripts/check-linkedin-cookies.js [tenant-id]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/crawlee';

const tenantSchema = new mongoose.Schema({
  apiKey: String,
  linkedinCookie: String,
  apolloCookie: String,
  name: String,
}, { timestamps: true, strict: false });

async function main() {
  console.log('🔍 LinkedIn Cookie Checker\n');
  console.log('Connecting to MongoDB...');
  
  await mongoose.connect(MONGO_URL);
  console.log('✅ Connected to MongoDB\n');

  const Tenant = mongoose.model('Tenant', tenantSchema);

  // Get all tenants
  const tenants = await Tenant.find({}).select('_id apiKey name linkedinCookie');
  
  if (tenants.length === 0) {
    console.log('❌ No tenants found in database');
    console.log('\nCreate a tenant first using the seed script:');
    console.log('  npm run seed');
    process.exit(1);
  }

  console.log(`Found ${tenants.length} tenant(s):\n`);

  tenants.forEach((t, idx) => {
    const hasLinkedInCookie = !!t.linkedinCookie;
    const cookieLength = t.linkedinCookie?.length || 0;
    const cookiePreview = hasLinkedInCookie 
      ? `${t.linkedinCookie.substring(0, 50)}...` 
      : 'Not set';

    console.log(`${idx + 1}. Tenant: ${t._id}`);
    console.log(`   Name: ${t.name || 'N/A'}`);
    console.log(`   API Key: ${t.apiKey}`);
    console.log(`   LinkedIn Cookie: ${hasLinkedInCookie ? `✅ Set (${cookieLength} chars)` : '❌ Not set'}`);
    if (hasLinkedInCookie) {
      console.log(`   Preview: ${cookiePreview}`);
    }
    console.log('');
  });

  // Offer to set cookies
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Would you like to set/update LinkedIn cookies for a tenant? (y/n): ', async (answer) => {
    if (answer.toLowerCase() !== 'y') {
      console.log('Exiting...');
      rl.close();
      process.exit(0);
    }

    rl.question('Enter tenant API key: ', async (apiKey) => {
      const tenant = await Tenant.findOne({ apiKey });

      if (!tenant) {
        console.log(`❌ Tenant not found with API key: ${apiKey}`);
        rl.close();
        process.exit(1);
      }

      console.log('\n📋 To get LinkedIn cookies:');
      console.log('1. Open LinkedIn in your browser and log in');
      console.log('2. Open Developer Tools (F12)');
      console.log('3. Go to Application > Cookies > https://www.linkedin.com');
      console.log('4. Copy the following cookies and paste in this format:');
      console.log('   li_at=<value>; JSESSIONID=<value>; li_mc=<value>');
      console.log('');

      rl.question('Paste LinkedIn cookies: ', async (cookies) => {
        if (!cookies || cookies.trim().length === 0) {
          console.log('❌ No cookies provided');
          rl.close();
          process.exit(1);
        }

        // Update tenant
        tenant.linkedinCookie = cookies.trim();
        await tenant.save();

        console.log('\n✅ LinkedIn cookies updated successfully!');
        console.log(`   Tenant: ${tenant._id}`);
        console.log(`   Cookie length: ${cookies.trim().length} characters`);
        console.log('\nYou can now test LinkedIn scraping with this tenant.');

        rl.close();
        process.exit(0);
      });
    });
  });
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
