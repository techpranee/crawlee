import { config as loadEnv } from 'dotenv';
import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import { TenantModel } from '../src/db/models/Tenant';
import { logger } from '../src/utils/logger';

loadEnv();

async function seedTenant() {
  try {
    // Connect to MongoDB
    const mongoUrl = process.env.MONGO_URL;
    if (!mongoUrl) {
      throw new Error('MONGO_URL environment variable is required');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUrl);
    console.log('Connected to MongoDB successfully');

    // Generate API key
    const apiKey = randomBytes(32).toString('hex');
    
    // Create or update tenant
    const tenantData = {
      name: 'Development Tenant',
      apiKey: apiKey,
      basicAuthUser: process.env.BASIC_AUTH_USER || 'techpranee',
      basicAuthPass: process.env.BASIC_AUTH_PASS || 'password',
      apolloCookie: process.env.APOLLO_COOKIE || '',
      zoomCookie: process.env.ZOOM_COOKIE || ''
    };

    // Check if tenant already exists
    const existingTenant = await TenantModel.findOne({ 
      basicAuthUser: tenantData.basicAuthUser 
    });

    if (existingTenant) {
      console.log('Tenant already exists:', {
        id: existingTenant._id.toString(),
        name: existingTenant.name,
        apiKey: existingTenant.apiKey,
        basicAuthUser: existingTenant.basicAuthUser
      });
    } else {
      // Create new tenant
      const tenant = new TenantModel(tenantData);
      await tenant.save();
      
      console.log('✅ Tenant created successfully!');
      console.log('Tenant Details:', {
        id: tenant._id.toString(),
        name: tenant.name,
        apiKey: tenant.apiKey,
        basicAuthUser: tenant.basicAuthUser,
        basicAuthPass: tenant.basicAuthPass
      });
    }

    console.log('\n📋 Environment Setup:');
    console.log('Add these to your .env file if not already present:');
    console.log(`DISABLE_AUTH_TENANT_ID=${existingTenant?._id.toString() || 'will-be-generated'}`);
    console.log(`DISABLE_AUTH_TENANT_NAME=${tenantData.name}`);
    console.log(`DISABLE_AUTH_TENANT_KEY=${existingTenant?.apiKey || apiKey}`);
    
    console.log('\n🔧 API Testing:');
    console.log('You can now test the API using:');
    console.log('1. Basic Auth:', `${tenantData.basicAuthUser}:${tenantData.basicAuthPass}`);
    console.log('2. API Key:', existingTenant?.apiKey || apiKey);
    console.log('3. Or use DISABLE_AUTH=true in .env for development');

  } catch (error) {
    console.error('❌ Error seeding tenant:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the seeder
seedTenant();