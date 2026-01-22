import db from './database.js';

export const Page = {
  create(competitorId, url, label = 'Homepage') {
    const stmt = db.prepare(`
      INSERT INTO pages (competitor_id, url, label)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(competitorId, url, label);
    return this.findById(result.lastInsertRowid);
  },

  createMany(competitorId, pages) {
    const stmt = db.prepare(`
      INSERT INTO pages (competitor_id, url, label)
      VALUES (?, ?, ?)
    `);

    const created = [];
    for (const page of pages) {
      try {
        const result = stmt.run(competitorId, page.url, page.label || 'Homepage');
        created.push(this.findById(result.lastInsertRowid));
      } catch (err) {
        // Skip duplicates
        if (!err.message.includes('UNIQUE constraint')) {
          throw err;
        }
      }
    }
    return created;
  },

  findById(id) {
    return db.prepare('SELECT * FROM pages WHERE id = ?').get(id);
  },

  findByCompetitor(competitorId, activeOnly = true) {
    const query = activeOnly
      ? 'SELECT * FROM pages WHERE competitor_id = ? AND active = 1 ORDER BY label'
      : 'SELECT * FROM pages WHERE competitor_id = ? ORDER BY label';
    return db.prepare(query).all(competitorId);
  },

  findByUrl(competitorId, url) {
    return db.prepare(
      'SELECT * FROM pages WHERE competitor_id = ? AND url = ?'
    ).get(competitorId, url);
  },

  update(id, updates) {
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (['url', 'label', 'active'].includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return this.findById(id);

    values.push(id);

    const stmt = db.prepare(`
      UPDATE pages SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);
    return this.findById(id);
  },

  delete(id) {
    // Delete related snapshots and changes first
    db.prepare('DELETE FROM changes WHERE page_id = ?').run(id);
    db.prepare('DELETE FROM snapshots WHERE page_id = ?').run(id);
    db.prepare('DELETE FROM pages WHERE id = ?').run(id);
  },

  getWithLatestSnapshot(id) {
    return db.prepare(`
      SELECT p.*, s.id as snapshot_id, s.captured_at as last_checked,
             s.content_hash, c.name as competitor_name
      FROM pages p
      JOIN competitors c ON c.id = p.competitor_id
      LEFT JOIN snapshots s ON s.page_id = p.id
        AND s.id = (SELECT MAX(id) FROM snapshots WHERE page_id = p.id)
      WHERE p.id = ?
    `).get(id);
  },

  getAllByCompetitorWithSnapshots(competitorId) {
    return db.prepare(`
      SELECT p.*, s.id as snapshot_id, s.captured_at as last_checked,
             s.content_hash
      FROM pages p
      LEFT JOIN snapshots s ON s.page_id = p.id
        AND s.id = (SELECT MAX(id) FROM snapshots WHERE page_id = p.id)
      WHERE p.competitor_id = ? AND p.active = 1
      ORDER BY p.label
    `).all(competitorId);
  }
};

// Common page templates for Quick Add
export const COMMON_PAGES = [
  { label: 'Homepage', path: '/' },
  { label: 'Pricing', path: '/pricing' },
  { label: 'Features', path: '/features' },
  { label: 'About', path: '/about' },
  { label: 'Blog', path: '/blog' },
  { label: 'Products', path: '/products' },
  { label: 'Solutions', path: '/solutions' },
  { label: 'Contact', path: '/contact' }
];
