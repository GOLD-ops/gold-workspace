const express = require('express');
const db = require('../../db');
const { nowIso, touchApplication } = require('./helpers');

const router = express.Router();

// 全部笔记（可带 q 搜索 / 标签筛选）
router.get('/', (req, res) => {
  const { q = '' } = req.query;
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
  res.json(rows);
});

// 导出笔记（含公司/岗位/节点名称，便于跨空间恢复）
router.get('/export', (req, res) => {
  const rows = db
    .prepare(
      `SELECT n.title, n.content, n.created_at, n.updated_at,
              c.name AS company_name, a.position AS company_position, m.name AS milestone_name
       FROM notes n
       JOIN applications a ON a.id = n.application_id
       JOIN companies c ON c.id = a.company_id
       LEFT JOIN milestones m ON m.id = n.milestone_id
       WHERE n.space_id = ?
       ORDER BY n.id`
    )
    .all(req.spaceId);
  res.json({
    app: 'autumn-recruitment-tracker-notes',
    version: 1,
    exported_at: nowIso(),
    notes: rows,
  });
});

// 导入笔记：按「公司 + 岗位（+ 节点名）」匹配现有投递后写入，仅合并不覆盖
router.post('/import', (req, res) => {
  const list = (req.body && req.body.notes) || [];
  if (!Array.isArray(list)) return res.status(400).json({ error: '导入数据格式不正确' });

  const result = db.transaction(() => {
    let imported = 0;
    let skipped = 0;
    const findApp = db.prepare(
      `SELECT a.id FROM applications a JOIN companies c ON c.id = a.company_id
       WHERE a.space_id = ? AND c.name = ? AND a.position = ?`
    );
    const findMilestone = db.prepare(
      'SELECT id FROM milestones WHERE application_id = ? AND name = ?'
    );
    const exists = db.prepare(
      `SELECT COUNT(*) AS n FROM notes
       WHERE application_id = ? AND (milestone_id IS ? OR milestone_id = ?)
         AND title = ? AND content = ?`
    );
    const insert = db.prepare(
      `INSERT INTO notes (application_id, milestone_id, space_id, title, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const ts = nowIso();

    for (const n of list) {
      const company = String(n.company_name || n.company || '').trim();
      const position = String(n.company_position || n.position || '').trim();
      if (!company || !position) {
        skipped++;
        continue;
      }
      const app = findApp.get(req.spaceId, company, position);
      if (!app) {
        skipped++;
        continue;
      }
      const milestoneName = String(n.milestone_name || '').trim();
      let mid = null;
      if (milestoneName) {
        const m = findMilestone.get(app.id, milestoneName);
        mid = m ? m.id : null;
      }
      const title = String(n.title || '');
      const content = String(n.content || '');
      if (exists.get(app.id, mid, mid, title, content).n > 0) {
        skipped++;
        continue;
      }
      insert.run(
        app.id,
        mid,
        req.spaceId,
        title,
        content,
        n.created_at || ts,
        n.updated_at || ts
      );
      imported++;
    }
    return { imported, skipped };
  })();

  res.json({ ok: true, ...result });
});

// 在投递下创建笔记（可选挂到节点）
router.post('/applications/:id/notes', (req, res) => {
  const a = db
    .prepare('SELECT * FROM applications WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!a) return res.status(404).json({ error: '投递记录不存在' });
  const { milestone_id = null, title = '', content = '' } = req.body || {};
  if (milestone_id) {
    const m = db
      .prepare('SELECT id FROM milestones WHERE id = ? AND application_id = ?')
      .get(milestone_id, a.id);
    if (!m) return res.status(400).json({ error: '节点不属于该投递' });
  }
  const ts = nowIso();
  const r = db
    .prepare(
      `INSERT INTO notes (application_id, milestone_id, space_id, title, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      a.id,
      milestone_id || null,
      req.spaceId,
      String(title || ''),
      String(content || ''),
      ts,
      ts
    );
  touchApplication(a.id);
  const n = db.prepare('SELECT * FROM notes WHERE id = ?').get(r.lastInsertRowid);
  res.json(n);
});

router.put('/:id', (req, res) => {
  const n = db
    .prepare('SELECT * FROM notes WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!n) return res.status(404).json({ error: '笔记不存在' });
  const { title, content, milestone_id } = req.body || {};
  if (milestone_id !== undefined && milestone_id) {
    const m = db
      .prepare('SELECT id FROM milestones WHERE id = ? AND application_id = ?')
      .get(milestone_id, n.application_id);
    if (!m) return res.status(400).json({ error: '节点不属于该投递' });
  }
  db.prepare(
    `UPDATE notes SET title = ?, content = ?, milestone_id = ?, updated_at = ? WHERE id = ? AND space_id = ?`
  ).run(
    title !== undefined ? String(title) : n.title,
    content !== undefined ? String(content) : n.content,
    milestone_id !== undefined ? milestone_id || null : n.milestone_id,
    nowIso(),
    n.id,
    req.spaceId
  );
  touchApplication(n.application_id);
  res.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(n.id));
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
