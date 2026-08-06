const db = require('../../db');

const STATUSES = ['未投递', '已投递', '笔试', '面试中', 'Offer', '已淘汰'];

// 节点名称 -> 状态 的推断规则（按顺序匹配，前面的优先）
const STATUS_KEYWORDS = [
  { status: 'Offer', keywords: ['offer'] },
  { status: '已淘汰', keywords: ['淘汰', '拒', 'fail', 'reject', '不通过'] },
  { status: '面试中', keywords: ['一面', '二面', '三面', '四面', 'hr面', '群面', '背调', '面试'] },
  { status: '笔试', keywords: ['笔试', '机试', '测评'] },
  { status: '未投递', keywords: ['未投递', '准备'] },
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

function nextStatus(status) {
  const i = STATUSES.indexOf(status);
  if (i < 0 || i >= STATUSES.length - 2) return null; // Offer / 已淘汰 没有下一阶段
  return STATUSES[i + 1];
}

function milestoneNameForStatus(status) {
  return status === '面试中' ? '面试' : status;
}

function nowIso() {
  return new Date().toISOString();
}

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function daysBetween(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
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

// 当前所处阶段：优先取与公司状态匹配的最后一个节点
function currentMilestone(company, milestones) {
  const sorted = sortMilestones(milestones);
  const matching = sorted.filter((m) => statusFromMilestoneName(m.name) === company.status);
  if (matching.length) return matching[matching.length - 1];
  return sorted.length ? sorted[sorted.length - 1] : null;
}

// 自动优先级：由「进度深度 + 最近节点距今天数 + 状态加成」综合打分
// 高分 >= 65 / 中分 >= 35 / 其余低分
function computePriority(company, milestones) {
  const status = company.status || '未投递';
  if (status === '未投递' || status === '已淘汰') return { level: '低', score: 0 };

  const sorted = sortMilestones(milestones);

  let score = Math.min(Math.max(sorted.length, 1), 6) * 12;
  const latest = currentMilestone(company, milestones);
  const refDate = (latest && latest.date) || String(company.updated_at || '').slice(0, 10);
  const days = daysBetween(refDate, todayStr());
  if (days !== null) {
    if (days <= 2) score += 20;
    else if (days <= 7) score += 12;
    else if (days <= 14) score += 6;
    else if (days <= 30) score += 2;
  }
  if (status === '面试中' || status === '笔试') score += 15;
  if (status === 'Offer') score += 5;

  const level = score >= 65 ? '高' : score >= 35 ? '中' : '低';
  return { level, score };
}

function getMilestones(companyId) {
  return db
    .prepare(
      `SELECT * FROM milestones WHERE company_id = ?
       ORDER BY (date IS NULL OR date = '') ASC, date ASC, id ASC`
    )
    .all(companyId);
}

// 根据最新节点推断状态；推断不出时保持原状
function recomputeStatus(companyId) {
  const ms = getMilestones(companyId);
  const latest = ms.length ? ms[ms.length - 1] : null;
  const implied = latest ? statusFromMilestoneName(latest.name) : null;
  if (implied) {
    db.prepare('UPDATE companies SET status = ? WHERE id = ?').run(implied, companyId);
  }
  return implied;
}

function touchCompany(companyId) {
  db.prepare('UPDATE companies SET updated_at = ? WHERE id = ?').run(nowIso(), companyId);
}

function computeRemindAt(dateStr, value, unit) {
  if (!dateStr) return '';
  const base = new Date(`${dateStr}T09:00:00`);
  if (Number.isNaN(base.getTime())) return '';
  const n = Number(value) || 0;
  const ms = unit === 'hour' ? n * 3600000 : n * 86400000;
  return new Date(base.getTime() - ms).toISOString();
}

function parseTags(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    return raw
      .split(/[,，、\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function companyPublic(row) {
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
      .prepare('SELECT COUNT(*) AS n FROM notes WHERE company_id = ?')
      .get(row.id).n,
  };
}

function companyDetail(row) {
  const pub = companyPublic(row);
  if (!pub) return null;
  const reminderRows = db
    .prepare('SELECT * FROM reminders WHERE company_id = ? AND kind = ?')
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

module.exports = {
  STATUSES,
  statusFromMilestoneName,
  nextStatus,
  milestoneNameForStatus,
  nowIso,
  todayStr,
  daysBetween,
  computePriority,
  currentMilestone,
  getMilestones,
  recomputeStatus,
  touchCompany,
  computeRemindAt,
  parseTags,
  companyPublic,
  companyDetail,
};
