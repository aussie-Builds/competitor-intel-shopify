import db from './database.js';

export const Snapshot = {
  create(competitorId, pageId, contentHash, htmlContent, textContent, screenshotPath = null) {
    const stmt = db.prepare(`
      INSERT INTO snapshots (competitor_id, page_id, content_hash, html_content, text_content, screenshot_path)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(competitorId, pageId, contentHash, htmlContent, textContent, screenshotPath);
    return this.findById(result.lastInsertRowid);
  },

  findById(id) {
    return db.prepare('SELECT * FROM snapshots WHERE id = ?').get(id);
  },

  findLatestByPage(pageId) {
    return db.prepare(`
      SELECT * FROM snapshots
      WHERE page_id = ?
      ORDER BY captured_at DESC
      LIMIT 1
    `).get(pageId);
  },

  findByPage(pageId, limit = 10) {
    return db.prepare(`
      SELECT * FROM snapshots
      WHERE page_id = ?
      ORDER BY captured_at DESC
      LIMIT ?
    `).all(pageId, limit);
  },

  findByCompetitor(competitorId, limit = 10) {
    return db.prepare(`
      SELECT s.*, p.label as page_label, p.url as page_url
      FROM snapshots s
      LEFT JOIN pages p ON p.id = s.page_id
      WHERE s.competitor_id = ?
      ORDER BY s.captured_at DESC
      LIMIT ?
    `).all(competitorId, limit);
  },

  findPreviousByPage(pageId, beforeId) {
    return db.prepare(`
      SELECT * FROM snapshots
      WHERE page_id = ? AND id < ?
      ORDER BY id DESC
      LIMIT 1
    `).get(pageId, beforeId);
  },

  deleteOldByPage(pageId, keepCount = 30) {
    const snapshots = db.prepare(`
      SELECT id FROM snapshots
      WHERE page_id = ?
      ORDER BY captured_at DESC
    `).all(pageId);

    if (snapshots.length > keepCount) {
      const toDelete = snapshots.slice(keepCount).map(s => s.id);
      db.prepare(`
        DELETE FROM changes WHERE old_snapshot_id IN (${toDelete.join(',')})
          OR new_snapshot_id IN (${toDelete.join(',')})
      `).run();
      db.prepare(`
        DELETE FROM snapshots WHERE id IN (${toDelete.join(',')})
      `).run();
    }
  },

  findLastTwoWithScreenshots(pageId) {
    return db.prepare(`
      SELECT id, competitor_id, page_id, content_hash, screenshot_path, captured_at
      FROM snapshots
      WHERE page_id = ? AND screenshot_path IS NOT NULL
      ORDER BY captured_at DESC
      LIMIT 2
    `).all(pageId);
  },

  getScreenshotPair(changeId) {
    return db.prepare(`
      SELECT
        c.id as change_id,
        old_s.screenshot_path as old_screenshot,
        old_s.captured_at as old_captured_at,
        new_s.screenshot_path as new_screenshot,
        new_s.captured_at as new_captured_at
      FROM changes c
      LEFT JOIN snapshots old_s ON old_s.id = c.old_snapshot_id
      LEFT JOIN snapshots new_s ON new_s.id = c.new_snapshot_id
      WHERE c.id = ?
    `).get(changeId);
  }
};
