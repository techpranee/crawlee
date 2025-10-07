import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Parser } from 'json2csv';

import { CampaignModel } from '../db/models/Campaign';
import { TaskModel } from '../db/models/Task';
import { LinkedInLeadModel } from '../db/models/LinkedInLead';
import { LinkedInCompanyModel } from '../db/models/LinkedInCompany';
import { TenantDocument } from '../db/models/Tenant';
import { getAgenda } from '../jobs/agenda';
import { logger } from '../utils/logger';

const router = Router();

// Create LinkedIn campaign schema
const createLinkedInCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  mode: z.enum(['search', 'seedUrls']).default('search'),

  // Search mode fields
  roles: z.string().optional(),
  period: z.enum(['past 24 hours', 'past week', 'past month', 'past year', 'any time']).default('past week'),
  location: z.string().optional(),

  // Advanced search filters
  contentType: z.enum(['all', 'posts', 'articles', 'images', 'videos', 'documents', 'jobs']).default('all'),
  sortBy: z.enum(['relevance', 'date']).default('date'),
  language: z.string().optional(), // e.g., 'en', 'es', 'fr'

  // Author/Company filters
  fromCompanies: z.array(z.string()).optional(), // Company names or IDs
  fromPeople: z.array(z.string()).optional(), // Profile URLs or names

  // Connection filters
  connections: z.enum(['all', '1st', '2nd', '3rd', 'group_members']).default('all'),

  // Industry filter
  industries: z.array(z.string()).optional(), // e.g., ['Technology', 'Healthcare']

  // Company size filter
  companySize: z.array(z.enum(['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+'])).optional(),

  // Keywords location
  keywordsIn: z.enum(['all', 'title', 'company', 'school']).default('all'),

  // Seed URL mode fields
  seedUrls: z.array(z.string()).optional(),
  summary: z.string().optional(),

  // Common fields
  limit: z.number().int().min(1).max(500).default(25),
}).refine(
  (data) => {
    if (data.mode === 'search') {
      return !!data.roles; // roles required in search mode
    }
    if (data.mode === 'seedUrls') {
      return data.seedUrls && data.seedUrls.length > 0; // seedUrls required in URL mode
    }
    return true;
  },
  {
    message: "roles required for search mode, seedUrls required for seedUrls mode",
  }
);

// POST /api/linkedin/campaigns - Create new LinkedIn scraping campaign
router.post('/campaigns', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    const body = createLinkedInCampaignSchema.parse(req.body);

    // Generate description based on mode
    let description = body.description;
    if (!description) {
      if (body.mode === 'seedUrls') {
        description = body.summary || `LinkedIn leads from ${body.seedUrls?.length} seed URLs`;
      } else {
        description = `LinkedIn hiring leads for: ${body.roles}`;
      }
    }

    // Create campaign
    const campaign = await CampaignModel.create({
      name: body.name,
      description,
      source: 'linkedin',
      tenantId: tenant._id.toString(),
      auth: 'linkedin',
      strategy: 'playwright',
      mode: 'crawlee',
      output: 'database',
      status: 'queued',
      maxItems: body.limit,
      seedUrls: body.seedUrls || [],
      stats: {
        totalLeads: 0,
        totalRequests: 0,
        errors: [],
      },
      query: {
        mode: body.mode,
        roles: body.roles,
        period: body.period,
        location: body.location,
        summary: body.summary,
        limit: body.limit,
        // Advanced filters
        contentType: body.contentType,
        sortBy: body.sortBy,
        language: body.language,
        fromCompanies: body.fromCompanies,
        fromPeople: body.fromPeople,
        connections: body.connections,
        industries: body.industries,
        companySize: body.companySize,
        keywordsIn: body.keywordsIn,
      },
    });

    // Create task
    const task = await TaskModel.create({
      campaignId: campaign._id,
      tenantId: tenant._id.toString(),
      type: 'scrape',
      status: 'queued',
    });

    // Schedule job
    const agenda = getAgenda();
    await agenda.now('linkedin:scrape', {
      campaignId: campaign._id.toString(),
      taskId: task._id.toString(),
      tenantId: tenant._id.toString(),
      roles: body.roles,
      period: body.period,
      limit: body.limit,
    });

    logger.info(
      { campaignId: campaign._id, taskId: task._id, tenantId: tenant._id.toString() },
      'LinkedIn scraping campaign created',
    );

    res.status(201).json({
      campaign: {
        id: campaign._id.toString(),
        name: campaign.name,
        description: campaign.description,
        source: campaign.source,
        status: campaign.status,
        createdAt: campaign.createdAt,
      },
      task: {
        id: task._id.toString(),
        status: task.status,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    next(error);
  }
});

// GET /api/linkedin/campaigns - List LinkedIn campaigns
router.get('/campaigns', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const campaigns = await CampaignModel.find({
      tenantId: tenant._id.toString(),
      source: 'linkedin',
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await CampaignModel.countDocuments({
      tenantId: tenant._id.toString(),
      source: 'linkedin',
    });

    // Get lead counts for all campaigns
    const campaignIds = campaigns.map((c: any) => c._id);
    const leadCounts = await LinkedInLeadModel.aggregate([
      {
        $match: {
          campaignId: { $in: campaignIds },
          tenantId: tenant._id.toString(),
        },
      },
      {
        $group: {
          _id: '$campaignId',
          count: { $sum: 1 },
        },
      },
    ]);

    const leadCountMap = new Map(
      leadCounts.map((lc: any) => [lc._id.toString(), lc.count])
    );

    res.json({
      campaigns: campaigns.map((c: any) => ({
        id: c._id.toString(),
        name: c.name,
        description: c.description,
        status: c.status,
        progress: c.progress || 0,
        stats: {
          ...c.stats,
          totalLeads: leadCountMap.get(c._id.toString()) || 0,
        },
        query: c.query,
        seedUrls: c.seedUrls || [],
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/linkedin/campaigns/:id - Get campaign details
router.get('/campaigns/:id', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid campaign ID' });
    }

    const campaign = await CampaignModel.findOne({
      _id: id,
      tenantId: tenant._id.toString(),
      source: 'linkedin',
    }).lean();

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Get lead count
    const leadCount = await LinkedInLeadModel.countDocuments({
      campaignId: new Types.ObjectId(id),
      tenantId: tenant._id.toString(),
    });

    // Get tasks
    const tasks = await TaskModel.find({
      campaignId: new Types.ObjectId(id),
      tenantId: tenant._id.toString(),
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      campaign: {
        id: (campaign as any)._id.toString(),
        name: (campaign as any).name,
        description: (campaign as any).description,
        status: (campaign as any).status,
        progress: (campaign as any).progress || 0,
        stats: {
          ...(campaign as any).stats,
          totalLeads: leadCount,
        },
        query: (campaign as any).query,
        seedUrls: (campaign as any).seedUrls || [],
        createdAt: (campaign as any).createdAt,
        updatedAt: (campaign as any).updatedAt,
      },
      tasks: tasks.map((t: any) => ({
        id: t._id.toString(),
        type: t.type,
        status: t.status,
        startedAt: t.startedAt,
        finishedAt: t.finishedAt,
        error: t.error,
        stats: t.stats,
      })),
      leadCount,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/linkedin/campaigns/:id/leads - Get campaign leads
router.get('/campaigns/:id/leads', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid campaign ID' });
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const leads = await LinkedInLeadModel.find({
      campaignId: new Types.ObjectId(id),
      tenantId: tenant._id.toString(),
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await LinkedInLeadModel.countDocuments({
      campaignId: new Types.ObjectId(id),
      tenantId: tenant._id.toString(),
    });

    res.json({
      leads: leads.map((l: any) => ({
        id: l._id.toString(),
        linkedInId: l.linkedInId,
        authorName: l.authorName,
        authorHeadline: l.authorHeadline,
        authorProfile: l.authorProfile,
        companyUrl: l.companyUrl,
        company: l.company,
        jobTitles: l.jobTitles,
        locations: l.locations,
        seniority: l.seniority,
        skills: l.skills,
        salaryRange: l.salaryRange,
        applicationLink: l.applicationLink,
        notes: l.notes,
        postTitle: l.postTitle,
        postUrl: l.postUrl,
        postedAt: l.postedAt,
        status: l.status,
        tags: l.tags,
        collectedAt: l.collectedAt,
        companyIndustry: l.companyIndustry,
        createdAt: l.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/linkedin/campaigns/:id/export - Export campaign leads as CSV
router.get('/campaigns/:id/export', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    const { id } = req.params;
    const format = (req.query.format as string) || 'csv';

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid campaign ID' });
    }

    const campaign = await CampaignModel.findOne({
      _id: id,
      tenantId: tenant._id.toString(),
      source: 'linkedin',
    }).lean();

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const leads = await LinkedInLeadModel.find({
      campaignId: new Types.ObjectId(id),
      tenantId: tenant._id.toString(),
    })
      .sort({ createdAt: -1 })
      .lean();

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="linkedin-leads-${id}-${Date.now()}.json"`,
      );
      return res.json(leads);
    }

    // CSV export
    const csvData = leads.map((l) => ({
      author_name: l.authorName,
      author_headline: l.authorHeadline,
      author_profile: l.authorProfile,
      company: l.company,
      job_titles: (l.jobTitles || []).join('; '),
      locations: (l.locations || []).join('; '),
      seniority: l.seniority,
      skills: (l.skills || []).join('; '),
      salary_range: l.salaryRange,
      application_link: l.applicationLink,
      notes: l.notes,
      post_url: l.postUrl,
      status: l.status,
      collected_at: l.collectedAt,
    }));

    const parser = new Parser({
      fields: [
        'author_name',
        'author_headline',
        'author_profile',
        'company',
        'job_titles',
        'locations',
        'seniority',
        'skills',
        'salary_range',
        'application_link',
        'notes',
        'post_url',
        'status',
        'collected_at',
      ],
    });

    const csv = parser.parse(csvData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="linkedin-leads-${id}-${Date.now()}.csv"`,
    );
    res.send(csv);

    logger.info(
      { campaignId: id, leadCount: leads.length, format },
      'LinkedIn leads exported',
    );
  } catch (error) {
    next(error);
  }
});

// PATCH /api/linkedin/campaigns/:id - Update campaign (pause/resume)
router.patch('/campaigns/:id', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    const { id } = req.params;
    const { status } = req.body;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid campaign ID' });
    }

    if (status && !['paused', 'stopped'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Use "paused" or "stopped"' });
    }

    const campaign = await CampaignModel.findOne({
      _id: id,
      tenantId: tenant._id.toString(),
      source: 'linkedin',
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    campaign.status = status;
    await campaign.save();

    res.json({
      campaign: {
        id: campaign._id.toString(),
        name: campaign.name,
        status: campaign.status,
      },
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/linkedin/campaigns/:id - Delete campaign and its leads
router.delete('/campaigns/:id', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid campaign ID' });
    }

    const campaign = await CampaignModel.findOne({
      _id: id,
      tenantId: tenant._id.toString(),
      source: 'linkedin',
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Delete all leads
    await LinkedInLeadModel.deleteMany({
      campaignId: new Types.ObjectId(id),
      tenantId: tenant._id.toString(),
    });

    // Delete tasks
    await TaskModel.deleteMany({
      campaignId: new Types.ObjectId(id),
      tenantId: tenant._id.toString(),
    });

    // Delete campaign
    await CampaignModel.deleteOne({ _id: id });

    logger.info({ campaignId: id, tenantId: tenant._id.toString() }, 'LinkedIn campaign deleted');

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Company Campaigns
// ============================================================================

// Create LinkedIn company campaign schema
const createLinkedInCompanyCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  searchUrl: z.string().url(), // Full LinkedIn company search URL
  limit: z.number().int().min(1).max(5000).default(100),
});

// POST /api/linkedin/companies/campaigns - Create new LinkedIn company scraping campaign
router.post('/companies/campaigns', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    const body = createLinkedInCompanyCampaignSchema.parse(req.body);

    // Generate description if not provided
    const description = body.description || `LinkedIn companies from search`;

    // Create campaign
    const campaign = await CampaignModel.create({
      name: body.name,
      description,
      source: 'linkedin-companies',
      tenantId: tenant._id.toString(),
      auth: 'linkedin',
      strategy: 'playwright',
      mode: 'crawlee',
      output: 'database',
      status: 'queued',
      maxItems: body.limit,
      seedUrls: [body.searchUrl],
      stats: {
        totalLeads: 0,
        totalRequests: 0,
        errors: [],
      },
      query: {
        searchUrl: body.searchUrl,
        limit: body.limit,
      },
    });

    // Create task
    const task = await TaskModel.create({
      campaignId: campaign._id,
      tenantId: tenant._id.toString(),
      type: 'scrape',
      status: 'queued',
    });

    logger.info(
      { campaignId: campaign._id, taskId: task._id, tenantId: tenant._id.toString() },
      'LinkedIn company scraping campaign created - ready for manual execution',
    );

    res.status(201).json({
      campaign: {
        id: campaign._id.toString(),
        name: campaign.name,
        description: campaign.description,
        source: campaign.source,
        status: campaign.status,
        maxItems: campaign.maxItems,
        searchUrl: body.searchUrl,
        createdAt: campaign.createdAt,
      },
      task: {
        id: task._id.toString(),
        status: task.status,
      },
      instructions: {
        message: 'Campaign created. Run the scraper manually with:',
        command: `node scripts/linkedin-companies-runner.js --campaignId=${campaign._id.toString()}`,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/linkedin/companies/campaigns - List company campaigns
router.get('/companies/campaigns', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    const { limit = 20, skip = 0 } = req.query;

    const campaigns = await CampaignModel.find({
      tenantId: tenant._id.toString(),
      source: 'linkedin-companies',
    })
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip));

    const total = await CampaignModel.countDocuments({
      tenantId: tenant._id.toString(),
      source: 'linkedin-companies',
    });

    res.json({
      campaigns: campaigns.map((c) => ({
        id: c._id.toString(),
        name: c.name,
        description: c.description,
        status: c.status,
        maxItems: c.maxItems,
        searchUrl: c.query?.searchUrl,
        stats: c.stats,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      pagination: {
        total,
        limit: Number(limit),
        skip: Number(skip),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/linkedin/companies/campaigns/:id - Get company campaign details
router.get('/companies/campaigns/:id', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid campaign ID' });
    }

    const campaign = await CampaignModel.findOne({
      _id: id,
      tenantId: tenant._id.toString(),
      source: 'linkedin-companies',
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Get companies count
    const companiesCount = await LinkedInCompanyModel.countDocuments({
      campaignId: new Types.ObjectId(id),
      tenantId: tenant._id.toString(),
    });

    res.json({
      campaign: {
        id: campaign._id.toString(),
        name: campaign.name,
        description: campaign.description,
        status: campaign.status,
        maxItems: campaign.maxItems,
        searchUrl: campaign.query?.searchUrl,
        stats: {
          ...campaign.stats,
          companiesCollected: companiesCount,
        },
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/linkedin/companies/campaigns/:id/companies - Get companies for a campaign
router.get('/companies/campaigns/:id/companies', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    const { id } = req.params;
    const { limit = 50, skip = 0 } = req.query;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid campaign ID' });
    }

    const campaign = await CampaignModel.findOne({
      _id: id,
      tenantId: tenant._id.toString(),
      source: 'linkedin-companies',
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const companies = await LinkedInCompanyModel.find({
      campaignId: new Types.ObjectId(id),
      tenantId: tenant._id.toString(),
    })
      .sort({ collectedAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip));

    const total = await LinkedInCompanyModel.countDocuments({
      campaignId: new Types.ObjectId(id),
      tenantId: tenant._id.toString(),
    });

    res.json({
      companies: companies.map((c) => ({
        id: c._id.toString(),
        linkedInUrl: c.linkedInUrl,
        name: c.name,
        tagline: c.tagline,
        industry: c.industry,
        companySize: c.companySize,
        headquarters: c.headquarters,
        website: c.website,
        followerCount: c.followerCount,
        employeeCount: c.employeeCount,
        collectedAt: c.collectedAt,
      })),
      pagination: {
        total,
        limit: Number(limit),
        skip: Number(skip),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/linkedin/companies/campaigns/:id/export - Export companies as CSV
router.get('/companies/campaigns/:id/export', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid campaign ID' });
    }

    const campaign = await CampaignModel.findOne({
      _id: id,
      tenantId: tenant._id.toString(),
      source: 'linkedin-companies',
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const companies = await LinkedInCompanyModel.find({
      campaignId: new Types.ObjectId(id),
      tenantId: tenant._id.toString(),
    }).sort({ collectedAt: -1 });

    // Convert to CSV
    const parser = new Parser({
      fields: [
        { label: 'Company Name', value: 'name' },
        { label: 'LinkedIn URL', value: 'linkedInUrl' },
        { label: 'Tagline', value: 'tagline' },
        { label: 'Industry', value: 'industry' },
        { label: 'Company Size', value: 'companySize' },
        { label: 'Headquarters', value: 'headquarters' },
        { label: 'Website', value: 'website' },
        { label: 'Founded', value: 'founded' },
        { label: 'Followers', value: 'followerCount' },
        { label: 'Employees', value: 'employeeCount' },
        { label: 'Description', value: 'description' },
        { label: 'Specialties', value: (row: any) => row.specialties?.join(', ') || '' },
        { label: 'Collected At', value: 'collectedAt' },
      ],
    });

    const csv = parser.parse(companies);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="linkedin-companies-${id}.csv"`);
    res.send(csv);

    logger.info(
      { campaignId: id, tenantId: tenant._id.toString(), count: companies.length },
      'LinkedIn companies exported as CSV',
    );
  } catch (error) {
    next(error);
  }
});

export default router;
