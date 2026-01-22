import db from './database.js';
import { Page } from './page.js';

export const Competitor = {
  create(name, checkFrequency = 'daily') {
    const stmt = db.prepare(`
      INSERT INTO competitors (name, check_frequency)
      VALUES (?, ?)
    `);
    const result = stmt.run(name, checkFrequency);
    return this.findById(result.lastInsertRowid);
  },

  createWithPages(name, pages, checkFrequency = 'daily') {
    const competitor = this.create(name, checkFrequency);

    if (pages && pages.length > 0) {
      Page.createMany(competitor.id, pages);
    }

    return this.getWithPages(competitor.id);
  },

  findById(id) {
    return db.prepare('SELECT * FROM competitors WHERE id = ?').get(id);
  },

  findAll(activeOnly = true) {
    const query = activeOnly
      ? 'SELECT * FROM competitors WHERE active = 1 ORDER BY name'
      : 'SELECT * FROM competitors ORDER BY name';
    return db.prepare(query).all();
  },

  getWithPages(id) {
    const competitor = this.findById(id);
    if (!competitor) return null;

    competitor.pages = Page.getAllByCompetitorWithSnapshots(id);
    return competitor;
  },

  getAllWithPages(activeOnly = true) {
    const competitors = this.findAll(activeOnly);

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
