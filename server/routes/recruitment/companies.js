const express = require('express');
const db = require('../../db');
const {
  STATUSES,
  statusFromMilestoneName,
  nextStatus,
  milestoneNameForStatus,
  nowIso,
  todayStr,
  computeRemindAt,
  companyPublic,
  companyDetail,
  getMilestones,
  recomputeStatus,
  touchCompany,
} = require('./helpers');

const router = express.Router();

const FIELDS = [
  'company',
  'position',
  'department',
  'city',
  'salary',
  'channel',
  'link',
  'referral_code',
  'notes',
];

function pickBody(body) {
  const out = {};
  for (const f of FIELDS) {
    if (body[f] !== undefined) out[f] = String(body[f] ?? '');
  }
  return out;
}

function insertMilestone(companyId, userId, name, date, remind = null) {
  const m = db
    .prepare(
      'INSERT INTO milestones (company_id, space_id, name, date, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(companyId, userId, String(name || '').trim() || '新节点', date || '', nowIso());
  const milestoneId = m.lastInsertRowid;

  const implied = statusFromMilestoneName(name);
  if (implied) db.prepare('UPDATE companies SET status = ? WHERE id = ?').run(implied, companyId);

  if (remind && remind.value !== undefined && remind.value !== null && String(remind.value) !== '') {
    const remindAt = computeRemindAt(date, remind.value, remind.unit);
    if (remindAt) {
      db.prepare(
        `INSERT INTO reminders (company_id, milestone_id, user_id, space_id, email, remind_at, remind_value, remind_unit, sent, kind, created_at)
         VALUES (?, ?, ?, ?, '', ?, ?, ?, 0, 'milestone', ?)`
      ).run(
        companyId,
        milestoneId,
        userId,
        userId,
        remindAt,
        String(remind.value),
        remind.unit || 'day',
        nowIso()
      );
    }
  }
  return milestoneId;
}

function upsertReminderForMilestone(milestoneId, companyId, userId, date, remind) {
  db.prepare('DELETE FROM reminders WHERE milestone_id = ?').run(milestoneId);
  if (remind && remind.value !== undefined && remind.value !== null && String(remind.value) !== '') {
    const remindAt = computeRemindAt(date, remind.value, remind.unit);
    if (remindAt) {
      db.prepare(
        `INSERT INTO reminders (company_id, milestone_id, user_id, space_id, email, remind_at, remind_value, remind_unit, sent, kind, created_at)
         VALUES (?, ?, ?, ?, '', ?, ?, ?, 0, 'milestone', ?)`
      ).run(
        companyId,
        milestoneId,
        userId,
        userId,
        remindAt,
        String(remind.value),
        remind.unit || 'day',
        nowIso()
      );
    }
  }
}

// 列表：支持状态筛选、关键词搜索、排序
router.get('/', (req, res) => {
  const { status = '', q = '', sort = 'updated' } = req.query;
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = db
      .prepare(
        `SELECT * FROM companies
         WHERE space_id = ? AND (company LIKE ? OR position LIKE ? OR department LIKE ? OR city LIKE ? OR notes LIKE ?)
         ORDER BY updated_at DESC, id DESC`
      )
      .all(req.spaceId, like, like, like, like, like);
  } else {
    rows = db
      .prepare('SELECT * FROM companies WHERE space_id = ? ORDER BY updated_at DESC, id DESC')
      .all(req.spaceId);
  }
  let list = rows.map(companyPublic);
  if (status) list = list.filter((c) => c.status === status);

  if (sort === 'company') list.sort((a, b) => a.company.localeCompare(b.company, 'zh'));
  else if (sort === 'priority')
    list.sort(
      (a, b) =>
        b.priority_score - a.priority_score ||
        (b.updated_at < a.updated_at ? -1 : 1)
    );
  else if (sort === 'created')
    list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  res.json(list);
});

router.get('/export', (req, res) => {
  const companies = db
    .prepare('SELECT * FROM companies WHERE space_id = ? ORDER BY id')
    .all(req.spaceId);
  const milestones = db
    .prepare('SELECT * FROM milestones WHERE space_id = ? ORDER BY id')
    .all(req.spaceId);
  const notes = db
    .prepare('SELECT * FROM notes WHERE space_id = ? ORDER BY id')
    .all(req.spaceId);
  res.json({
    app: 'autumn-recruitment-tracker',
    version: 1,
    exported_at: nowIso(),
    companies,
    milestones,
    notes,
  });
});

router.post('/import', (req, res) => {
  const { mode = 'merge', data } = req.body || {};
  if (!data || !Array.isArray(data.companies)) {
    return res.status(400).json({ error: '导入数据格式不正确' });
  }
  const uid = req.spaceId;
  const tx = db.transaction(() => {
    let imported = 0;
    let merged = 0;

    if (mode === 'overwrite') {
      db.prepare('DELETE FROM companies WHERE space_id = ?').run(uid); // 级联删除该用户数据
    }

    const msRows = new Map();
    for (const m of data.milestones || []) {
      if (!msRows.has(m.company_id)) msRows.set(m.company_id, []);
      msRows.get(m.company_id).push(m);
    }
    const noteRows = new Map();
    for (const n of data.notes || []) {
      if (!noteRows.has(n.company_id)) noteRows.set(n.company_id, []);
      noteRows.get(n.company_id).push(n);
    }

    for (const c of data.companies) {
      const fields = pickBody(c);
      if (!fields.company) continue;
      let targetId = null;

      if (mode === 'merge') {
        const found = db
          .prepare(
            `SELECT id FROM companies
             WHERE space_id = ? AND company = ? AND (position = ? OR (? = '' AND position = ''))
             ORDER BY id LIMIT 1`
          )
          .get(uid, fields.company, fields.position || '', fields.position || '');
        if (found) {
          targetId = found.id;
          db.prepare(
            `UPDATE companies SET position=?, department=?, city=?, salary=?, channel=?, link=?,
             referral_code=?, notes=?, status=?, updated_at=? WHERE id=? AND user_id=?`
          ).run(
            fields.position || '',
            fields.department || '',
            fields.city || '',
            fields.salary || '',
            fields.channel || '',
            fields.link || '',
            fields.referral_code || '',
            fields.notes || '',
            c.status || '未投递',
            nowIso(),
            targetId,
            uid
          );
          merged++;
        }
      }

      if (!targetId) {
        const r = db
          .prepare(
            `INSERT INTO companies (space_id, company, position, department, city, salary, channel, link, referral_code, notes, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            uid,
            fields.company,
            fields.position || '',
            fields.department || '',
            fields.city || '',
            fields.salary || '',
            fields.channel || '',
            fields.link || '',
            fields.referral_code || '',
            fields.notes || '',
            c.status || '未投递',
            c.created_at || nowIso(),
            nowIso()
          );
        targetId = r.lastInsertRowid;
        imported++;
      }

      const idMap = new Map(); // 旧 milestone id -> 新 id
      for (const m of msRows.get(c.id) || []) {
        const r = db
          .prepare(
            'INSERT INTO milestones (company_id, space_id, name, date, created_at) VALUES (?, ?, ?, ?, ?)'
          )
          .run(targetId, uid, m.name || '新节点', m.date || '', m.created_at || nowIso());
        idMap.set(m.id, r.lastInsertRowid);
      }
      for (const n of noteRows.get(c.id) || []) {
        const newMid = n.milestone_id != null ? idMap.get(n.milestone_id) || null : null;
        db.prepare(
          `INSERT INTO notes (company_id, milestone_id, space_id, title, content, tags, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          targetId,
          newMid,
          uid,
          n.title || '',
          n.content || '',
          Array.isArray(n.tags) ? JSON.stringify(n.tags) : n.tags || '[]',
          n.created_at || nowIso(),
          n.updated_at || nowIso()
        );
      }
    }
    return { imported, merged };
  });

  const result = tx();
  res.json({ ok: true, ...result });
});

router.get('/:id', (req, res) => {
  const row = db
    .prepare('SELECT * FROM companies WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!row) return res.status(404).json({ error: '记录不存在' });
  res.json(companyDetail(row));
});

router.post('/', (req, res) => {
  const fields = pickBody(req.body || {});
  if (!fields.company) return res.status(400).json({ error: '公司名不能为空' });
  const status = STATUSES.includes(req.body.status) ? req.body.status : '未投递';
  const ts = nowIso();
  const r = db
    .prepare(
      `INSERT INTO companies (space_id, company, position, department, city, salary, channel, link, referral_code, notes, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.spaceId,
      fields.company,
      fields.position || '',
      fields.department || '',
      fields.city || '',
      fields.salary || '',
      fields.channel || '',
      fields.link || '',
      fields.referral_code || '',
      fields.notes || '',
      status,
      ts,
      ts
    );
  const id = r.lastInsertRowid;
  for (const m of req.body.milestones || []) {
    insertMilestone(id, req.spaceId, m.name, m.date, m.remind);
  }
  res.json(companyDetail(db.prepare('SELECT * FROM companies WHERE id = ?').get(id)));
});

router.put('/:id', (req, res) => {
  const row = db
    .prepare('SELECT * FROM companies WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!row) return res.status(404).json({ error: '记录不存在' });
  const fields = pickBody(req.body || {});
  if (fields.company !== undefined && !fields.company) {
    return res.status(400).json({ error: '公司名不能为空' });
  }
  const sets = FIELDS.map((f) => `${f} = ?`).join(', ');
  const vals = FIELDS.map((f) => (fields[f] !== undefined ? fields[f] : row[f] || ''));
  db.prepare(`UPDATE companies SET ${sets}, updated_at = ? WHERE id = ? AND space_id = ?`).run(
    ...vals,
    nowIso(),
    row.id,
    req.spaceId
  );
  if (req.body.status && STATUSES.includes(req.body.status)) {
    db.prepare('UPDATE companies SET status = ?, updated_at = ? WHERE id = ? AND space_id = ?').run(
      req.body.status,
      nowIso(),
      row.id,
      req.spaceId
    );
  }
  res.json(companyDetail(db.prepare('SELECT * FROM companies WHERE id = ?').get(row.id)));
});

router.delete('/:id', (req, res) => {
  const r = db
    .prepare('DELETE FROM companies WHERE id = ? AND space_id = ?')
    .run(req.params.id, req.spaceId);
  if (!r.changes) return res.status(404).json({ error: '记录不存在' });
  res.json({ ok: true });
});

// 清空当前用户全部记录（设置页危险操作）
router.delete('/', (req, res) => {
  const r = db.prepare('DELETE FROM companies WHERE space_id = ?').run(req.spaceId);
  res.json({ ok: true, deleted: r.changes });
});

// 批量状态推进
router.post('/batch-advance', (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: '请先勾选记录' });
  const advanced = [];
  const skipped = [];
  for (const id of ids) {
    const c = db
      .prepare('SELECT * FROM companies WHERE id = ? AND space_id = ?')
      .get(id, req.spaceId);
    if (!c) continue;
    const next = nextStatus(c.status);
    if (!next) {
      skipped.push({ id, company: c.company });
      continue;
    }
    db.prepare('UPDATE companies SET status = ?, updated_at = ? WHERE id = ?').run(
      next,
      nowIso(),
      id
    );
    db.prepare(
      'INSERT INTO milestones (company_id, space_id, name, date, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, req.spaceId, milestoneNameForStatus(next), todayStr(), nowIso());
    advanced.push({ id, company: c.company, status: next });
  }
  res.json({ ok: true, advanced, skipped });
});

// 看板拖拽：修改状态并自动追加节点
router.patch('/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ error: '无效状态' });
  const row = db
    .prepare('SELECT * FROM companies WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!row) return res.status(404).json({ error: '记录不存在' });
  db.prepare('UPDATE companies SET status = ?, updated_at = ? WHERE id = ?').run(
    status,
    nowIso(),
    row.id
  );
  const ms = getMilestones(row.id);
  const last = ms.length ? ms[ms.length - 1] : null;
  const name = milestoneNameForStatus(status);
  if (!last || last.name !== name || last.date !== todayStr()) {
    db.prepare(
      'INSERT INTO milestones (company_id, space_id, name, date, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(row.id, req.spaceId, name, todayStr(), nowIso());
  }
  res.json(companyDetail(db.prepare('SELECT * FROM companies WHERE id = ?').get(row.id)));
});

// ===== 进展节点 =====
router.post('/:id/milestones', (req, res) => {
  const row = db
    .prepare('SELECT * FROM companies WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!row) return res.status(404).json({ error: '记录不存在' });
  const { name, date, remind } = req.body || {};
  if (!String(name || '').trim()) return res.status(400).json({ error: '节点名称不能为空' });
  insertMilestone(row.id, req.spaceId, name, date, remind);
  touchCompany(row.id);
  res.json(companyDetail(db.prepare('SELECT * FROM companies WHERE id = ?').get(row.id)));
});

router.put('/milestones/:id', (req, res) => {
  const m = db
    .prepare(
      `SELECT m.* FROM milestones m JOIN companies c ON c.id = m.company_id
       WHERE m.id = ? AND c.space_id = ?`
    )
    .get(req.params.id, req.spaceId);
  if (!m) return res.status(404).json({ error: '节点不存在' });
  const { name, date, remind } = req.body || {};
  db.prepare('UPDATE milestones SET name = ?, date = ? WHERE id = ?').run(
    name !== undefined ? String(name).trim() || '新节点' : m.name,
    date !== undefined ? date || '' : m.date,
    m.id
  );
  if (remind !== undefined) {
    upsertReminderForMilestone(
      m.id,
      m.company_id,
      req.spaceId,
      date !== undefined ? date || '' : m.date,
      remind
    );
  }
  recomputeStatus(m.company_id);
  touchCompany(m.company_id);
  res.json(companyDetail(db.prepare('SELECT * FROM companies WHERE id = ?').get(m.company_id)));
});

router.delete('/milestones/:id', (req, res) => {
  const m = db
    .prepare(
      `SELECT m.* FROM milestones m JOIN companies c ON c.id = m.company_id
       WHERE m.id = ? AND c.space_id = ?`
    )
    .get(req.params.id, req.spaceId);
  if (!m) return res.status(404).json({ error: '节点不存在' });
  db.prepare('DELETE FROM milestones WHERE id = ?').run(m.id);
  recomputeStatus(m.company_id);
  touchCompany(m.company_id);
  res.json({ ok: true });
});

module.exports = router;
