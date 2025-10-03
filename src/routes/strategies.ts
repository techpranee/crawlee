import express from 'express';
import { z } from 'zod';
import { StrategyModel, type StrategyDocument } from '../db/models/Strategy';
import { TenantDocument } from '../db/models/Tenant';
import { logger } from '../utils/logger';
import { Types } from 'mongoose';
import { StrategyTemplate } from '../types/api';

const router = express.Router();

// Validation schemas
const SelectorConfigSchema = z.object({
  selector: z.string().min(1),
  field: z.string().min(1),
  type: z.enum(['text', 'href', 'src', 'attribute', 'html']),
  attribute: z.string().optional(),
  required: z.boolean().optional(),
  transform: z.string().optional(),
  multiple: z.boolean().optional(),
});

const ValidationRuleSchema = z.object({
  field: z.string().min(1),
  type: z.enum(['regex', 'length', 'required', 'format']),
  value: z.union([z.string(), z.number()]),
  message: z.string(),
});

const CreateStrategySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  platform: z.enum(['linkedin', 'apollo', 'zoom', 'generic']),
  urlPattern: z.string().min(1),
  selectors: z.array(SelectorConfigSchema).min(1),
  validationRules: z.array(ValidationRuleSchema).optional(),
  exampleUrls: z.array(z.string().url()).optional(),
  authType: z.enum(['linkedin', 'apollo', 'zoom']).nullable().optional(),
  crawlerStrategy: z.enum(['playwright', 'cheerio', 'auto']).optional(),
  tags: z.array(z.string()).optional(),
});

const UpdateStrategySchema = CreateStrategySchema.partial();

// Helper to serialize strategy for API response
function serializeStrategy(strategy: StrategyDocument) {
  return {
    id: (strategy._id as Types.ObjectId).toString(),
    name: strategy.name,
    description: strategy.description,
    platform: strategy.platform,
    urlPattern: strategy.urlPattern,
    selectors: strategy.selectors,
    validationRules: strategy.validationRules,
    exampleUrls: strategy.exampleUrls,
    authType: strategy.authType,
    crawlerStrategy: strategy.crawlerStrategy,
    active: strategy.active,
    usageCount: strategy.usageCount,
    lastValidated: strategy.lastValidated,
    successRate: strategy.successRate,
    tags: strategy.tags,
    createdAt: strategy.createdAt,
    updatedAt: strategy.updatedAt,
  };
}

/**
 * GET /api/strategies
 * List all strategies for tenant with optional filtering
 */
router.get('/', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    const { platform, active, tag } = req.query;

    const query: Record<string, unknown> = { tenantId: tenant._id };
    
    if (platform) {
      query.platform = platform;
    }
    
    if (active !== undefined) {
      query.active = active === 'true';
    }
    
    if (tag) {
      query.tags = tag;
    }

    const strategies = await StrategyModel.find(query)
      .sort({ usageCount: -1, createdAt: -1 })
      .exec();

    res.json({
      strategies: strategies.map(serializeStrategy),
      total: strategies.length,
    });
  } catch (error) {
    logger.error({ error, url: req.url }, 'Failed to list strategies');
    next(error);
  }
});

/**
 * GET /api/strategies/:id
 * Get single strategy by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid strategy ID' });
    }

    const strategy = await StrategyModel.findOne({
      _id: id,
      tenantId: tenant._id,
    }).exec();

    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    res.json(serializeStrategy(strategy));
  } catch (error) {
    logger.error({ error, url: req.url }, 'Failed to get strategy');
    next(error);
  }
});

/**
 * POST /api/strategies
 * Create new strategy
 */
router.post('/', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    const validated = CreateStrategySchema.parse(req.body);

    // Check for duplicate name
    const existing = await StrategyModel.findOne({
      tenantId: tenant._id,
      name: validated.name,
    }).exec();

    if (existing) {
      return res.status(409).json({ error: 'Strategy with this name already exists' });
    }

    const strategy = new StrategyModel({
      ...validated,
      tenantId: tenant._id,
    });

    await strategy.save();

    logger.info({ strategyId: strategy._id, name: strategy.name }, 'Strategy created');
    res.status(201).json(serializeStrategy(strategy));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error({ error, url: req.url }, 'Failed to create strategy');
    next(error);
  }
});

/**
 * PATCH /api/strategies/:id
 * Update existing strategy
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid strategy ID' });
    }

    const validated = UpdateStrategySchema.parse(req.body);

    // If name is being updated, check for duplicates
    if (validated.name) {
      const existing = await StrategyModel.findOne({
        tenantId: tenant._id,
        name: validated.name,
        _id: { $ne: id },
      }).exec();

      if (existing) {
        return res.status(409).json({ error: 'Strategy with this name already exists' });
      }
    }

    const strategy = await StrategyModel.findOneAndUpdate(
      { _id: id, tenantId: tenant._id },
      { $set: validated },
      { new: true }
    ).exec();

    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    logger.info({ strategyId: strategy._id }, 'Strategy updated');
    res.json(serializeStrategy(strategy));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error({ error, url: req.url }, 'Failed to update strategy');
    next(error);
  }
});

/**
 * DELETE /api/strategies/:id
 * Delete strategy (soft delete by setting active=false)
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    const { id } = req.params;
    const { permanent } = req.query;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid strategy ID' });
    }

    if (permanent === 'true') {
      // Hard delete
      const result = await StrategyModel.deleteOne({
        _id: id,
        tenantId: tenant._id,
      }).exec();

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Strategy not found' });
      }

      logger.info({ strategyId: id }, 'Strategy permanently deleted');
      res.json({ message: 'Strategy permanently deleted' });
    } else {
      // Soft delete
      const strategy = await StrategyModel.findOneAndUpdate(
        { _id: id, tenantId: tenant._id },
        { $set: { active: false } },
        { new: true }
      ).exec();

      if (!strategy) {
        return res.status(404).json({ error: 'Strategy not found' });
      }

      logger.info({ strategyId: strategy._id }, 'Strategy deactivated');
      res.json(serializeStrategy(strategy));
    }
  } catch (error) {
    logger.error({ error, url: req.url }, 'Failed to delete strategy');
    next(error);
  }
});

/**
 * POST /api/strategies/:id/clone
 * Clone an existing strategy with a new name
 */
router.post('/:id/clone', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    const { id } = req.params;
    const { name } = req.body;

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid strategy ID' });
    }

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'New name is required' });
    }

    const original = await StrategyModel.findOne({
      _id: id,
      tenantId: tenant._id,
    }).exec();

    if (!original) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    // Check for duplicate name
    const existing = await StrategyModel.findOne({
      tenantId: tenant._id,
      name,
    }).exec();

    if (existing) {
      return res.status(409).json({ error: 'Strategy with this name already exists' });
    }

    const cloned = new StrategyModel({
      tenantId: tenant._id,
      name,
      description: original.description ? `${original.description} (cloned)` : undefined,
      platform: original.platform,
      urlPattern: original.urlPattern,
      selectors: original.selectors,
      validationRules: original.validationRules,
      exampleUrls: original.exampleUrls,
      authType: original.authType,
      crawlerStrategy: original.crawlerStrategy,
      tags: original.tags,
    });

    await cloned.save();

    logger.info({ originalId: id, clonedId: cloned._id }, 'Strategy cloned');
    res.status(201).json(serializeStrategy(cloned));
  } catch (error) {
    logger.error({ error, url: req.url }, 'Failed to clone strategy');
    next(error);
  }
});

/**
 * POST /api/strategies/analyze
 * AI-powered selector discovery from URL
 * 
 * Takes a URL, scrapes it with Playwright, and uses Ollama to analyze
 * the DOM structure and suggest optimal selectors.
 * 
 * Supports two modes:
 * 1. Natural language: Provide 'description' with plain English
 * 2. Field-based: Provide 'targetFields' array with specific field names
 */
router.post('/analyze', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    const AnalyzeSchema = z.object({
      url: z.string().url(),
      platform: z.enum(['linkedin', 'apollo', 'zoom', 'generic']).optional(),
      targetFields: z.array(z.string()).optional(),
      description: z.string().optional(), // Natural language description
    });

    const { url, platform, targetFields, description } = AnalyzeSchema.parse(req.body);

    logger.info({ url, platform, hasDescription: !!description }, 'Starting AI selector analysis');

    // Import dynamically to avoid circular dependencies
    const { analyzePage } = await import('../services/extraction/aiAnalyzer');
    
    const result = await analyzePage({
      url,
      platform: platform ?? 'generic',
      targetFields: targetFields ?? (description ? undefined : ['name', 'title', 'email', 'company', 'phone', 'linkedin_url']),
      naturalLanguagePrompt: description,
      tenant,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error({ error, url: req.url }, 'Failed to analyze page');
    next(error);
  }
});

/**
 * POST /api/strategies/:id/test
 * Test a strategy on a sample URL
 */
router.post('/:id/test', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    const { id } = req.params;
    const TestSchema = z.object({
      testUrl: z.string().url(),
    });

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid strategy ID' });
    }

    const { testUrl } = TestSchema.parse(req.body);

    const strategy = await StrategyModel.findOne({
      _id: id,
      tenantId: tenant._id,
    }).exec();

    if (!strategy) {
      return res.status(404).json({ error: 'Strategy not found' });
    }

    logger.info({ strategyId: id, testUrl }, 'Testing strategy');

    // Import dynamically to avoid circular dependencies
    const { testStrategy } = await import('../services/extraction/strategyTester');
    
    const result = await testStrategy({
      strategy: strategy as StrategyDocument,
      testUrl,
      tenant,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error({ error, url: req.url }, 'Failed to test strategy');
    next(error);
  }
});

/**
 * POST /api/strategies/test-draft
 * Test a draft strategy without saving it (for preview during creation)
 */
router.post('/test-draft', async (req, res, next) => {
  try {
    const tenant = res.locals.tenant as TenantDocument;
    
    const DraftTestSchema = z.object({
      testUrl: z.string().url(),
      strategy: z.object({
        name: z.string().min(1),
        platform: z.enum(['linkedin', 'apollo', 'zoom', 'generic']),
        selectors: z.array(z.object({
          selector: z.string().min(1),
          field: z.string().min(1),
          type: z.enum(['text', 'href', 'src', 'attribute', 'html']),
          attribute: z.string().optional(),
          required: z.boolean().optional(),
          transform: z.string().optional(),
          multiple: z.boolean().optional(),
        })).min(1),
        authType: z.enum(['linkedin', 'apollo', 'zoom']).nullable().optional(),
        crawlerStrategy: z.enum(['playwright', 'cheerio', 'auto']).optional(),
      }),
    });

    const { testUrl, strategy: draftStrategy } = DraftTestSchema.parse(req.body);

    logger.info({ testUrl, strategyName: draftStrategy.name }, 'Testing draft strategy');

    // Create a temporary strategy object for testing
    const tempStrategy = {
      name: draftStrategy.name,
      platform: draftStrategy.platform,
      selectors: draftStrategy.selectors,
      authType: draftStrategy.authType,
      crawlerStrategy: draftStrategy.crawlerStrategy || 'auto',
      tenantId: tenant._id,
    } as unknown as StrategyDocument;

    // Import dynamically to avoid circular dependencies
    const { testStrategy } = await import('../services/extraction/strategyTester');
    
    const result = await testStrategy({
      strategy: tempStrategy,
      testUrl,
      tenant,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error({ error, url: req.url }, 'Failed to test draft strategy');
    next(error);
  }
});

// Legacy template data (keeping for backward compatibility)
const strategyTemplates: StrategyTemplate[] = [
  {
    id: 'linkedin-posts',
    name: 'LinkedIn Posts Scraper',
    description: 'Extract posts, engagement metrics, and hashtags from LinkedIn profiles',
    category: 'social-media',
    mode: 'hybrid',
    output: 'database',
    complexity: 'medium',
    fields: [
      {
        id: 'profileUrl',
        label: 'LinkedIn Profile URL',
        type: 'text',
        placeholder: 'https://www.linkedin.com/in/username',
        required: true,
        description: 'The LinkedIn profile URL to scrape posts from'
      },
      {
        id: 'dateRange',
        label: 'Post Date Range',
        type: 'select',
        required: true,
        options: [
          { label: 'Last 7 days', value: '7' },
          { label: 'Last 30 days', value: '30' },
          { label: 'Last 90 days', value: '90' },
          { label: 'Last 6 months', value: '180' },
          { label: 'Last year', value: '365' },
        ],
        description: 'How far back to collect posts'
      },
      {
        id: 'contentKeywords',
        label: 'Content Keywords',
        type: 'textarea',
        placeholder: 'AI, machine learning, startup',
        description: 'Filter posts by keywords (comma-separated)'
      }
    ]
  },
  {
    id: 'company-directory',
    name: 'Company Directory Scraper',
    description: 'Extract company information from business directories',
    category: 'business',
    mode: 'crawlee',
    output: 'database',
    complexity: 'easy',
    fields: [
      {
        id: 'directoryUrl',
        label: 'Directory URL',
        type: 'text',
        placeholder: 'https://directory.example.com/companies',
        required: true,
        description: 'The URL of the company directory to scrape'
      },
      {
        id: 'industry',
        label: 'Industry Filter',
        type: 'select',
        options: [
          { label: 'All Industries', value: 'all' },
          { label: 'Technology', value: 'tech' },
          { label: 'Finance', value: 'finance' },
          { label: 'Healthcare', value: 'healthcare' },
          { label: 'Manufacturing', value: 'manufacturing' },
          { label: 'Retail', value: 'retail' }
        ],
        description: 'Filter companies by industry'
      },
      {
        id: 'location',
        label: 'Location',
        type: 'text',
        placeholder: 'San Francisco, CA',
        description: 'Filter by company location'
      }
    ]
  },
  {
    id: 'ecommerce-products',
    name: 'E-commerce Product Scraper',
    description: 'Extract product information, prices, and reviews from online stores',
    category: 'ecommerce',
    mode: 'crawlee',
    output: 'database',
    complexity: 'medium',
    fields: [
      {
        id: 'storeUrl',
        label: 'Store URL',
        type: 'text',
        placeholder: 'https://store.example.com/products',
        required: true,
        description: 'The URL of the product page or category'
      },
      {
        id: 'priceRange',
        label: 'Price Range',
        type: 'select',
        options: [
          { label: 'Any Price', value: 'any' },
          { label: 'Under $50', value: '0-50' },
          { label: '$50 - $200', value: '50-200' },
          { label: '$200 - $500', value: '200-500' },
          { label: 'Over $500', value: '500+' }
        ],
        description: 'Filter products by price range'
      },
      {
        id: 'category',
        label: 'Product Category',
        type: 'text',
        placeholder: 'Electronics, Clothing, Books',
        description: 'Specific product category to focus on'
      }
    ]
  },
  {
    id: 'custom-scraper',
    name: 'Custom Website Scraper',
    description: 'Flexible scraper for any website with custom selectors',
    category: 'content',
    mode: 'crawlee',
    output: 'database',
    complexity: 'advanced',
    fields: [
      {
        id: 'targetUrl',
        label: 'Target URL',
        type: 'text',
        placeholder: 'https://example.com',
        required: true,
        description: 'The website URL to scrape'
      },
      {
        id: 'selectors',
        label: 'CSS Selectors',
        type: 'textarea',
        placeholder: 'title: h1\nprice: .price\ndescription: .description',
        description: 'CSS selectors for data extraction (key: selector format)'
      },
      {
        id: 'maxPages',
        label: 'Max Pages',
        type: 'number',
        placeholder: '10',
        description: 'Maximum number of pages to crawl'
      }
    ]
  }
];

/**
 * GET /api/strategies/templates
 * Get legacy strategy templates (for backward compatibility)
 */
router.get('/templates', async (req, res) => {
  try {
    const category = req.query.category as string;
    
    let filteredStrategies = strategyTemplates;
    if (category) {
      filteredStrategies = strategyTemplates.filter(s => s.category === category);
    }

    res.json({ strategies: filteredStrategies });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch strategy templates' });
  }
});

/**
 * GET /api/strategies/templates/:id
 * Get specific legacy strategy template
 */
router.get('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const strategy = strategyTemplates.find(s => s.id === id);
    
    if (!strategy) {
      return res.status(404).json({ error: 'Strategy template not found' });
    }

    res.json(strategy);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch strategy template' });
  }
});

export default router;
