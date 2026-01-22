import { Router } from 'express';
import { Change } from '../models/change.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const limit = parseInt(req.query.limit) || 50;
    const changes = Change.findRecent(days, limit);
    res.json(changes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const stats = Change.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const change = Change.findById(req.params.id);
    if (!change) {
      return res.status(404).json({ error: 'Change not found' });
    }
    res.json(change);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
