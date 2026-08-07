const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const db = require('../../db');
const { extractText } = require('../../text-extract');

const router = express.Router();
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, req.litUploadDir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 10);
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 300 },
  defParamCharset: 'utf8', // 修复中文文件名的编码问题
});

const ALLOWED_EXT = ['.pdf', '.txt', '.md', '.markdown'];

function nowIso() {
  return new Date().toISOString();
}

function paperPublic(row) {
  return {
    id: row.id,
    filename: row.filename,
    file_size: row.file_size,
    file_type: row.file_type,
    text_status: row.text_status,
    status: row.status,
    error: row.error || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function extractInBackground(id, storedPath, filename) {
  try {
    const buffer = fs.readFileSync(storedPath);
    const r = await extractText(buffer, filename);
    if (r.status === 'failed') {
      db.prepare('UPDATE literature_papers SET text_status = ?, error = ?, updated_at = ? WHERE id = ?').run(
        'failed',
        r.error || '文本提取失败',
        nowIso(),
        id
      );
      return;
    }
    const textPath = path.join(path.dirname(storedPath), `${id}.txt`);
    fs.writeFileSync(textPath, r.text || '', 'utf8');
    db.prepare(
      'UPDATE literature_papers SET text_status = ?, text_path = ?, error = ?, updated_at = ? WHERE id = ?'
    ).run(r.status, textPath, '', nowIso(), id);
  } catch (e) {
    db.prepare('UPDATE literature_papers SET text_status = ?, error = ?, updated_at = ? WHERE id = ?').run(
      'failed',
      `文本提取失败：${e.message}`,
      nowIso(),
      id
    );
  }
}

router.post('/upload', upload.array('files', 300), (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: '请选择要上传的文件' });
  const created = [];
  const ts = nowIso();
  for (const f of files) {
    const ext = path.extname(f.originalname || '').toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      fs.unlinkSync(f.path);
      continue;
    }
    const r = db
      .prepare(
        `INSERT INTO literature_papers (space_id, filename, stored_name, file_size, file_type, text_status, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', 'pending', ?, ?)`
      )
      .run(req.spaceId, f.originalname, f.filename, f.size, ext.slice(1), ts, ts);
    const id = r.lastInsertRowid;
    created.push({ id, filename: f.originalname, file_size: f.size });
    extractInBackground(id, f.path, f.originalname).catch(() => {});
  }
  res.json({ ok: true, uploaded: created.length, papers: created });
});

// 手动粘贴文本（扫描版 OCR 失败时）
router.post('/:id/text', (req, res) => {
  const row = db
    .prepare('SELECT * FROM literature_papers WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!row) return res.status(404).json({ error: '文献不存在' });
  const text = String(req.body.text || '').trim();
  if (text.length < 20) return res.status(400).json({ error: '文本内容过少' });
  const textPath = path.join(req.litUploadDir, `${row.id}.txt`);
  fs.writeFileSync(textPath, text, 'utf8');
  db.prepare(
    'UPDATE literature_papers SET text_status = ?, text_path = ?, error = ?, updated_at = ? WHERE id = ?'
  ).run('text', textPath, '', nowIso(), row.id);
  res.json({ ok: true });
});

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM literature_papers WHERE space_id = ? ORDER BY created_at DESC, id DESC')
    .all(req.spaceId);
  res.json(rows.map(paperPublic));
});

router.get('/:id', (req, res) => {
  const row = db
    .prepare('SELECT * FROM literature_papers WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!row) return res.status(404).json({ error: '文献不存在' });
  const analyses = db
    .prepare('SELECT field_key, value FROM literature_analyses WHERE paper_id = ?')
    .all(row.id);
  res.json({ ...paperPublic(row), analyses });
});

router.delete('/:id', (req, res) => {
  const row = db
    .prepare('SELECT * FROM literature_papers WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!row) return res.status(404).json({ error: '文献不存在' });
  for (const p of [row.stored_name, row.text_path]) {
    if (!p) continue;
    const full = path.isAbsolute(p) ? p : path.join(req.litUploadDir, p);
    if (full.startsWith(req.litUploadDir)) {
      fs.unlink(full, () => {});
    }
  }
  db.prepare('DELETE FROM literature_papers WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

// 保存手动修正的分析结果
router.put('/:id/analyses', (req, res) => {
  const row = db
    .prepare('SELECT id FROM literature_papers WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!row) return res.status(404).json({ error: '文献不存在' });
  const values = req.body.values || {};
  const ts = nowIso();
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(values)) {
      const exists = db
        .prepare('SELECT id FROM literature_analyses WHERE paper_id = ? AND field_key = ?')
        .get(row.id, key);
      if (exists) {
        db.prepare('UPDATE literature_analyses SET value = ?, updated_at = ? WHERE id = ?').run(
          String(value ?? ''),
          ts,
          exists.id
        );
      } else {
        db.prepare(
          'INSERT INTO literature_analyses (paper_id, field_key, value, updated_at) VALUES (?, ?, ?, ?)'
        ).run(row.id, key, String(value ?? ''), ts);
      }
    }
  });
  tx();
  db.prepare('UPDATE literature_papers SET status = ?, error = ?, updated_at = ? WHERE id = ?').run(
    'done',
    '',
    ts,
    row.id
  );
  res.json({ ok: true });
});

module.exports = router;
