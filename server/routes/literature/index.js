const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../../db');
const auth = require('../../auth');

const papers = require('./papers');
const analysis = require('./analysis');
const exportRouter = require('./export');

const router = express.Router();

const DEFAULT_FIELDS = [
  ['title', '标题', 'text'],
  ['authors', '作者', 'text'],
  ['pub_date', '发表时间', 'date'],
  ['source', '来源/期刊', 'text'],
  ['methods', '研究方法', 'text'],
  ['questions', '研究问题', 'text'],
  ['conclusions', '核心结论', 'text'],
  ['innovations', '创新点', 'text'],
  ['limitations', '局限性', 'text'],
];

const FIELD_TYPES = ['text', 'date', 'boolean', 'number', 'category', 'multi', 'year', 'month'];

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'literature');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function mask(value) {
  if (!value) return '';
  if (value.length <= 6) return '******';
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

// 首次使用某空间时写入默认字段
function ensureFields(spaceId) {
  const count = db
    .prepare('SELECT COUNT(*) AS n FROM literature_fields WHERE space_id = ?')
    .get(spaceId).n;
  if (count > 0) return;
  const ts = new Date().toISOString();
  const insert = db.prepare(
    'INSERT INTO literature_fields (space_id, field_key, label, type, description, options, enabled, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)'
  );
  DEFAULT_FIELDS.forEach(([key, label, type], i) =>
    insert.run(spaceId, key, label, type, '', '', i, ts)
  );
}

router.use(auth.requireSpace);
router.use((req, res, next) => {
  ensureFields(req.spaceId);
  syncDefaultFields(req.spaceId);
  req.litUploadDir = UPLOAD_DIR;
  next();
});

// 预设字段同步：已存在空间的旧预设字段也跟随最新默认值
function syncDefaultFields(spaceId) {
  const rows = db
    .prepare('SELECT id, field_key FROM literature_fields WHERE space_id = ?')
    .all(spaceId);
  for (const r of rows) {
    if (r.field_key === 'year') {
      db.prepare(
        "UPDATE literature_fields SET label = '发表时间', type = 'date' WHERE id = ?"
      ).run(r.id);
    } else if (r.field_key === 'notes' || r.field_key === 'tags') {
      db.prepare('DELETE FROM literature_fields WHERE id = ?').run(r.id);
    }
  }
}

router.use('/papers', papers);
router.use('/analysis', analysis);
router.use('/export', exportRouter);

// 文献工具独立的 AI 服务配置：每个用户（空间）配置自己的，互不影响
router.get('/settings', (req, res) => {
  const row = db
    .prepare('SELECT * FROM literature_ai_config WHERE space_id = ?')
    .get(req.spaceId);
  const out = {
    ai_provider: (row && row.ai_provider) || 'deepseek',
    ai_base_url: (row && row.ai_base_url) || '',
    ai_model: (row && row.ai_model) || '',
    ai_api_key: row && row.ai_api_key ? mask(row.ai_api_key) : '',
  };
  res.json(out);
});

router.put('/settings', (req, res) => {
  const body = req.body || {};
  const current = db
    .prepare('SELECT * FROM literature_ai_config WHERE space_id = ?')
    .get(req.spaceId);
  const apiKey =
    body.ai_api_key && !String(body.ai_api_key).startsWith('****')
      ? String(body.ai_api_key)
      : current && current.ai_api_key
      ? current.ai_api_key
      : '';
  const provider = body.ai_provider !== undefined ? String(body.ai_provider) : (current && current.ai_provider) || 'deepseek';
  const base = body.ai_base_url !== undefined ? String(body.ai_base_url) : (current && current.ai_base_url) || '';
  const model = body.ai_model !== undefined ? String(body.ai_model) : (current && current.ai_model) || '';
  db.prepare(
    `INSERT INTO literature_ai_config (space_id, ai_provider, ai_base_url, ai_model, ai_api_key, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(space_id) DO UPDATE SET
       ai_provider = excluded.ai_provider,
       ai_base_url = excluded.ai_base_url,
       ai_model = excluded.ai_model,
       ai_api_key = excluded.ai_api_key,
       updated_at = excluded.updated_at`
  ).run(req.spaceId, provider, base, model, apiKey, new Date().toISOString());
  res.json({
    ai_provider: provider,
    ai_base_url: base,
    ai_model: model,
    ai_api_key: apiKey ? mask(apiKey) : '',
  });
});

// 字段配置
router.get('/fields', (req, res) => {
  const rows = db
    .prepare(
      'SELECT id, field_key, label, type, description, options, enabled, sort FROM literature_fields WHERE space_id = ? ORDER BY sort, id'
    )
    .all(req.spaceId);
  res.json(rows);
});

router.put('/fields', (req, res) => {
  const list = Array.isArray(req.body.fields) ? req.body.fields : null;
  if (!list) return res.status(400).json({ error: '字段列表格式不正确' });
  const ts = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM literature_fields WHERE space_id = ?').run(req.spaceId);
  const insert = db.prepare(
      'INSERT INTO literature_fields (space_id, field_key, label, type, description, options, enabled, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    list.forEach((f, i) => {
      const key = String(f.field_key || '').trim();
      const label = String(f.label || '').trim();
      if (!key || !label) return;
      const type = FIELD_TYPES.includes(f.type) ? f.type : 'text';
      insert.run(
        req.spaceId,
        key,
        label,
        type,
        String(f.description || ''),
        String(f.options || ''),
        f.enabled ? 1 : 0,
        i,
        ts
      );
    });
  });
  tx();
  res.json(
    db
      .prepare(
        'SELECT id, field_key, label, type, description, options, enabled, sort FROM literature_fields WHERE space_id = ? ORDER BY sort, id'
      )
      .all(req.spaceId)
  );
});

module.exports = router;
