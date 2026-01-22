import express from 'express';
import { resolve } from 'path';
import cron from 'node-cron';
import { config } from './utils/config.js';
import competitorsRouter from './routes/competitors.js';
import changesRouter from './routes/changes.js';
import { checkAllCompetitors } from './services/monitor.js';
import { Competitor } from './models/competitor.js';
import { Change } from './models/change.js';
import { Snapshot } from './models/snapshot.js';

const app = express();

app.use(express.json());
app.use(express.static(resolve(process.cwd(), 'public')));
app.use('/screenshots', express.static(resolve(process.cwd(), 'snapshots')));

app.use('/api/competitors', competitorsRouter);
app.use('/api/changes', changesRouter);

app.get('/api/dashboard', (req, res) => {
  try {
    const competitors = Competitor.getAllWithPages();
    const stats = Change.getStats();
    const recentChanges = Change.findRecent(7, 10);

    // Count total pages
    const totalPages = competitors.reduce((sum, c) => sum + (c.pages?.length || 0), 0);

    res.json({
      competitors,
      stats: { ...stats, total_pages: totalPages },
      recentChanges
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/check-all', async (req, res) => {
  try {
    const result = await checkAllCompetitors();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/changes/:id/screenshots', (req, res) => {
  try {
    const pair = Snapshot.getScreenshotPair(req.params.id);
    if (!pair) {
      return res.status(404).json({ error: 'Change not found' });
    }
    res.json({
      old: pair.old_screenshot ? {
        url: `/screenshots/${pair.old_screenshot.split('/').pop()}`,
        captured_at: pair.old_captured_at
      } : null,
      new: pair.new_screenshot ? {
        url: `/screenshots/${pair.new_screenshot.split('/').pop()}`,
        captured_at: pair.new_captured_at
      } : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(resolve(process.cwd(), 'public', 'index.html'));
});

cron.schedule('0 9 * * *', async () => {
  console.log('Running scheduled competitor check...');
  try {
    const result = await checkAllCompetitors();
    console.log(`Scheduled check complete: ${result.checked} pages checked, ${result.changes} changes found`);
  } catch (error) {
    console.error('Scheduled check failed:', error);
  }
});

app.listen(config.port, () => {
  console.log(`Competitor Intel running at http://localhost:${config.port}`);
  console.log('Daily checks scheduled for 9:00 AM');
});
