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

  let applications;
  if (cutoff) {
    applications = db
      .prepare('SELECT * FROM applications WHERE space_id = ? AND created_at >= ? ORDER BY id')
      .all(req.spaceId, cutoff);
  } else {
    applications = db
      .prepare('SELECT * FROM applications WHERE space_id = ? ORDER BY id')
      .all(req.spaceId);
  }

  const byStatus = {};
  for (const s of STATUSES) byStatus[s] = 0;
  for (const a of applications) byStatus[a.status] = (byStatus[a.status] || 0) + 1;

  const total = applications.length;
  const applied = applications.filter((a) => a.status !== '准备中').length;
  const interviewing = byStatus['面试'];
  const offers = byStatus['Offer'];
  const rejected = byStatus['已淘汰'];
  const active = applied - offers - rejected;

  const applyToInterviewRate =
    applied > 0 ? Math.round(((interviewing + offers) / applied) * 1000) / 10 : null;
  const interviewToOfferRate =
    interviewing + offers > 0 ? Math.round((offers / (interviewing + offers)) * 1000) / 10 : null;

  // 各阶段平均耗时（基于投递的节点日期）
  const milestones = db
    .prepare(
      `SELECT m.* FROM milestones m JOIN applications a ON a.id = m.application_id
       WHERE a.space_id = ? AND a.created_at >= COALESCE(?, '1970-01-01')`
    )
    .all(req.spaceId, cutoff || '1970-01-01');

  const stageDate = new Map(); // applicationId -> { apply, exam, interview, offer }
  for (const m of milestones) {
    if (!m.date) continue;
    const implied = statusFromMilestoneName(m.name);
    if (!implied) continue;
    const bucket = stageDate.get(m.application_id) || {};
    const key =
      implied === '已投递'
        ? 'apply'
        : implied === '笔试'
        ? 'exam'
        : implied === '面试'
        ? 'interview'
        : implied === 'Offer'
        ? 'offer'
        : null;
    if (!key) continue;
    if (!bucket[key] || m.date < bucket[key]) bucket[key] = m.date;
    stageDate.set(m.application_id, bucket);
  }

  const avg = (fn) => {
    const vals = [...stageDate.values()].map(fn).filter((v) => v !== null && v >= 0);
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  };

  const durations = {
    apply_to_exam: avg((s) => (s.apply && s.exam ? daysBetween(s.apply, s.exam) : null)),
    exam_to_interview: avg((s) => (s.exam && s.interview ? daysBetween(s.exam, s.interview) : null)),
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
