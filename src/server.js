import express from 'express';
import cookieParser from 'cookie-parser';
import { resolve } from 'path';
import cron from 'node-cron';
import { config } from './utils/config.js';
import competitorsRouter from './routes/competitors.js';
import changesRouter from './routes/changes.js';
import authRouter from './routes/auth.js';
import paymentsRouter from './routes/payments.js';
import { checkAllCompetitors, checkCompetitorsForPlan } from './services/monitor.js';
import { Competitor } from './models/competitor.js';
import { Change } from './models/change.js';
import { User } from './models/user.js';
import { Session } from './models/session.js';
import { requireAuth, requireActiveSubscription } from './middleware/auth.js';

const app = express();

// Cookie parser for session management
app.use(cookieParser());

// JSON parsing - skip for Stripe webhook which needs raw body
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// Static files
app.use(express.static(resolve(process.cwd(), 'public')));

// Public routes - no auth required
app.use('/api/auth', authRouter);
app.use('/api/payments', paymentsRouter);

// Protected routes - auth + active subscription required
app.use('/api/competitors', requireAuth, requireActiveSubscription, competitorsRouter);
app.use('/api/changes', requireAuth, requireActiveSubscription, changesRouter);

app.get('/api/dashboard', requireAuth, requireActiveSubscription, (req, res) => {
  try {
    const competitors = Competitor.getAllWithPages(true, req.user.id);
    const stats = Change.getStatsByUser(req.user.id);
    const recentChanges = Change.findRecentByUser(req.user.id, 7, 10);

    // Count total pages
    const totalPages = competitors.reduce((sum, c) => sum + (c.pages?.length || 0), 0);

    // Get limits for usage display
    const limits = User.getSubscriptionLimits(req.user.id);
    const competitorCount = Competitor.countByUser(req.user.id);

    res.json({
      competitors,
      stats: { ...stats, total_pages: totalPages },
      recentChanges,
      user: {
        name: req.user.name,
        email: req.user.email,
        plan: req.user.plan,
        subscription_status: req.user.subscription_status
      },
      usage: {
        competitors: competitorCount,
        maxCompetitors: limits.maxCompetitors,
        maxPagesPerCompetitor: limits.maxPagesPerCompetitor,
        checkFrequency: limits.checkFrequency
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/check-all', requireAuth, requireActiveSubscription, async (req, res) => {
  try {
    const result = await checkAllCompetitors(req.user.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SPA routing - serve appropriate pages
app.get('/login', (req, res) => {
  res.sendFile(resolve(process.cwd(), 'public', 'login.html'));
});

app.get('/pricing', (req, res) => {
  res.sendFile(resolve(process.cwd(), 'public', 'pricing.html'));
});

app.get('*', (req, res) => {
  res.sendFile(resolve(process.cwd(), 'public', 'index.html'));
});

// Cleanup expired sessions daily
cron.schedule('0 0 * * *', () => {
  console.log('Cleaning up expired sessions...');
  const result = Session.deleteExpired();
  console.log(`Removed ${result.changes} expired sessions`);
});

// Hourly checks for Pro users
cron.schedule('0 * * * *', async () => {
  console.log('Running hourly check for Pro users...');
  try {
    const result = await checkCompetitorsForPlan('pro');
    console.log(`Pro check complete: ${result.checked} pages checked, ${result.changes} changes found`);
  } catch (error) {
    console.error('Hourly Pro check failed:', error);
  }
});

// Daily checks for Starter users at 9am
cron.schedule('0 9 * * *', async () => {
  console.log('Running daily check for Starter users...');
  try {
    const result = await checkCompetitorsForPlan('starter');
    console.log(`Starter check complete: ${result.checked} pages checked, ${result.changes} changes found`);
  } catch (error) {
    console.error('Daily Starter check failed:', error);
  }
});

app.listen(config.port, () => {
  console.log(`Competitor Intel running at http://localhost:${config.port}`);
  console.log('Starter users: daily checks at 9:00 AM');
  console.log('Pro users: hourly checks');
});
