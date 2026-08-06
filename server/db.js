const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  is_admin INTEGER DEFAULT 0,
  email TEXT DEFAULT '',
  silence_days TEXT DEFAULT '14',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  position TEXT DEFAULT '',
  department TEXT DEFAULT '',
  city TEXT DEFAULT '',
  salary TEXT DEFAULT '',
  channel TEXT DEFAULT '',
  link TEXT DEFAULT '',
  referral_code TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT DEFAULT '未投递',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  milestone_id INTEGER REFERENCES milestones(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title TEXT DEFAULT '',
  content TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  milestone_id INTEGER REFERENCES milestones(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  email TEXT DEFAULT '',
  remind_at TEXT DEFAULT '',
  remind_value TEXT DEFAULT '',
  remind_unit TEXT DEFAULT 'day',
  sent INTEGER DEFAULT 0,
  kind TEXT DEFAULT 'milestone',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);

`);

// 兼容旧库：为业务表补充 user_id 归属字段
try {
  const tables = [
    ['companies', 'user_id'],
    ['milestones', 'user_id'],
    ['notes', 'user_id'],
    ['reminders', 'user_id'],
  ];
  for (const [table, col] of tables) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(col)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} INTEGER REFERENCES users(id) ON DELETE CASCADE`);
    }
  }
} catch (e) {
  console.error('[db] user_id 迁移失败:', e.message);
}

// 兼容旧库：为 reminders 补充提醒偏移字段
try {
  const reminderCols = db.prepare('PRAGMA table_info(reminders)').all().map((c) => c.name);
  if (!reminderCols.includes('remind_value')) {
    db.exec("ALTER TABLE reminders ADD COLUMN remind_value TEXT DEFAULT ''");
  }
  if (!reminderCols.includes('remind_unit')) {
    db.exec("ALTER TABLE reminders ADD COLUMN remind_unit TEXT DEFAULT 'day'");
  }
} catch (e) {
  console.error('[db] 提醒字段迁移失败:', e.message);
}

// 迁移完成后统一建索引（部分索引依赖 user_id 列）
try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_milestones_company ON milestones(company_id);
    CREATE INDEX IF NOT EXISTS idx_notes_company ON notes(company_id);
    CREATE INDEX IF NOT EXISTS idx_notes_milestone ON notes(milestone_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_company ON reminders(company_id);
    CREATE INDEX IF NOT EXISTS idx_companies_user ON companies(user_id);
    CREATE INDEX IF NOT EXISTS idx_milestones_user ON milestones(user_id);
    CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
  `);
} catch (e) {
  console.error('[db] 索引创建失败:', e.message);
}

module.exports = db;
