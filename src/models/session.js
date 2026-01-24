import db from './database.js';
import { randomUUID } from 'crypto';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const Session = {
  create(userId) {
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

    const stmt = db.prepare(`
      INSERT INTO sessions (id, user_id, expires_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(id, userId, expiresAt);

    return { id, userId, expiresAt };
  },

  findById(id) {
    const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
    return stmt.get(id);
  },

  findValidById(id) {
    const stmt = db.prepare(`
      SELECT * FROM sessions
      WHERE id = ? AND expires_at > datetime('now')
    `);
    return stmt.get(id);
  },

  delete(id) {
    const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
    return stmt.run(id);
  },

  deleteAllForUser(userId) {
    const stmt = db.prepare('DELETE FROM sessions WHERE user_id = ?');
    return stmt.run(userId);
  },

  deleteExpired() {
    const stmt = db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')");
    return stmt.run();
  },

  extend(id) {
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
    const stmt = db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?');
    stmt.run(expiresAt, id);
    return this.findById(id);
  }
};
