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
  applicationPublic,
  applicationDetail,
  getMilestones,
  recomputeStatus,
  touchCompany,
  touchApplication,
} = require('./helpers');

const router = express.Router();

const APP_FIELDS = ['position', 'department', 'city', 'salary', 'notes'];

function pickApp(body) {
  const out = {};
  for (const f of APP_FIELDS) {
    if (body[f] !== undefined) out[f] = String(body[f] ?? '');
  }
  return out;
}

function insertMilestone(applicationId, spaceId, name, date, result, remind = null) {
  const m = db
    .prepare(
      'INSERT INTO milestones (application_id, space_id, name, result, date, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(
      applicationId,
      spaceId,
      String(name || '').trim() || '新节点',
      result || 'none',
      date || '',
      nowIso()
    );
  const milestoneId = m.lastInsertRowid;

  const implied = statusFromMilestoneName(name);
  if (implied) db.prepare('UPDATE applications SET status = ? WHERE id = ?').run(implied, applicationId);

  if (remind && remind.value !== undefined && remind.value !== null && String(remind.value) !== '') {
    const remindAt = computeRemindAt(date, remind.value, remind.unit);
    if (remindAt) {
      const space = db.prepare('SELECT user_id FROM spaces WHERE id = ?').get(spaceId);
      const userId = space ? space.user_id : null;
      db.prepare(
        `INSERT INTO reminders (application_id, milestone_id, user_id, space_id, email, remind_at, remind_value, remind_unit, sent, kind, created_at)
         VALUES (?, ?, ?, ?, '', ?, ?, ?, 0, 'milestone', ?)`
      ).run(
        applicationId,
        milestoneId,
        userId,
        spaceId,
        remindAt,
        String(remind.value),
        remind.unit || 'day',
        nowIso()
      );
    }
  }
  return milestoneId;
}

function upsertReminderForMilestone(milestoneId, applicationId, spaceId, date, remind) {
  db.prepare('DELETE FROM reminders WHERE milestone_id = ?').run(milestoneId);
  if (remind && remind.value !== undefined && remind.value !== null && String(remind.value) !== '') {
    const remindAt = computeRemindAt(date, remind.value, remind.unit);
    if (remindAt) {
      const space = db.prepare('SELECT user_id FROM spaces WHERE id = ?').get(spaceId);
      const userId = space ? space.user_id : null;
      db.prepare(
        `INSERT INTO reminders (application_id, milestone_id, user_id, space_id, email, remind_at, remind_value, remind_unit, sent, kind, created_at)
         VALUES (?, ?, ?, ?, '', ?, ?, ?, 0, 'milestone', ?)`
      ).run(
        applicationId,
        milestoneId,
        userId,
        spaceId,
        remindAt,
        String(remind.value),
        remind.unit || 'day',
        nowIso()
      );
    }
  }
}

// 投递列表（含公司名），供看板/筛选使用
router.get('/', (req, res) => {
  const { company_id = '', status = '', q = '' } = req.query;
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = db
      .prepare(
        `SELECT a.*, c.name AS company_name, c.link AS company_link, c.referral_code AS company_referral_code
         FROM applications a JOIN companies c ON c.id = a.company_id
         WHERE a.space_id = ? AND (c.name LIKE ? OR a.position LIKE ? OR a.department LIKE ? OR a.city LIKE ?)
         ORDER BY a.updated_at DESC, a.id DESC`
      )
      .all(req.spaceId, like, like, like, like);
  } else {
    rows = db
      .prepare(
        `SELECT a.*, c.name AS company_name, c.link AS company_link, c.referral_code AS company_referral_code
         FROM applications a JOIN companies c ON c.id = a.company_id
         WHERE a.space_id = ?
         ORDER BY a.updated_at DESC, a.id DESC`
      )
      .all(req.spaceId);
  }
  let list = rows.map(applicationPublic);
  if (company_id) list = list.filter((a) => a.company_id === Number(company_id));
  if (status) list = list.filter((a) => a.status === status);
  res.json(list);
});

router.get('/:id', (req, res) => {
  const row = db
    .prepare('SELECT * FROM applications WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!row) return res.status(404).json({ error: '投递记录不存在' });
  res.json(applicationDetail(row));
});

router.post('/', (req, res) => {
  const fields = pickApp(req.body || {});
  const companyId = Number(req.body.company_id) || 0;
  const company = db
    .prepare('SELECT id FROM companies WHERE id = ? AND space_id = ?')
    .get(companyId, req.spaceId);
  if (!company) return res.status(400).json({ error: '请选择所属公司' });
  const status = STATUSES.includes(req.body.status) ? req.body.status : '已投递';
  const ts = nowIso();
  const r = db
    .prepare(
      `INSERT INTO applications (company_id, space_id, position, department, city, salary, notes, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      companyId,
      req.spaceId,
      fields.position || '',
      fields.department || '',
      fields.city || '',
      fields.salary || '',
      fields.notes || '',
      status,
      ts,
      ts
    );
  const id = r.lastInsertRowid;
  for (const m of req.body.milestones || []) {
    insertMilestone(id, req.spaceId, m.name, m.date, m.result, m.remind);
  }
  recomputeStatus(id);
  touchCompany(companyId);
  res.json(applicationDetail(db.prepare('SELECT * FROM applications WHERE id = ?').get(id)));
});

router.put('/:id', (req, res) => {
  const row = db
    .prepare('SELECT * FROM applications WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!row) return res.status(404).json({ error: '投递记录不存在' });
  const fields = pickApp(req.body || {});
  const sets = APP_FIELDS.map((f) => `${f} = ?`).join(', ');
  const vals = APP_FIELDS.map((f) => (fields[f] !== undefined ? fields[f] : row[f] || ''));
  db.prepare(`UPDATE applications SET ${sets}, updated_at = ? WHERE id = ? AND space_id = ?`).run(
    ...vals,
    nowIso(),
    row.id,
    req.spaceId
  );
  if (req.body.status && STATUSES.includes(req.body.status)) {
    db.prepare('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?').run(
      req.body.status,
      nowIso(),
      row.id
    );
  }
  touchCompany(row.company_id);
  res.json(applicationDetail(db.prepare('SELECT * FROM applications WHERE id = ?').get(row.id)));
});

router.delete('/:id', (req, res) => {
  const row = db
    .prepare('SELECT * FROM applications WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!row) return res.status(404).json({ error: '投递记录不存在' });
  db.prepare('DELETE FROM applications WHERE id = ? AND space_id = ?').run(row.id, req.spaceId);
  touchCompany(row.company_id);
  res.json({ ok: true });
});

// 看板拖拽：修改阶段并自动追加节点
router.patch('/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ error: '无效状态' });
  const row = db
    .prepare('SELECT * FROM applications WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!row) return res.status(404).json({ error: '投递记录不存在' });
  db.prepare('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?').run(
    status,
    nowIso(),
    row.id
  );
  const ms = getMilestones(row.id);
  const last = ms.length ? ms[ms.length - 1] : null;
  const name = milestoneNameForStatus(status);
  if (!last || last.name !== name || last.date !== todayStr()) {
    db.prepare(
      'INSERT INTO milestones (application_id, space_id, name, result, date, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(row.id, req.spaceId, name, 'none', todayStr(), nowIso());
  }
  touchCompany(row.company_id);
  res.json(applicationDetail(db.prepare('SELECT * FROM applications WHERE id = ?').get(row.id)));
});

// 批量状态推进：多条投递统一推进至下一阶段，并自动追加节点
router.post('/batch-advance', (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: '请先勾选记录' });
  const advanced = [];
  const skipped = [];
  for (const id of ids) {
    const a = db
      .prepare('SELECT * FROM applications WHERE id = ? AND space_id = ?')
      .get(id, req.spaceId);
    if (!a) continue;
    const next = nextStatus(a.status);
    if (!next) {
      skipped.push({ id, position: a.position });
      continue;
    }
    db.prepare('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?').run(
      next,
      nowIso(),
      id
    );
    db.prepare(
      'INSERT INTO milestones (application_id, space_id, name, result, date, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, req.spaceId, milestoneNameForStatus(next), 'none', todayStr(), nowIso());
    touchCompany(a.company_id);
    advanced.push({ id, position: a.position, status: next });
  }
  res.json({ ok: true, advanced, skipped });
});

// ===== 进展节点 =====
router.post('/:id/milestones', (req, res) => {
  const row = db
    .prepare('SELECT * FROM applications WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!row) return res.status(404).json({ error: '投递记录不存在' });
  const { name, date, result, remind } = req.body || {};
  if (!String(name || '').trim()) return res.status(400).json({ error: '节点名称不能为空' });
  insertMilestone(row.id, req.spaceId, name, date, result, remind);
  recomputeStatus(row.id);
  touchApplication(row.id);
  res.json(applicationDetail(db.prepare('SELECT * FROM applications WHERE id = ?').get(row.id)));
});

router.put('/milestones/:id', (req, res) => {
  const m = db
    .prepare(
      `SELECT m.* FROM milestones m JOIN applications a ON a.id = m.application_id
       WHERE m.id = ? AND a.space_id = ?`
    )
    .get(req.params.id, req.spaceId);
  if (!m) return res.status(404).json({ error: '节点不存在' });
  const { name, date, result, remind } = req.body || {};
  db.prepare('UPDATE milestones SET name = ?, date = ?, result = ? WHERE id = ?').run(
    name !== undefined ? String(name).trim() || '新节点' : m.name,
    date !== undefined ? date || '' : m.date,
    result !== undefined ? result || 'none' : m.result,
    m.id
  );
  if (remind !== undefined) {
    upsertReminderForMilestone(
      m.id,
      m.application_id,
      req.spaceId,
      date !== undefined ? date || '' : m.date,
      remind
    );
  }
  recomputeStatus(m.application_id);
  touchApplication(m.application_id);
  res.json(applicationDetail(db.prepare('SELECT * FROM applications WHERE id = ?').get(m.application_id)));
});

router.delete('/milestones/:id', (req, res) => {
  const m = db
    .prepare(
      `SELECT m.* FROM milestones m JOIN applications a ON a.id = m.application_id
       WHERE m.id = ? AND a.space_id = ?`
    )
    .get(req.params.id, req.spaceId);
  if (!m) return res.status(404).json({ error: '节点不存在' });
  db.prepare('DELETE FROM milestones WHERE id = ?').run(m.id);
  recomputeStatus(m.application_id);
  touchApplication(m.application_id);
  res.json({ ok: true });
});

module.exports = router;
