import db from './database.js';

export const Change = {
  create(competitorId, pageId, oldSnapshotId, newSnapshotId, changeSummary, aiAnalysis, significance = 'medium') {
    const stmt = db.prepare(`
      INSERT INTO changes (competitor_id, page_id, old_snapshot_id, new_snapshot_id, change_summary, ai_analysis, significance)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(competitorId, pageId, oldSnapshotId, newSnapshotId, changeSummary, aiAnalysis, significance);
    return this.findById(result.lastInsertRowid);
  },

  findById(id) {
    return db.prepare(`
      SELECT ch.*, p.label as page_label, p.url as page_url, c.name as competitor_name
      FROM changes ch
      LEFT JOIN pages p ON p.id = ch.page_id
      LEFT JOIN competitors c ON c.id = ch.competitor_id
      WHERE ch.id = ?
    `).get(id);
  },

  findByCompetitor(competitorId, limit = 20) {
    return db.prepare(`
      SELECT ch.*, p.label as page_label, p.url as page_url
      FROM changes ch
      LEFT JOIN pages p ON p.id = ch.page_id
      WHERE ch.competitor_id = ?
      ORDER BY ch.detected_at DESC
      LIMIT ?
    `).all(competitorId, limit);
  },

  findByPage(pageId, limit = 20) {
    return db.prepare(`
      SELECT * FROM changes
      WHERE page_id = ?
      ORDER BY detected_at DESC
      LIMIT ?
    `).all(pageId, limit);
  },

  findRecent(days = 7, limit = 50) {
    return db.prepare(`
      SELECT ch.*, c.name as competitor_name, p.label as page_label, p.url as page_url
      FROM changes ch
      JOIN competitors c ON c.id = ch.competitor_id
      LEFT JOIN pages p ON p.id = ch.page_id
      WHERE ch.detected_at >= datetime('now', '-' || ? || ' days')
      ORDER BY ch.detected_at DESC
      LIMIT ?
    `).all(days, limit);
  },

  findUnnotified() {
    return db.prepare(`
      SELECT ch.*, c.name as competitor_name, p.label as page_label, p.url as page_url
      FROM changes ch
      JOIN competitors c ON c.id = ch.competitor_id
      LEFT JOIN pages p ON p.id = ch.page_id
      WHERE ch.notified = 0
      ORDER BY ch.detected_at DESC
    `).all();
  },

  markNotified(id) {
    db.prepare('UPDATE changes SET notified = 1 WHERE id = ?').run(id);
  },

  markManyNotified(ids) {
    if (ids.length === 0) return;
    db.prepare(`UPDATE changes SET notified = 1 WHERE id IN (${ids.join(',')})`).run();
  },

  getStats() {
    return db.prepare(`
      SELECT
        COUNT(*) as total_changes,
        SUM(CASE WHEN detected_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END) as changes_24h,
        SUM(CASE WHEN detected_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as changes_7d,
        SUM(CASE WHEN significance = 'high' THEN 1 ELSE 0 END) as high_significance
      FROM changes
    `).get();
  }
};
