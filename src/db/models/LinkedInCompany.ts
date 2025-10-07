import { Schema, model, models, InferSchemaType } from 'mongoose';

const linkedInCompanySchema = new Schema(
    {
        campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
        tenantId: { type: String, required: true, index: true },

        // LinkedIn specific IDs
        linkedInId: { type: String, index: true }, // urn:li:company:... (optional, not always available)
        linkedInUrl: { type: String, required: true },

        // Company basic information
        name: { type: String, required: true, index: true },
        tagline: { type: String },
        description: { type: String },
        website: { type: String },

        // Company details
        industry: { type: String, index: true },
        companySize: { type: String }, // e.g., "1001-5000 employees"
        headquarters: { type: String },
        founded: { type: String },
        specialties: { type: [String], default: [] },

        // Location information
        locations: [{
            type: { type: String }, // e.g., "Headquarters", "Office"
            city: { type: String },
            state: { type: String },
            country: { type: String },
            address: { type: String }
        }],

        // Social & Engagement
        followerCount: { type: Number },
        employeeCount: { type: Number },

        // Additional fields
        companyType: { type: String }, // e.g., "Public Company", "Privately Held"
        logo: { type: String }, // URL to logo
        cover: { type: String }, // URL to cover image

        // Metadata
        collectedAt: { type: Date, default: Date.now },
        lastUpdated: { type: Date, default: Date.now },

        // Raw metadata for retry/reprocessing
        rawMetadata: {
            html: { type: String },
            searchResult: { type: Schema.Types.Mixed },
            extractedAt: { type: Date },
        },
    },
    {
        timestamps: true,
    }
);

// Compound indexes for multi-tenant queries
linkedInCompanySchema.index({ tenantId: 1, campaignId: 1 });
linkedInCompanySchema.index({ tenantId: 1, name: 1 });
linkedInCompanySchema.index({ tenantId: 1, industry: 1 });
linkedInCompanySchema.index({ tenantId: 1, companySize: 1 });

export type LinkedInCompanyDocument = InferSchemaType<typeof linkedInCompanySchema>;

export const LinkedInCompanyModel =
    models.LinkedInCompany || model('LinkedInCompany', linkedInCompanySchema);
