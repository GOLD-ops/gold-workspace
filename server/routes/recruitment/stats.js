const express = require('express');
const db = require('../../db');
const { STATUSES, statusFromMilestoneName, daysBetween } = require('./helpers');

const router = express.Router();

function rangeCutoff(range) {
  if (range === 'week') return new Date(Date.now() - 7 * 86400000).toISOString();
  if (range === 'month') return new Date(Date.now() - 30 * 86400000).toISOString();
  return null;
}

router.get('/', (req, res) => {
  const range = ['week', 'month', 'all'].includes(req.query.range) ? req.query.range : 'all';
  const cutoff = rangeCutoff(range);

  let companies;
  if (cutoff) {
    companies = db
      .prepare('SELECT * FROM companies WHERE user_id = ? AND created_at >= ? ORDER BY id')
      .all(req.userId, cutoff);
  } else {
    companies = db.prepare('SELECT * FROM companies WHERE user_id = ? ORDER BY id').all(req.userId);
  }

  const byStatus = {};
  for (const s of STATUSES) byStatus[s] = 0;
  for (const c of companies) byStatus[c.status] = (byStatus[c.status] || 0) + 1;

  const total = companies.length;
  const applied = companies.filter((c) => c.status !== '未投递').length;
  const interviewing = byStatus['面试中'];
  const offers = byStatus['Offer'];
  const rejected = byStatus['已淘汰'];
  const active = applied - offers - rejected;

  const applyToInterviewRate =
    applied > 0 ? Math.round(((interviewing + offers) / applied) * 1000) / 10 : null;
  const interviewToOfferRate =
    interviewing + offers > 0 ? Math.round((offers / (interviewing + offers)) * 1000) / 10 : null;

  // 各阶段平均耗时（基于节点日期）
  const milestones = db
    .prepare(
      `SELECT m.* FROM milestones m JOIN companies c ON c.id = m.company_id
       WHERE c.user_id = ? AND c.created_at >= COALESCE(?, '1970-01-01')`
    )
    .all(req.userId, cutoff || '1970-01-01');

  const stageDate = new Map(); // companyId -> { apply, exam, interview, offer }
  for (const m of milestones) {
    if (!m.date) continue;
    const implied = statusFromMilestoneName(m.name);
    if (!implied) continue;
    const bucket = stageDate.get(m.company_id) || {};
    const key =
      implied === '已投递' ? 'apply' : implied === '笔试' ? 'exam' : implied === '面试中' ? 'interview' : implied === 'Offer' ? 'offer' : null;
    if (!key) continue;
    if (!bucket[key] || m.date < bucket[key]) bucket[key] = m.date;
    stageDate.set(m.company_id, bucket);
  }

  const avg = (fn) => {
    const vals = [...stageDate.values()].map(fn).filter((v) => v !== null && v >= 0);
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  };

  const durations = {
    apply_to_exam: avg((s) =>
      s.apply && s.exam ? daysBetween(s.apply, s.exam) : null
    ),
    exam_to_interview: avg((s) =>
      s.exam && s.interview ? daysBetween(s.exam, s.interview) : null
    ),
    interview_to_offer: avg((s) =>
      s.interview && s.offer ? daysBetween(s.interview, s.offer) : null
    ),
  };

  res.json({
    range,
    total,
    applied,
    interviewing,
    offers,
    rejected,
    active,
    byStatus,
    applyToInterviewRate,
    interviewToOfferRate,
    durations,
  });
});

module.exports = router;
