const express = require('express');
const db = require('../../db');
const {
  STATUSES,
  statusFromMilestoneName,
  isResultlessNode,
  nextStatus,
  milestoneNameForStatus,
  nowIso,
  todayStr,
  nowLocalStr,
  computeRemindAtGlobal,
  applicationPublic,
  applicationDetail,
  getMilestones,
  recomputeStatus,
  touchCompany,
  touchApplication,
} = require('./helpers');

const router = express.Router();

const APP_FIELDS = ['position', 'department', 'city', 'salary', 'notes', 'requirements'];

function pickApp(body) {
  const out = {};
  for (const f of APP_FIELDS) {
    if (body[f] !== undefined) out[f] = String(body[f] ?? '');
  }
  return out;
}

// 读取用户的全局提醒规则
function getRemindRule(spaceId) {
  const space = db.prepare('SELECT user_id FROM spaces WHERE id = ?').get(spaceId);
  if (!space || !space.user_id) return null;
  return (
    db
      .prepare(
        'SELECT remind_enabled, remind_value, remind_unit, remind_time FROM users WHERE id = ?'
      )
      .get(space.user_id) || null
  );
}

// 按全局规则同步阶段提醒：仅「待进行」节点且用户启用提醒时生成，否则清除
function syncReminderForMilestone(milestoneId, applicationId, spaceId, date, result) {
  db.prepare('DELETE FROM reminders WHERE milestone_id = ?').run(milestoneId);
  if (result !== 'waiting') return;
  // 节点时间已过：不生成提醒记录（也不出现在“最近提醒记录”中）
  if (milestoneDateExpired(date)) return;
  const rule = getRemindRule(spaceId);
  if (!rule) return;
  const remindAt = computeRemindAtGlobal(date, rule);
  if (!remindAt) return;
  const space = db.prepare('SELECT user_id FROM spaces WHERE id = ?').get(spaceId);
  const userId = space ? space.user_id : null;
  db.prepare(
    `INSERT INTO reminders (application_id, milestone_id, user_id, space_id, email, remind_at, remind_value, remind_unit, sent, kind, created_at)
     VALUES (?, ?, ?, ?, '', ?, '', '', 0, 'milestone', ?)`
  ).run(applicationId, milestoneId, userId, spaceId, remindAt, nowIso());
}

function insertMilestone(applicationId, spaceId, name, date, result) {
  const m = db
    .prepare(
      'INSERT INTO milestones (application_id, space_id, name, result, date, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(
      applicationId,
      spaceId,
      String(name || '').trim() || '新节点',
      result || 'waiting',
      date || '',
      nowIso()
    );
  const milestoneId = m.lastInsertRowid;

  const implied = statusFromMilestoneName(name);
  if (implied) db.prepare('UPDATE applications SET status = ? WHERE id = ?').run(implied, applicationId);
  const finalResult = isResultlessNode(name) ? '' : result || 'waiting';
  db.prepare('UPDATE milestones SET result = ? WHERE id = ?').run(finalResult, milestoneId);
  syncReminderForMilestone(milestoneId, applicationId, spaceId, date, finalResult);
  return milestoneId;
}

// 节点时间是否已过：只有日期的节点按当天 23:59 前仍有效判断
function milestoneDateExpired(dateStr) {
  if (!dateStr) return false;
  const s = String(dateStr);
  const d = new Date(s.includes('T') ? s : `${s}T23:59:59`);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

// 联动通过：新增节点时，把排在其前面的节点自动标记为「通过」
function autoPassEarlier(applicationId, anchorId) {
  const ms = getMilestones(applicationId); // 已按日期、创建顺序排序
  const update = db.prepare("UPDATE milestones SET result = 'pass' WHERE id = ?");
  for (const m of ms) {
    if (m.id === anchorId) break;
    if (isResultlessNode(m.name)) continue; // 无需结果的节点不标通过
    update.run(m.id);
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
  if (!String(fields.position || '').trim()) {
    return res.status(400).json({ error: '请填写应聘岗位' });
  }
  const companyId = Number(req.body.company_id) || 0;
  const company = db
    .prepare('SELECT id FROM companies WHERE id = ? AND space_id = ?')
    .get(companyId, req.spaceId);
  if (!company) return res.status(400).json({ error: '请选择所属公司' });
  const status = STATUSES.includes(req.body.status) ? req.body.status : '已投递';
  const ts = nowIso();
  const r = db
    .prepare(
      `INSERT INTO applications (company_id, space_id, position, department, city, salary, notes, requirements, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      companyId,
      req.spaceId,
      fields.position || '',
      fields.department || '',
      fields.city || '',
      fields.salary || '',
      fields.notes || '',
      fields.requirements || '',
      status,
      ts,
      ts
    );
  const id = r.lastInsertRowid;
  for (const m of req.body.milestones || []) {
    insertMilestone(id, req.spaceId, m.name, m.date, m.result);
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
  let newId = null;
  if (!last || last.name !== name || String(last.date || '').slice(0, 10) !== todayStr()) {
    const r = db.prepare(
      'INSERT INTO milestones (application_id, space_id, name, result, date, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(row.id, req.spaceId, name, isResultlessNode(name) ? '' : 'waiting', nowLocalStr(), nowIso());
    newId = r.lastInsertRowid;
  }
  if (newId) autoPassEarlier(row.id, newId);
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
    const bName = milestoneNameForStatus(next);
    const r = db.prepare(
      'INSERT INTO milestones (application_id, space_id, name, result, date, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, req.spaceId, bName, isResultlessNode(bName) ? '' : 'waiting', nowLocalStr(), nowIso());
    autoPassEarlier(id, r.lastInsertRowid);
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
  const { name, date, result } = req.body || {};
  if (!String(name || '').trim()) return res.status(400).json({ error: '节点名称不能为空' });
  const newId = insertMilestone(row.id, req.spaceId, name, date, result);
  autoPassEarlier(row.id, newId);
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
  const { name, date, result } = req.body || {};
  const finalName = name !== undefined ? String(name).trim() || '新节点' : m.name;
  const finalDate = date !== undefined ? date || '' : m.date;
  let finalResult = result !== undefined ? result || 'waiting' : m.result;
  if (isResultlessNode(finalName)) finalResult = '';
  // 内容未变化时不重建提醒，避免“保存即重新排队”导致重复发送
  const changed = finalName !== m.name || finalDate !== m.date || finalResult !== m.result;
  db.prepare('UPDATE milestones SET name = ?, date = ?, result = ? WHERE id = ?').run(
    finalName,
    finalDate,
    finalResult,
    m.id
  );
  if (changed) {
    syncReminderForMilestone(
      m.id,
      m.application_id,
      req.spaceId,
      finalDate,
      finalResult
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
module.exports.syncReminderForMilestone = syncReminderForMilestone;
