import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { mkdirSync } from 'fs';

const dbPath = resolve(process.cwd(), 'data', 'competitor-intel.db');

// Ensure data directory exists
mkdirSync(dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

// Check if we need to migrate (old schema has url on competitors)
const tableInfo = db.prepare("PRAGMA table_info(competitors)").all();
const hasUrlColumn = tableInfo.some(col => col.name === 'url');

if (hasUrlColumn) {
  console.log('[DB] Migrating to multi-page schema...');

  // Create new pages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competitor_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      label TEXT DEFAULT 'Homepage',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (competitor_id) REFERENCES competitors(id),
      UNIQUE(competitor_id, url)
    );
  `);

  // Migrate existing data: create pages from competitors
  const existingCompetitors = db.prepare('SELECT id, url FROM competitors WHERE url IS NOT NULL').all();
  const insertPage = db.prepare('INSERT OR IGNORE INTO pages (competitor_id, url, label) VALUES (?, ?, ?)');

  for (const comp of existingCompetitors) {
    insertPage.run(comp.id, comp.url, 'Homepage');
  }

  // Update snapshots to reference pages instead of competitors
  db.exec(`
    ALTER TABLE snapshots ADD COLUMN page_id INTEGER REFERENCES pages(id);
  `);

  // Link existing snapshots to their pages
  db.exec(`
    UPDATE snapshots SET page_id = (
      SELECT p.id FROM pages p WHERE p.competitor_id = snapshots.competitor_id LIMIT 1
    ) WHERE page_id IS NULL;
  `);

  // Update changes to reference pages
  db.exec(`
    ALTER TABLE changes ADD COLUMN page_id INTEGER REFERENCES pages(id);
  `);

  db.exec(`
    UPDATE changes SET page_id = (
      SELECT p.id FROM pages p WHERE p.competitor_id = changes.competitor_id LIMIT 1
    ) WHERE page_id IS NULL;
  `);

  // Remove url column from competitors (SQLite doesn't support DROP COLUMN easily, so we recreate)
  db.exec(`
    CREATE TABLE competitors_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      check_frequency TEXT DEFAULT 'daily',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    INSERT INTO competitors_new (id, name, check_frequency, active, created_at, updated_at)
    SELECT id, name, check_frequency, active, created_at, updated_at FROM competitors;

    DROP TABLE competitors;
    ALTER TABLE competitors_new RENAME TO competitors;
  `);

  console.log('[DB] Migration complete');
} else {
  // Fresh install or already migrated - create tables if needed
  db.exec(`
    CREATE TABLE IF NOT EXISTS competitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      check_frequency TEXT DEFAULT 'daily',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competitor_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      label TEXT DEFAULT 'Homepage',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (competitor_id) REFERENCES competitors(id),
      UNIQUE(competitor_id, url)
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competitor_id INTEGER NOT NULL,
      page_id INTEGER,
      content_hash TEXT NOT NULL,
      html_content TEXT,
      text_content TEXT,
      screenshot_path TEXT,
      captured_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (competitor_id) REFERENCES competitors(id),
      FOREIGN KEY (page_id) REFERENCES pages(id)
    );

    CREATE TABLE IF NOT EXISTS changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competitor_id INTEGER NOT NULL,
      page_id INTEGER,
      old_snapshot_id INTEGER,
      new_snapshot_id INTEGER NOT NULL,
      change_summary TEXT,
      ai_analysis TEXT,
      significance TEXT DEFAULT 'medium',
      notified INTEGER DEFAULT 0,
      detected_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (competitor_id) REFERENCES competitors(id),
      FOREIGN KEY (page_id) REFERENCES pages(id),
      FOREIGN KEY (old_snapshot_id) REFERENCES snapshots(id),
      FOREIGN KEY (new_snapshot_id) REFERENCES snapshots(id)
    );

    CREATE INDEX IF NOT EXISTS idx_pages_competitor ON pages(competitor_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_competitor ON snapshots(competitor_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_page ON snapshots(page_id);
    CREATE INDEX IF NOT EXISTS idx_changes_competitor ON changes(competitor_id);
    CREATE INDEX IF NOT EXISTS idx_changes_page ON changes(page_id);
    CREATE INDEX IF NOT EXISTS idx_changes_detected ON changes(detected_at);
  `);
}

export default db;
