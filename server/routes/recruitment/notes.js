const express = require('express');
const db = require('../../db');
const { nowIso, parseTags, touchApplication } = require('./helpers');

const router = express.Router();

function noteRow(n) {
  let tags = [];
  try {
    tags = JSON.parse(n.tags || '[]');
  } catch {
    tags = parseTags(n.tags);
  }
  return { ...n, tags };
}

// 全部笔记（可带 q 搜索 / 标签筛选）
router.get('/', (req, res) => {
  const { q = '', tag = '' } = req.query;
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = db
      .prepare(
        `SELECT n.*, c.name AS company_name, a.position AS company_position, m.name AS milestone_name
         FROM notes n
         JOIN applications a ON a.id = n.application_id
         JOIN companies c ON c.id = a.company_id
         LEFT JOIN milestones m ON m.id = n.milestone_id
         WHERE n.space_id = ? AND (n.title LIKE ? OR n.content LIKE ? OR c.name LIKE ? OR a.position LIKE ?)
         ORDER BY n.updated_at DESC, n.id DESC`
      )
      .all(req.spaceId, like, like, like, like);
  } else {
    rows = db
      .prepare(
        `SELECT n.*, c.name AS company_name, a.position AS company_position, m.name AS milestone_name
         FROM notes n
         JOIN applications a ON a.id = n.application_id
         JOIN companies c ON c.id = a.company_id
         LEFT JOIN milestones m ON m.id = n.milestone_id
         WHERE n.space_id = ?
         ORDER BY n.updated_at DESC, n.id DESC`
      )
      .all(req.spaceId);
  }
  let list = rows.map(noteRow);
  if (tag) list = list.filter((n) => n.tags.includes(tag));
  res.json(list);
});

// 按标签全局聚合
router.get('/tags', (req, res) => {
  const rows = db
    .prepare(
      `SELECT n.tags, n.id, n.title, n.created_at, c.name AS company_name
       FROM notes n
       JOIN applications a ON a.id = n.application_id
       JOIN companies c ON c.id = a.company_id
       WHERE n.space_id = ?`
    )
    .all(req.spaceId);
  const tagMap = new Map();
  for (const r of rows) {
    let tags = [];
    try {
      tags = JSON.parse(r.tags || '[]');
    } catch {
      tags = parseTags(r.tags);
    }
    for (const t of tags) {
      if (!tagMap.has(t)) tagMap.set(t, { tag: t, count: 0 });
      tagMap.get(t).count++;
    }
  }
  const list = [...tagMap.values()].sort((a, b) => b.count - a.count);
  res.json(list);
});

// 在投递下创建笔记（可选挂到节点）
router.post('/applications/:id/notes', (req, res) => {
  const a = db
    .prepare('SELECT * FROM applications WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!a) return res.status(404).json({ error: '投递记录不存在' });
  const { milestone_id = null, title = '', content = '', tags = [] } = req.body || {};
  if (milestone_id) {
    const m = db
      .prepare('SELECT id FROM milestones WHERE id = ? AND application_id = ?')
      .get(milestone_id, a.id);
    if (!m) return res.status(400).json({ error: '节点不属于该投递' });
  }
  const ts = nowIso();
  const r = db
    .prepare(
      `INSERT INTO notes (application_id, milestone_id, space_id, title, content, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      a.id,
      milestone_id || null,
      req.spaceId,
      String(title || ''),
      String(content || ''),
      JSON.stringify(parseTags(tags)),
      ts,
      ts
    );
  touchApplication(a.id);
  const n = db.prepare('SELECT * FROM notes WHERE id = ?').get(r.lastInsertRowid);
  res.json(noteRow(n));
});

router.put('/:id', (req, res) => {
  const n = db
    .prepare('SELECT * FROM notes WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!n) return res.status(404).json({ error: '笔记不存在' });
  const { title, content, tags, milestone_id } = req.body || {};
  if (milestone_id !== undefined && milestone_id) {
    const m = db
      .prepare('SELECT id FROM milestones WHERE id = ? AND application_id = ?')
      .get(milestone_id, n.application_id);
    if (!m) return res.status(400).json({ error: '节点不属于该投递' });
  }
  db.prepare(
    `UPDATE notes SET title = ?, content = ?, tags = ?, milestone_id = ?, updated_at = ? WHERE id = ? AND space_id = ?`
  ).run(
    title !== undefined ? String(title) : n.title,
    content !== undefined ? String(content) : n.content,
    tags !== undefined ? JSON.stringify(parseTags(tags)) : n.tags,
    milestone_id !== undefined ? milestone_id || null : n.milestone_id,
    nowIso(),
    n.id,
    req.spaceId
  );
  touchApplication(n.application_id);
  res.json(noteRow(db.prepare('SELECT * FROM notes WHERE id = ?').get(n.id)));
});

router.delete('/:id', (req, res) => {
  const n = db
    .prepare('SELECT * FROM notes WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!n) return res.status(404).json({ error: '笔记不存在' });
  db.prepare('DELETE FROM notes WHERE id = ? AND space_id = ?').run(n.id, req.spaceId);
  touchApplication(n.application_id);
  res.json({ ok: true });
});

module.exports = router;
