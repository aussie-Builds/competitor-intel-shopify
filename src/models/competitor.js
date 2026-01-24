import db from './database.js';
import { Page } from './page.js';

export const Competitor = {
  create(name, checkFrequency = 'daily', userId = null) {
    const stmt = db.prepare(`
      INSERT INTO competitors (name, check_frequency, user_id)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(name, checkFrequency, userId);
    return this.findById(result.lastInsertRowid);
  },

  createWithPages(name, pages, checkFrequency = 'daily', userId = null) {
    const competitor = this.create(name, checkFrequency, userId);

    if (pages && pages.length > 0) {
      Page.createMany(competitor.id, pages);
    }

    return this.getWithPages(competitor.id);
  },

  findById(id) {
    return db.prepare('SELECT * FROM competitors WHERE id = ?').get(id);
  },

  findByIdAndUser(id, userId) {
    return db.prepare('SELECT * FROM competitors WHERE id = ? AND user_id = ?').get(id, userId);
  },

  findAll(activeOnly = true, userId = null) {
    let query = activeOnly
      ? 'SELECT * FROM competitors WHERE active = 1'
      : 'SELECT * FROM competitors WHERE 1=1';

    if (userId) {
      query += ' AND user_id = ?';
      return db.prepare(query + ' ORDER BY name').all(userId);
    }

    return db.prepare(query + ' ORDER BY name').all();
  },

  getWithPages(id) {
    const competitor = this.findById(id);
    if (!competitor) return null;

    competitor.pages = Page.getAllByCompetitorWithSnapshots(id);
    return competitor;
  },

  getAllWithPages(activeOnly = true, userId = null) {
    const competitors = this.findAll(activeOnly, userId);

    return competitors.map(comp => {
      comp.pages = Page.getAllByCompetitorWithSnapshots(comp.id);
      comp.page_count = comp.pages.length;
      comp.last_checked = comp.pages.reduce((latest, page) => {
        if (!page.last_checked) return latest;
        if (!latest) return page.last_checked;
        return page.last_checked > latest ? page.last_checked : latest;
      }, null);
      return comp;
    });
  },

  getAllByPlan(plan) {
    // Get all active competitors for users with a specific plan
    return db.prepare(`
      SELECT c.* FROM competitors c
      JOIN users u ON u.id = c.user_id
      WHERE c.active = 1 AND u.plan = ? AND u.subscription_status = 'active'
      ORDER BY c.name
    `).all(plan);
  },

  countByUser(userId) {
    const result = db.prepare('SELECT COUNT(*) as count FROM competitors WHERE user_id = ? AND active = 1').get(userId);
    return result.count;
  },

  update(id, updates) {
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (['name', 'check_frequency', 'active'].includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return this.findById(id);

    fields.push("updated_at = datetime('now')");
    values.push(id);

    const stmt = db.prepare(`
      UPDATE competitors SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);
    return this.findById(id);
  },

  delete(id) {
    // Delete all pages (which cascades to snapshots and changes)
    const pages = Page.findByCompetitor(id, false);
    for (const page of pages) {
      Page.delete(page.id);
    }

    // Delete any orphaned snapshots/changes that reference competitor directly
    db.prepare('DELETE FROM changes WHERE competitor_id = ?').run(id);
    db.prepare('DELETE FROM snapshots WHERE competitor_id = ?').run(id);
    db.prepare('DELETE FROM competitors WHERE id = ?').run(id);
  },

  getStats(id) {
    return db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM pages WHERE competitor_id = ? AND active = 1) as page_count,
        (SELECT COUNT(*) FROM changes WHERE competitor_id = ?) as total_changes,
        (SELECT COUNT(*) FROM changes WHERE competitor_id = ? AND detected_at >= datetime('now', '-7 days')) as changes_7d
    `).get(id, id, id);
  }
};
