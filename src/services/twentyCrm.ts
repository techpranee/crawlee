// src/services/twentyCrm.ts
import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import { TenantModel } from '../db/models/Tenant';

// Twenty CRM REST API types
interface Person {
    id: string;
    name: {
        firstName: string;
        lastName: string;
    };
    linkedinLink?: {
        primaryLinkUrl: string;
    };
    companyId?: string;
}

interface Company {
    id: string;
    name: string;
    domainName?: string;
    deletedAt?: string | null;
}

interface LinkedInScrapingLead {
    id: string;
    name: string;
    authorName?: string;
    authorHeadline?: string;
    jobTitle?: string;
    company?: string;
    location?: string;
    postUrl?: {
        primaryLinkUrl: string;
    };
    jobApplicationLink?: {
        primaryLinkUrl: string;
    };
    notes?: string;
}

interface LinkedInLead {
    name: string;
    linkedinUrl: string;
    companyName?: string;
    title?: string;
    location?: string;
    postUrl?: string;
    postTitle?: string;
    companyUrl?: string;
    companyIndustry?: string;
    postedAt?: Date;
    authorHeadline?: string;
    jobTitles?: string[];
    locations?: string[];
    seniority?: string;
    skills?: string[];
    salaryRange?: string;
    workMode?: string;
    enrichmentStatus?: string;
    status?: string;
    tags?: string[];
}

// REST API response types
interface ApiResponse<T> {
    data: T[];
    totalCount?: number;
}

interface CreateResponse<T> {
    data: T;
}

export class TwentyCrmService {
    private client: AxiosInstance;
    private readonly baseUrl = 'https://20.techpranee.com/rest';

    constructor(apiKey: string) {
        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000, // 30 second timeout
        });

        // Add response interceptor for logging
        this.client.interceptors.response.use(
            (response) => response,
            (error) => {
                logger.error(`[TwentyCRM] API Error: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
                if (error.response?.data) {
                    logger.error(`[TwentyCRM] Error details: ${JSON.stringify(error.response.data, null, 2)}`);
                }
                return Promise.reject(error);
            }
        );
    }

    /**
     * Find company by name (case-insensitive)
     */
    private async findCompanyByName(companyName: string): Promise<Company | null> {
        try {
            const response = await this.client.get('/companies');
            const companies = response.data.data.companies || [];
            const company = companies.find((c: Company) =>
                c.name?.toLowerCase() === companyName.toLowerCase() && !c.deletedAt
            );
            return company || null;
        } catch (error) {
            logger.error(`[TwentyCRM] Error finding company by name: ${error}`);
            return null;
        }
    }

    /**
     * Update an existing company
     */
    private async updateCompany(companyId: string, companyData: any): Promise<void> {
        try {
            await this.client.patch(`/companies/${companyId}`, companyData);
            logger.debug(`[TwentyCRM] Updated company ${companyId}`);
        } catch (error) {
            logger.error(`[TwentyCRM] Error updating company: ${error}`);
            throw error;
        }
    }

    /**
     * Find or create a company (with update if exists)
     */
    private async findOrCreateCompany(companyName: string, companyUrl?: string, industry?: string): Promise<string | undefined> {
        try {
            // Try to find existing company by name (case-insensitive)
            const existingCompany = await this.findCompanyByName(companyName);

            if (existingCompany) {
                logger.debug(`[TwentyCRM] Found existing company: ${companyName} (${existingCompany.id})`);

                // Update company with new data if provided
                const updateData: any = {};
                if (companyUrl) {
                    const domain = new URL(companyUrl).hostname.replace('www.', '');
                    updateData.domainName = { primaryLinkUrl: domain };
                }

                if (Object.keys(updateData).length > 0) {
                    await this.updateCompany(existingCompany.id, updateData);
                }

                return existingCompany.id;
            }

            // Create new company
            const companyData: any = {
                name: companyName,
            };

            if (companyUrl) {
                const domain = new URL(companyUrl).hostname.replace('www.', '');
                companyData.domainName = { primaryLinkUrl: domain };
            }

            try {
                const createResponse = await this.client.post('/companies', companyData);
                const newCompany = createResponse.data.data.createCompany;
                logger.info(`[TwentyCRM] Created new company: ${companyName} (${newCompany.id})`);
                return newCompany.id;
            } catch (createError: any) {
                // If we get a duplicate error, the company exists but we couldn't find it
                // Try to find it again
                if (createError.response?.data?.messages?.[0]?.includes('Duplicate Name')) {
                    logger.warn(`[TwentyCRM] Company "${companyName}" duplicate error, retrying find...`);
                    const retryCompany = await this.findCompanyByName(companyName);
                    if (retryCompany) {
                        return retryCompany.id;
                    }
                    logger.warn(`[TwentyCRM] Company "${companyName}" exists but not visible. Skipping company relationship.`);
                    return undefined;
                }
                throw createError;
            }

        } catch (error) {
            logger.error(`[TwentyCRM] Error with company ${companyName}: ${error}`);
            // Return undefined to skip company relationship rather than failing the entire sync
            return undefined;
        }
    }

    /**
     * Update an existing person
     */
    private async updatePerson(personId: string, personData: any): Promise<void> {
        try {
            await this.client.patch(`/people/${personId}`, personData);
            logger.debug(`[TwentyCRM] Updated person ${personId}`);
        } catch (error) {
            logger.error(`[TwentyCRM] Error updating person: ${error}`);
            throw error;
        }
    }

    /**
     * Normalize LinkedIn URL by removing query parameters and trailing slashes
     */
    private normalizeLinkedInUrl(url: string): string {
        if (!url) return '';
        // Extract just the /in/<username> part
        const match = url.match(/linkedin\.com\/in\/([^?&#/]+)/i);
        if (match) {
            return `https://www.linkedin.com/in/${match[1]}`;
        }
        // Fallback: remove query params and trailing slashes
        return url.split('?')[0].replace(/\/+$/, '');
    }

    /**
     * Find person by LinkedIn URL
     */
    private async findPersonByLinkedInUrl(linkedinUrl: string): Promise<Person | null> {
        try {
            const response = await this.client.get('/people');
            const people = response.data.data.people || [];
            logger.debug(`[TwentyCRM] Searching for LinkedIn URL: ${linkedinUrl}`);
            logger.debug(`[TwentyCRM] Found ${people.length} people in CRM`);

            // Normalize the search URL
            const normalizedSearch = this.normalizeLinkedInUrl(linkedinUrl);
            logger.debug(`[TwentyCRM] Normalized search URL: ${normalizedSearch}`);

            // Try exact match first
            let person = people.find((p: Person) => p.linkedinLink?.primaryLinkUrl === linkedinUrl);

            if (person) {
                logger.debug(`[TwentyCRM] Found exact match for person: ${person.name.firstName} ${person.name.lastName}`);
                return person;
            }

            // Try normalized match
            person = people.find((p: Person) => {
                const crmUrl = p.linkedinLink?.primaryLinkUrl;
                if (!crmUrl) return false;
                const normalizedCrm = this.normalizeLinkedInUrl(crmUrl);
                return normalizedCrm === normalizedSearch;
            });

            if (person) {
                logger.debug(`[TwentyCRM] Found normalized match for person: ${person.name.firstName} ${person.name.lastName}`);
                return person;
            }

            logger.debug(`[TwentyCRM] No person found with LinkedIn URL: ${linkedinUrl}`);
            return null;
        } catch (error) {
            logger.error(`[TwentyCRM] Error finding person by LinkedIn URL: ${error}`);
            return null;
        }
    }

    /**
     * Find existing lead by post URL
     */
    private async findLeadByPostUrl(postUrl: string): Promise<any | null> {
        try {
            const response = await this.client.get('/leadsLinkedinScrapings');
            const leads = response.data.data.leadsLinkedinScrapings || [];
            const lead = leads.find((l: any) => l.postUrl?.primaryLinkUrl === postUrl);
            return lead || null;
        } catch (error) {
            logger.error(`[TwentyCRM] Error finding lead by post URL: ${error}`);
            return null;
        }
    }

    /**
     * Update existing lead
     */
    private async updateLinkedInScrapingLead(leadId: string, leadData: any): Promise<void> {
        try {
            await this.client.patch(`/leadsLinkedinScrapings/${leadId}`, leadData);
            logger.debug(`[TwentyCRM] Updated lead ${leadId}`);
        } catch (error) {
            logger.error(`[TwentyCRM] Error updating lead ${leadId}: ${error}`);
            throw error;
        }
    }

    /**
     * Update person with company relationship
     */
    private async updatePersonCompany(personId: string, companyId: string): Promise<void> {
        try {
            await this.client.patch(`/people/${personId}`, {
                companyId
            });
            logger.debug(`[TwentyCRM] Updated person ${personId} with company ${companyId}`);
        } catch (error) {
            logger.warn(`[TwentyCRM] Could not update person company relationship: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Create or update LinkedIn scraping lead (upsert functionality)
     */
    private async createOrUpdateLinkedInScrapingLead(lead: LinkedInLead, personId?: string, companyId?: string): Promise<string> {
        // First, try to find existing lead by post URL (only if postUrl exists)
        if (lead.postUrl) {
            const existingLead = await this.findLeadByPostUrl(lead.postUrl);
            if (existingLead) {
                // Update existing lead
                const leadData = this.buildLinkedInScrapingLeadData(lead, personId, companyId);
                await this.updateLinkedInScrapingLead(existingLead.id, leadData);
                return existingLead.id;
            }
        }

        // Create new lead
        return await this.createLinkedInScrapingLeadWithRelationships(lead, personId, companyId);
    }

    /**
     * Build lead data object for LinkedIn scraping leads
     */
    private buildLinkedInScrapingLeadData(lead: LinkedInLead, personId?: string, companyId?: string): any {
        // Collect unmapped metadata for notes
        const notes: string[] = [];

        // Add any additional metadata that's not directly mapped
        if (lead.postTitle) notes.push(`Post Title: ${lead.postTitle}`);
        if (lead.companyIndustry) notes.push(`Industry: ${lead.companyIndustry}`);
        if (lead.postedAt) notes.push(`Posted: ${lead.postedAt.toISOString()}`);
        if (lead.salaryRange) notes.push(`Salary: ${lead.salaryRange}`);
        if (lead.seniority) notes.push(`Seniority: ${lead.seniority}`);
        if (lead.skills && lead.skills.length > 0) notes.push(`Skills: ${lead.skills.join(', ')}`);
        if (lead.workMode) notes.push(`Work Mode: ${lead.workMode}`);
        if (lead.enrichmentStatus) notes.push(`Enrichment Status: ${lead.enrichmentStatus}`);
        if (lead.status) notes.push(`Lead Status: ${lead.status}`);
        if (lead.tags && lead.tags.length > 0) notes.push(`Tags: ${lead.tags.join(', ')}`);

        // Map LinkedIn lead data to the custom object fields with relationships
        const leadData: any = {
            name: lead.name,
            authorName: lead.name,
            authorHeadline: lead.title || lead.authorHeadline || '',
            jobTitle: lead.title || (lead.jobTitles && lead.jobTitles.length > 0 ? lead.jobTitles[0] : ''),
            // Person relationship (Author LinkedIn Profile)
            authorLinkedinProfileId: personId, // Person relationship
            // Company relationship
            companyId: companyId, // Company relationship
            // Map location to address object
            location: lead.location ? {
                addressStreet1: lead.location,
            } : undefined,
            postUrl: lead.postUrl ? {
                primaryLinkUrl: lead.postUrl
            } : undefined,
            jobApplicationLink: lead.linkedinUrl ? {
                primaryLinkUrl: lead.linkedinUrl
            } : undefined,
            // Store unmapped metadata as notes array
            notes: notes.length > 0 ? notes : null,
        };

        // Remove undefined fields
        Object.keys(leadData).forEach(key => {
            if (leadData[key] === undefined) {
                delete leadData[key];
            }
        });

        return leadData;
    }

    /**
     * Create a new person with company relationship
     */
    private async createPerson(lead: LinkedInLead, companyId?: string): Promise<string> {
        // Parse name - assume format "First Last" or just use as first name
        const nameParts = lead.name.trim().split(' ');
        const firstName = nameParts[0] || 'Unknown';
        const lastName = nameParts.slice(1).join(' ') || '‎'; // Use zero-width space if no last name

        const personData: any = {
            name: {
                firstName,
                lastName,
            },
            linkedinLink: {
                primaryLinkUrl: lead.linkedinUrl,
            },
            jobTitle: lead.title || lead.authorHeadline || '',
            city: lead.location || '',
        };

        // Add company relationship if provided
        if (companyId) {
            personData.companyId = companyId;
        }

        try {
            const response = await this.client.post('/people', personData);
            const personId = (response.data.data as any).createPerson.id;
            logger.info(`[TwentyCRM] Created new person: ${lead.name} (${personId})`);
            return personId;
        } catch (error: any) {
            // If duplicate LinkedIn URL, try to find the person
            if (error.response?.data?.messages?.[0]?.includes('Duplicate Linkedin')) {
                logger.debug(`[TwentyCRM] Got duplicate LinkedIn error, searching for existing person...`);
                const existingPerson = await this.findPersonByLinkedInUrl(lead.linkedinUrl);
                if (existingPerson) {
                    logger.info(`[TwentyCRM] Found existing person after duplicate error: ${lead.name} (${existingPerson.id})`);

                    // Update the person with new data
                    const updateData: any = {
                        jobTitle: lead.title || lead.authorHeadline || '',
                        city: lead.location || '',
                    };
                    if (companyId) {
                        updateData.companyId = companyId;
                    }
                    await this.updatePerson(existingPerson.id, updateData);

                    return existingPerson.id;
                }
            }
            throw error;
        }
    }

    /**
     * Find or create person (with update if exists)
     */
    private async findOrCreatePerson(lead: LinkedInLead, companyId?: string): Promise<string> {
        try {
            // Try to find existing person by LinkedIn URL
            const existingPerson = await this.findPersonByLinkedInUrl(lead.linkedinUrl);

            if (existingPerson) {
                logger.debug(`[TwentyCRM] Found existing person: ${lead.name} (${existingPerson.id})`);

                // Update person with new data
                const updateData: any = {
                    jobTitle: lead.title || lead.authorHeadline || '',
                    city: lead.location || '',
                };

                // Update company relationship if provided and different
                if (companyId && existingPerson.companyId !== companyId) {
                    updateData.companyId = companyId;
                }

                await this.updatePerson(existingPerson.id, updateData);

                return existingPerson.id;
            }

            // Create new person
            return await this.createPerson(lead, companyId);

        } catch (error) {
            logger.error(`[TwentyCRM] Error finding or creating person: ${error}`);
            throw error;
        }
    }
    private async createLinkedInScrapingLeadWithRelationships(lead: LinkedInLead, personId?: string, companyId?: string): Promise<string> {
        const leadData = this.buildLinkedInScrapingLeadData(lead, personId, companyId);

        const response = await this.client.post('/leadsLinkedinScrapings', leadData);
        return (response.data.data as any).createLeadsLinkedinScraping.id;
    }

    /**
     * Sync a single LinkedIn lead with relationships
     */
    async syncLinkedInLead(lead: LinkedInLead, tenantId: string): Promise<{ success: boolean; personId?: string; companyId?: string; leadId?: string; error?: string }> {
        try {
            logger.info(`[TwentyCRM] Syncing lead: ${lead.name} (${lead.linkedinUrl}) for tenant ${tenantId}`);

            // Step 1: Find or create company
            let companyId: string | undefined;
            if (lead.companyName) {
                companyId = await this.findOrCreateCompany(lead.companyName, lead.companyUrl, lead.companyIndustry);
            }

            // Step 2: Find or create person with company relationship
            const personId = await this.findOrCreatePerson(lead, companyId);

            // Step 3: Create or update lead with relationships
            const leadId = await this.createOrUpdateLinkedInScrapingLead(lead, personId, companyId);

            logger.info(`[TwentyCRM] Successfully synced: Person ${personId}, Company ${companyId || 'none'}, Lead ${leadId}`);

            return {
                success: true,
                personId,
                companyId,
                leadId
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`[TwentyCRM] Error syncing lead ${lead.name}: ${errorMessage}`);
            return {
                success: false,
                error: errorMessage
            };
        }
    }

    /**
     * Batch sync multiple leads
     */
    async syncLinkedInLeads(leads: LinkedInLead[], tenantId: string): Promise<{
        successful: number;
        failed: number;
        errors: Array<{ lead: LinkedInLead; error: string }>;
    }> {
        const results = {
            successful: 0,
            failed: 0,
            errors: [] as Array<{ lead: LinkedInLead; error: string }>,
        };

        logger.info(`[TwentyCRM] Starting batch sync of ${leads.length} leads for tenant ${tenantId}`);

        for (const lead of leads) {
            const result = await this.syncLinkedInLead(lead, tenantId);
            if (result.success) {
                results.successful++;
            } else {
                results.failed++;
                results.errors.push({ lead, error: result.error! });
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        logger.info(`[TwentyCRM] Batch sync completed: ${results.successful} successful, ${results.failed} failed`);
        return results;
    }

    /**
     * Health check for Twenty CRM connection
     */
    async healthCheck(): Promise<boolean> {
        try {
            await this.client.get('/people');
            logger.info('[TwentyCRM] Health check passed');
            return true;
        } catch (error) {
            logger.error(`[TwentyCRM] Health check failed: ${error}`);
            return false;
        }
    }

    /**
     * Get current data counts and details
     */
    async getDataDetails(): Promise<{ people: any[]; companies: any[]; leads: any[] }> {
        try {
            const [peopleRes, companiesRes, leadsRes] = await Promise.all([
                this.client.get('/people'),
                this.client.get('/companies'),
                this.client.get('/leadsLinkedinScrapings'),
            ]);

            return {
                people: peopleRes.data.data.people || [],
                companies: companiesRes.data.data.companies || [],
                leads: leadsRes.data.data.leadsLinkedinScrapings || [],
            };
        } catch (error) {
            logger.error(`[TwentyCRM] Error getting data details: ${error}`);
            return { people: [], companies: [], leads: [] };
        }
    }
}

// Helper function to get tenant's Twenty CRM API key
async function getTenantTwentyCrmApiKey(tenantId: string): Promise<string> {
    try {
        const tenant = await TenantModel.findById(tenantId);
        if (!tenant) {
            throw new Error(`Tenant not found: ${tenantId}`);
        }
        if (!tenant.twentyCrmApiKey) {
            throw new Error(`Twenty CRM API key not configured for tenant: ${tenant.name}`);
        }
        return tenant.twentyCrmApiKey;
    } catch (error) {
        logger.error(`[TwentyCRM] Error getting tenant API key: ${error}`);
        throw error;
    }
}

// Singleton instance per tenant
const twentyCrmServices = new Map<string, TwentyCrmService>();

export async function getTwentyCrmServiceForTenant(tenantId: string): Promise<TwentyCrmService> {
    const key = tenantId;

    if (!twentyCrmServices.has(key)) {
        const apiKey = await getTenantTwentyCrmApiKey(tenantId);
        twentyCrmServices.set(key, new TwentyCrmService(apiKey));
    }

    return twentyCrmServices.get(key)!;
}

// Backward compatibility: synchronous version for non-tenant contexts
export function getTwentyCrmService(): TwentyCrmService {
    const key = 'default';

    if (!twentyCrmServices.has(key)) {
        const apiKey = process.env.TWENTY_API_KEY;
        if (!apiKey) {
            throw new Error('TWENTY_API_KEY environment variable is required');
        }
        twentyCrmServices.set(key, new TwentyCrmService(apiKey));
    }

    return twentyCrmServices.get(key)!;
}