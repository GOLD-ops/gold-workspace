const db = require('../../db');

// 流程阶段：一条投递所处的位置（准备中 → 已投递 → 笔试 → 面试 → Offer / 已淘汰）
const STATUSES = ['未投递', '已投递', '笔试', '面试', 'Offer', '已淘汰'];

// 节点结果：细化每个阶段的状态
const RESULT_OPTIONS = [
  { value: 'waiting', label: '待进行' },
  { value: 'done', label: '待结果' },
  { value: 'pass', label: '通过' },
  { value: 'fail', label: '未通过' },
];
const RESULT_META = {
  waiting: { label: '待进行', color: '#d97706', bg: '#fef3c7' },
  done: { label: '待结果', color: '#1d4ed8', bg: '#e0edfc' },
  pass: { label: '通过', color: '#0e9f6e', bg: '#e8f5ee' },
  fail: { label: '未通过', color: '#dc2626', bg: '#fee2e2' },
  none: { label: '待进行', color: '#64748b', bg: '#f1f5f9' }, // 兼容旧数据
};

// 节点名称 → 流程阶段 的推断规则（按顺序匹配，前面的优先）
const STATUS_KEYWORDS = [
  { status: 'Offer', keywords: ['offer'] },
  { status: '已淘汰', keywords: ['淘汰', '拒', 'fail', 'reject', '不通过', '未通过'] },
  { status: '面试', keywords: ['一面', '二面', '三面', '四面', 'hr面', '群面', '背调', '面试'] },
  { status: '笔试', keywords: ['笔试', '机试', '测评'] },
  { status: '未投递', keywords: ['准备', '未投递'] },
  { status: '已投递', keywords: ['投递', '内推', '网申', '申请'] },
];

function statusFromMilestoneName(name = '') {
  const n = String(name || '').toLowerCase();
  if (!n) return null;
  for (const { status, keywords } of STATUS_KEYWORDS) {
    if (keywords.some((k) => n.includes(k))) return status;
  }
  return null;
}

// 无需结果状态的节点：投递类、Offer、已淘汰（本身即结果）
function isResultlessNode(name = '') {
  const n = String(name || '').toLowerCase();
  if (!n) return false;
  if (['投递', '内推', '网申', '申请'].some((k) => n.includes(k))) return true;
  if (n.includes('offer')) return true;
  if (['淘汰', '未通过', '拒绝', '拒'].some((k) => n.includes(k))) return true;
  return false;
}

function nextStatus(status) {
  const i = STATUSES.indexOf(status);
  if (i < 0 || i >= STATUSES.length - 2) return null; // Offer / 已淘汰 没有下一阶段
  return STATUSES[i + 1];
}

function milestoneNameForStatus(status) {
  return status === '面试' ? '面试' : status;
}

function nowIso() {
  return new Date().toISOString();
}

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function nowLocalStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function daysBetween(dateA, dateB) {
  const parseLocal = (s) => {
    const str = String(s || '');
    if (!str) return null;
    return str.includes('T') ? new Date(str) : new Date(`${str}T00:00:00`);
  };
  const a = parseLocal(dateA);
  const b = parseLocal(dateB);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
}

function sortMilestones(milestones) {
  return [...(milestones || [])].sort((a, b) => {
    const da = a.date ? 0 : 1;
    const db_ = b.date ? 0 : 1;
    if (da !== db_) return da - db_;
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.id - b.id;
  });
}

function getMilestones(applicationId) {
  return db
    .prepare(
      `SELECT * FROM milestones WHERE application_id = ?
       ORDER BY (date IS NULL OR date = '') ASC, date ASC, id ASC`
    )
    .all(applicationId);
}

function getApplications(companyId) {
  return db
    .prepare('SELECT * FROM applications WHERE company_id = ? ORDER BY id')
    .all(companyId);
}

// 当前所处阶段：优先取与投递状态匹配的最后一个节点
function currentMilestone(application, milestones) {
  const sorted = sortMilestones(milestones);
  const matching = sorted.filter((m) => statusFromMilestoneName(m.name) === application.status);
  if (matching.length) return matching[matching.length - 1];
  return sorted.length ? sorted[sorted.length - 1] : null;
}

// 自动优先级：由「进度深度 + 最近节点距今天数 + 状态加成」综合打分
function computePriority(application, milestones) {
  const status = application.status || '准备中';
  if (status === '未投递' || status === '已淘汰') return { level: '低', score: 0 };

  const sorted = sortMilestones(milestones);
  let score = Math.min(Math.max(sorted.length, 1), 6) * 12;
  const latest = currentMilestone(application, milestones);
  const refDate =
    (latest && latest.date) || String(application.updated_at || '').slice(0, 10);
  const days = daysBetween(refDate, todayStr());
  if (days !== null) {
    if (days <= 2) score += 20;
    else if (days <= 7) score += 12;
    else if (days <= 14) score += 6;
    else if (days <= 30) score += 2;
  }
  if (status === '面试' || status === '笔试') score += 15;
  if (status === 'Offer') score += 5;

  const level = score >= 65 ? '高' : score >= 35 ? '中' : '低';
  return { level, score };
}

// 根据最新节点推断阶段；result=fail 强制已淘汰；推断不出时保持原状
function recomputeStatus(applicationId) {
  const ms = getMilestones(applicationId);
  const latest = ms.length ? ms[ms.length - 1] : null;
  if (!latest) return null;
  const status =
    latest.result === 'fail' ? '已淘汰' : statusFromMilestoneName(latest.name);
  if (status) {
    db.prepare('UPDATE applications SET status = ? WHERE id = ?').run(status, applicationId);
  }
  return status;
}

function touchCompany(companyId) {
  db.prepare('UPDATE companies SET updated_at = ? WHERE id = ?').run(nowIso(), companyId);
}

function touchApplication(applicationId) {
  db.prepare('UPDATE applications SET updated_at = ? WHERE id = ?').run(
    nowIso(),
    applicationId
  );
  const row = db.prepare('SELECT company_id FROM applications WHERE id = ?').get(applicationId);
  if (row) touchCompany(row.company_id);
}

function computeRemindAt(dateStr, value, unit) {
  if (!dateStr) return '';
  const base = new Date(`${dateStr}T09:00:00`);
  if (Number.isNaN(base.getTime())) return '';
  const n = Number(value) || 0;
  const ms = unit === 'hour' ? n * 3600000 : n * 86400000;
  return new Date(base.getTime() - ms).toISOString();
}

// 按全局提醒规则计算阶段提醒时间
// 规则：提前 N 天（在该天指定时刻提醒）或提前 N 小时（按节点时间倒推）
function computeRemindAtGlobal(nodeDate, rule) {
  if (!nodeDate || !rule) return '';
  const enabled = String(rule.remind_enabled === undefined ? '1' : rule.remind_enabled) !== '0';
  if (!enabled) return '';
  const value = Number(rule.remind_value) || 0;
  if (value <= 0) return '';
  const dateStr = String(nodeDate);
  const datePart = dateStr.slice(0, 10);
  if (rule.remind_unit === 'hour') {
    const base = new Date(dateStr.includes('T') ? dateStr : `${datePart}T09:00:00`);
    if (Number.isNaN(base.getTime())) return '';
    return new Date(base.getTime() - value * 3600000).toISOString();
  }
  const day = new Date(`${datePart}T00:00:00`);
  if (Number.isNaN(day.getTime())) return '';
  const target = new Date(day.getTime() - value * 86400000);
  const time = String(rule.remind_time || '08:00');
  const parts = time.split(':');
  target.setHours(Number(parts[0]) || 8, Number(parts[1]) || 0, 0, 0);
  return target.toISOString();
}

function applicationPublic(row) {
  if (!row) return null;
  const milestones = getMilestones(row.id);
  const current = currentMilestone(row, milestones);
  const priority = computePriority(row, milestones);
  return {
    ...row,
    priority: priority.level,
    priority_score: priority.score,
    milestones,
    current_stage: current ? current.name : '',
    latest_date: current ? current.date : '',
    notes_count: db
      .prepare('SELECT COUNT(*) AS n FROM notes WHERE application_id = ?')
      .get(row.id).n,
  };
}

function applicationDetail(row) {
  const pub = applicationPublic(row);
  if (!pub) return null;
  const reminderRows = db
    .prepare('SELECT * FROM reminders WHERE application_id = ? AND kind = ?')
    .all(row.id, 'milestone');
  const remindersByMilestone = new Map();
  for (const r of reminderRows) {
    remindersByMilestone.set(r.milestone_id, r);
  }
  pub.milestones = pub.milestones.map((m) => ({
    ...m,
    reminders: remindersByMilestone.has(m.id)
      ? [
          {
            id: remindersByMilestone.get(m.id).id,
            remind_at: remindersByMilestone.get(m.id).remind_at,
            remind_value: remindersByMilestone.get(m.id).remind_value,
            remind_unit: remindersByMilestone.get(m.id).remind_unit,
            sent: remindersByMilestone.get(m.id).sent,
          },
        ]
      : [],
    notes: db
      .prepare('SELECT * FROM notes WHERE milestone_id = ? ORDER BY created_at DESC, id DESC')
      .all(m.id),
  }));
  return pub;
}

function companyPublic(row) {
  if (!row) return null;
  const { channel, ...rest } = row;
  return {
    ...rest,
    applications: getApplications(row.id).map(applicationPublic),
  };
}

function companyDetail(row) {
  const pub = companyPublic(row);
  if (!pub) return null;
  pub.applications = getApplications(row.id).map(applicationDetail);
  return pub;
}

module.exports = {
  STATUSES,
  RESULT_OPTIONS,
  RESULT_META,
  statusFromMilestoneName,
  isResultlessNode,
  nextStatus,
  milestoneNameForStatus,
  nowIso,
  todayStr,
  nowLocalStr,
  daysBetween,
  computePriority,
  currentMilestone,
  getMilestones,
  getApplications,
  recomputeStatus,
  touchCompany,
  touchApplication,
  computeRemindAt,
  computeRemindAtGlobal,
  applicationPublic,
  applicationDetail,
  companyPublic,
  companyDetail,
};
