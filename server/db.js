const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 业务表完整结构 v2（公司 → 投递 → 节点 → 笔记/提醒）
const BUSINESS_SCHEMA = {
  companies: `CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    channel TEXT DEFAULT '',
    link TEXT DEFAULT '',
    referral_code TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  applications: `CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
    position TEXT DEFAULT '',
    department TEXT DEFAULT '',
    city TEXT DEFAULT '',
    salary TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    status TEXT DEFAULT '已投递',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  milestones: `CREATE TABLE IF NOT EXISTS milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    result TEXT DEFAULT 'none',
    date TEXT DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  notes: `CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    milestone_id INTEGER REFERENCES milestones(id) ON DELETE CASCADE,
    space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
    title TEXT DEFAULT '',
    content TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  reminders: `CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
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

function tableCols(table) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => c.name);
}

function hasTable(table) {
  return !!db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
}

function ensureLegacySpaceIds() {
  // 旧版业务数据挂在 user_id 上：为其找到（或创建）所属空间
  if (!hasTable('companies_old')) return;
  const users = db.prepare('SELECT id FROM users').all();
  for (const u of users) {
    let space = db.prepare('SELECT * FROM spaces WHERE user_id = ? ORDER BY id LIMIT 1').get(u.id);
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
    const cols = tableCols('companies_old');
    if (!cols.includes('user_id')) continue;
    db.prepare('UPDATE companies_old SET space_id = ? WHERE user_id = ? AND space_id IS NULL').run(
      space.id,
      u.id
    );
  }
}

function rebuildBusinessTable(table, createSql) {
  const cols = tableCols(table);
  const need =
    table === 'milestones'
      ? !cols.includes('application_id') || !cols.includes('result')
      : table === 'notes' || table === 'reminders'
      ? !cols.includes('application_id')
      : false;
  if (!need) return;
  console.log(`[db] 检测到旧版 ${table} 结构，重建（旧投递级数据按迁移策略丢弃）…`);
  db.pragma('foreign_keys = OFF');
  try {
    db.exec(`ALTER TABLE ${table} RENAME TO ${table}_old`);
    db.exec(createSql);
    db.exec(`DROP TABLE ${table}_old`);
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

// ===== v1 → v2 迁移：companies 重构为纯公司 =====
if (hasTable('companies') && !tableCols('companies').includes('name')) {
  console.log('[db] 检测到旧版 companies 结构，迁移为「公司 → 投递」模型…');
  db.pragma('foreign_keys = OFF');
  try {
    db.exec('ALTER TABLE companies RENAME TO companies_old');
    ensureLegacySpaceIds();
    db.exec(BUSINESS_SCHEMA.companies);
    const rows = db.prepare('SELECT * FROM companies_old').all();
    const ts = new Date().toISOString();
    const insert = db.prepare(
      `INSERT INTO companies (space_id, name, channel, link, referral_code, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const findCompany = db.prepare('SELECT id, notes FROM companies WHERE space_id = ? AND name = ?');
    const mergeNotes = db.prepare('UPDATE companies SET notes = ? WHERE id = ?');
    for (const r of rows) {
      if (!r.space_id) continue;
      const name = String(r.company || '').trim();
      if (!name) continue;
      const exist = findCompany.get(r.space_id, name);
      if (exist) {
        const extra = String(r.notes || '').trim();
        if (extra && !String(exist.notes || '').includes(extra)) {
          mergeNotes.run(`${exist.notes ? exist.notes + '\n' : ''}${extra}`, exist.id);
        }
        continue;
      }
      insert.run(
        r.space_id,
        name,
        r.channel || '',
        r.link || '',
        r.referral_code || '',
        r.notes || '',
        r.created_at || ts,
        ts
      );
    }
    db.exec('DROP TABLE companies_old');
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

// applications：全新表，直接创建
db.exec(BUSINESS_SCHEMA.applications);

// milestones / notes / reminders：旧结构（company_id）→ 新结构（application_id）
if (hasTable('milestones')) rebuildBusinessTable('milestones', BUSINESS_SCHEMA.milestones);
if (hasTable('notes')) rebuildBusinessTable('notes', BUSINESS_SCHEMA.notes);
if (hasTable('reminders')) rebuildBusinessTable('reminders', BUSINESS_SCHEMA.reminders);

// 兼容旧库：文献字段补充类型列
try {
  const cols = tableCols('literature_fields');
  if (!cols.includes('type')) db.exec("ALTER TABLE literature_fields ADD COLUMN type TEXT DEFAULT 'text'");
  if (!cols.includes('description')) db.exec("ALTER TABLE literature_fields ADD COLUMN description TEXT DEFAULT ''");
  if (!cols.includes('options')) db.exec("ALTER TABLE literature_fields ADD COLUMN options TEXT DEFAULT ''");
} catch (e) {
  console.error('[db] literature_fields.type 迁移失败:', e.message);
}

// 迁移完成后统一建索引
try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_applications_company ON applications(company_id);
    CREATE INDEX IF NOT EXISTS idx_applications_space ON applications(space_id);
    CREATE INDEX IF NOT EXISTS idx_companies_space ON companies(space_id);
    CREATE INDEX IF NOT EXISTS idx_milestones_application ON milestones(application_id);
    CREATE INDEX IF NOT EXISTS idx_notes_application ON notes(application_id);
    CREATE INDEX IF NOT EXISTS idx_notes_milestone ON notes(milestone_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_application ON reminders(application_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
    CREATE INDEX IF NOT EXISTS idx_lit_papers_space ON literature_papers(space_id);
    CREATE INDEX IF NOT EXISTS idx_lit_fields_space ON literature_fields(space_id);
    CREATE INDEX IF NOT EXISTS idx_lit_analyses_paper ON literature_analyses(paper_id);
  `);
} catch (e) {
  console.error('[db] 索引创建失败:', e.message);
}

module.exports = db;
