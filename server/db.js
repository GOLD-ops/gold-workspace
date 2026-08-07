const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 业务表完整结构（自动重建迁移时复用）
const BUSINESS_SCHEMA = {
  companies: `CREATE TABLE companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
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
  )`,
  milestones: `CREATE TABLE milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    date TEXT DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  notes: `CREATE TABLE notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    milestone_id INTEGER REFERENCES milestones(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
    title TEXT DEFAULT '',
    content TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  reminders: `CREATE TABLE reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    milestone_id INTEGER REFERENCES milestones(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
    email TEXT DEFAULT '',
    remind_at TEXT DEFAULT '',
    remind_value TEXT DEFAULT '',
    remind_unit TEXT DEFAULT 'day',
    sent INTEGER DEFAULT 0,
    kind TEXT DEFAULT 'milestone',
    created_at TEXT NOT NULL
  )`,
};

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

CREATE TABLE IF NOT EXISTS spaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
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
  space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  milestone_id INTEGER REFERENCES milestones(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
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
  space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS literature_papers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  file_size INTEGER DEFAULT 0,
  file_type TEXT DEFAULT '',
  text_status TEXT DEFAULT 'pending',
  text_path TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  error TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS literature_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT DEFAULT 'text',
  description TEXT DEFAULT '',
  options TEXT DEFAULT '',
  enabled INTEGER DEFAULT 1,
  sort INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS literature_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id INTEGER NOT NULL REFERENCES literature_papers(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  value TEXT DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS literature_ai_config (
  space_id INTEGER PRIMARY KEY REFERENCES spaces(id) ON DELETE CASCADE,
  ai_provider TEXT DEFAULT 'deepseek',
  ai_base_url TEXT DEFAULT '',
  ai_model TEXT DEFAULT '',
  ai_api_key TEXT DEFAULT '',
  updated_at TEXT NOT NULL
);

`);

// 兼容旧库：文献字段补充类型列
try {
  const cols = db.prepare('PRAGMA table_info(literature_fields)').all().map((c) => c.name);
  if (!cols.includes('type')) {
    db.exec("ALTER TABLE literature_fields ADD COLUMN type TEXT DEFAULT 'text'");
  }
  if (!cols.includes('description')) {
    db.exec("ALTER TABLE literature_fields ADD COLUMN description TEXT DEFAULT ''");
  }
  if (!cols.includes('options')) {
    db.exec("ALTER TABLE literature_fields ADD COLUMN options TEXT DEFAULT ''");
  }
} catch (e) {
  console.error('[db] literature_fields.type 迁移失败:', e.message);
}

// 兼容旧库：为业务表补充归属字段（user_id / space_id）
try {
  const tables = [
    ['companies', 'user_id', 'users'],
    ['milestones', 'user_id', 'users'],
    ['notes', 'user_id', 'users'],
    ['reminders', 'user_id', 'users'],
    ['companies', 'space_id', 'spaces'],
    ['milestones', 'space_id', 'spaces'],
    ['notes', 'space_id', 'spaces'],
    ['reminders', 'space_id', 'spaces'],
  ];
  for (const [table, col, refTable] of tables) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(col)) {
      db.exec(
        `ALTER TABLE ${table} ADD COLUMN ${col} INTEGER REFERENCES ${refTable}(id) ON DELETE CASCADE`
      );
    }
  }
} catch (e) {
  console.error('[db] user_id 迁移失败:', e.message);
}

// 兼容旧库：把历史数据归入空间（每个有数据的用户一个空间）
try {
  const users = db.prepare('SELECT id FROM users').all();
  for (const u of users) {
    const hasData = db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM companies WHERE user_id = ?) +
                (SELECT COUNT(*) FROM milestones WHERE user_id = ?) +
                (SELECT COUNT(*) FROM notes WHERE user_id = ?) +
                (SELECT COUNT(*) FROM reminders WHERE user_id = ?) AS n`
      )
      .get(u.id, u.id, u.id, u.id).n;
    if (!hasData) continue;
    let space = db.prepare('SELECT * FROM spaces WHERE user_id = ? LIMIT 1').get(u.id);
    if (!space) {
      const r = db
        .prepare('INSERT INTO spaces (token, user_id, created_at) VALUES (?, ?, ?)')
        .run(
          require('crypto').randomBytes(16).toString('hex'),
          u.id,
          new Date().toISOString()
        );
      space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(r.lastInsertRowid);
    }
    for (const table of ['companies', 'milestones', 'notes', 'reminders']) {
      db.prepare(`UPDATE ${table} SET space_id = ? WHERE user_id = ? AND space_id IS NULL`).run(
        space.id,
        u.id
      );
    }
  }
  // 无主数据归入第一个空间（如有）
  const orphan = db
    .prepare('SELECT COUNT(*) AS n FROM companies WHERE space_id IS NULL')
    .get().n;
  if (orphan > 0) {
    const anySpace = db.prepare('SELECT id FROM spaces ORDER BY id LIMIT 1').get();
    if (anySpace) {
      for (const table of ['companies', 'milestones', 'notes', 'reminders']) {
        db.prepare(`UPDATE ${table} SET space_id = ? WHERE space_id IS NULL`).run(anySpace.id);
      }
    }
  }
} catch (e) {
  console.error('[db] 空间迁移失败:', e.message);
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

// 自动修复：若 space_id 外键错误地指向 users（早期版本迁移缺陷），重建业务表
try {
  const wrongFk = db
    .prepare('PRAGMA foreign_key_list(companies)')
    .all()
    .some((f) => f.from === 'space_id' && f.table !== 'spaces');
  if (wrongFk) {
    console.log('[db] 检测到 space_id 外键错误，正在重建业务表…');
    db.pragma('foreign_keys = OFF');
    try {
      for (const t of ['companies', 'milestones', 'notes', 'reminders']) {
        db.exec(`ALTER TABLE ${t} RENAME TO ${t}_old`);
        db.exec(BUSINESS_SCHEMA[t]);
        const cols = db
          .prepare(`PRAGMA table_info(${t}_old)`)
          .all()
          .map((c) => c.name)
          .join(', ');
        db.exec(`INSERT INTO ${t} (${cols}) SELECT ${cols} FROM ${t}_old`);
        db.exec(`DROP TABLE ${t}_old`);
      }
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }
} catch (e) {
  console.error('[db] 业务表重建失败:', e.message);
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
    CREATE INDEX IF NOT EXISTS idx_companies_space ON companies(space_id);
    CREATE INDEX IF NOT EXISTS idx_milestones_space ON milestones(space_id);
    CREATE INDEX IF NOT EXISTS idx_notes_space ON notes(space_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_space ON reminders(space_id);
    CREATE INDEX IF NOT EXISTS idx_lit_papers_space ON literature_papers(space_id);
    CREATE INDEX IF NOT EXISTS idx_lit_fields_space ON literature_fields(space_id);
    CREATE INDEX IF NOT EXISTS idx_lit_analyses_paper ON literature_analyses(paper_id);
  `);
} catch (e) {
  console.error('[db] 索引创建失败:', e.message);
}

module.exports = db;
