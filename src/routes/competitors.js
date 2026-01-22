import { Router } from 'express';
import { Competitor } from '../models/competitor.js';
import { Page, COMMON_PAGES } from '../models/page.js';
import { Change } from '../models/change.js';
import { checkCompetitor, checkPage } from '../services/monitor.js';

const router = Router();

// Get all competitors with their pages
router.get('/', (req, res) => {
  try {
    const competitors = Competitor.getAllWithPages();
    res.json(competitors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create competitor with pages
router.post('/', (req, res) => {
  try {
    const { name, pages, check_frequency } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!pages || pages.length === 0) {
      return res.status(400).json({ error: 'At least one page URL is required' });
    }

    const competitor = Competitor.createWithPages(name, pages, check_frequency);
    res.status(201).json(competitor);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get common page templates
router.get('/common-pages', (req, res) => {
  res.json(COMMON_PAGES);
});

// Get single competitor with pages
router.get('/:id', (req, res) => {
  try {
    const competitor = Competitor.getWithPages(req.params.id);
    if (!competitor) {
      return res.status(404).json({ error: 'Competitor not found' });
    }
    res.json(competitor);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update competitor
router.put('/:id', (req, res) => {
  try {
    const competitor = Competitor.findById(req.params.id);
    if (!competitor) {
      return res.status(404).json({ error: 'Competitor not found' });
    }

    const updated = Competitor.update(req.params.id, req.body);
    res.json(Competitor.getWithPages(updated.id));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete competitor
router.delete('/:id', (req, res) => {
  try {
    const competitor = Competitor.findById(req.params.id);
    if (!competitor) {
      return res.status(404).json({ error: 'Competitor not found' });
    }

    Competitor.delete(req.params.id);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check all pages for a competitor
router.post('/:id/check', async (req, res) => {
  try {
    const competitor = Competitor.findById(req.params.id);
    if (!competitor) {
      return res.status(404).json({ error: 'Competitor not found' });
    }

    const result = await checkCompetitor(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get competitor changes
router.get('/:id/changes', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const changes = Change.findByCompetitor(req.params.id, limit);
    res.json(changes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Page routes ---

// Add page to competitor
router.post('/:id/pages', (req, res) => {
  try {
    const competitor = Competitor.findById(req.params.id);
    if (!competitor) {
      return res.status(404).json({ error: 'Competitor not found' });
    }

    const { url, label } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const existing = Page.findByUrl(req.params.id, url);
    if (existing) {
      return res.status(409).json({ error: 'Page with this URL already exists' });
    }

    const page = Page.create(req.params.id, url, label);
    res.status(201).json(page);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add multiple pages (Quick Add)
router.post('/:id/pages/bulk', (req, res) => {
  try {
    const competitor = Competitor.findById(req.params.id);
    if (!competitor) {
      return res.status(404).json({ error: 'Competitor not found' });
    }

    const { pages } = req.body;
    if (!pages || pages.length === 0) {
      return res.status(400).json({ error: 'Pages array is required' });
    }

    const created = Page.createMany(req.params.id, pages);
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get pages for competitor
router.get('/:id/pages', (req, res) => {
  try {
    const pages = Page.getAllByCompetitorWithSnapshots(req.params.id);
    res.json(pages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update page
router.put('/:competitorId/pages/:pageId', (req, res) => {
  try {
    const page = Page.findById(req.params.pageId);
    if (!page || page.competitor_id !== parseInt(req.params.competitorId)) {
      return res.status(404).json({ error: 'Page not found' });
    }

    const updated = Page.update(req.params.pageId, req.body);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete page
router.delete('/:competitorId/pages/:pageId', (req, res) => {
  try {
    const page = Page.findById(req.params.pageId);
    if (!page || page.competitor_id !== parseInt(req.params.competitorId)) {
      return res.status(404).json({ error: 'Page not found' });
    }

    Page.delete(req.params.pageId);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check single page
router.post('/:competitorId/pages/:pageId/check', async (req, res) => {
  try {
    const page = Page.findById(req.params.pageId);
    if (!page || page.competitor_id !== parseInt(req.params.competitorId)) {
      return res.status(404).json({ error: 'Page not found' });
    }

    const result = await checkPage(req.params.pageId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
