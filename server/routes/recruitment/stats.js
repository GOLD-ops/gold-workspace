const express = require('express');
const db = require('../../db');
const { STATUSES, statusFromMilestoneName } = require('./helpers');

const router = express.Router();

function rangeCutoff(range) {
  if (range === 'week') return new Date(Date.now() - 7 * 86400000).toISOString();
  if (range === 'month') return new Date(Date.now() - 30 * 86400000).toISOString();
  return null;
}

function hoursBetween(dateA, dateB) {
  const parseLocal = (s) => {
    const str = String(s || '');
    if (!str) return null;
    return str.includes('T') ? new Date(str) : new Date(`${str}T00:00:00`);
  };
  const a = parseLocal(dateA);
  const b = parseLocal(dateB);
  if (!a || !b || Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return (b - a) / 3600000;
}

router.get('/', (req, res) => {
  const range = ['week', 'month', 'all', 'custom'].includes(req.query.range)
    ? req.query.range
    : 'all';
  let cutoff = null;
  let cutoffTo = null;
  if (range === 'week' || range === 'month') {
    cutoff = rangeCutoff(range);
  } else if (range === 'custom') {
    cutoff = req.query.from || null;
    cutoffTo = req.query.to || null;
  }

  // 空间内公司（无投递的公司视为「未投递」）
  let companySql = 'SELECT id FROM companies WHERE space_id = ?';
  const companyParams = [req.spaceId];
  if (cutoff) {
    companySql += ' AND created_at >= ?';
    companyParams.push(cutoff);
  }
  if (cutoffTo) {
    companySql += ' AND created_at <= ?';
    companyParams.push(`${cutoffTo}T23:59:59.999Z`);
  }
  const companies = db.prepare(companySql).all(...companyParams);
  const companiesWithApps = new Set(
    db
      .prepare('SELECT DISTINCT company_id FROM applications WHERE space_id = ?')
      .all(req.spaceId)
      .map((r) => r.company_id)
  );
  const noAppCompanies = companies.filter((c) => !companiesWithApps.has(c.id)).length;

  let applications;
  let appSql = 'SELECT * FROM applications WHERE space_id = ?';
  const appParams = [req.spaceId];
  if (cutoff) {
    appSql += ' AND created_at >= ?';
    appParams.push(cutoff);
  }
  if (cutoffTo) {
    appSql += ' AND created_at <= ?';
    appParams.push(`${cutoffTo}T23:59:59.999Z`);
  }
  appSql += ' ORDER BY id';
  applications = db.prepare(appSql).all(...appParams);

  const byStatus = {};
  for (const s of STATUSES) byStatus[s] = 0;
  for (const a of applications) byStatus[a.status] = (byStatus[a.status] || 0) + 1;
  byStatus['未投递'] += noAppCompanies;

  const total = applications.length + noAppCompanies;
  const applied = applications.filter((a) => a.status !== '未投递').length;
  const interviewing = byStatus['面试'];
  const offers = byStatus['Offer'];
  const rejected = byStatus['已淘汰'];
  const active = applied - offers - rejected;

  const applyToInterviewRate =
    applied > 0 ? Math.round(((interviewing + offers) / applied) * 1000) / 10 : null;
  const interviewToOfferRate =
    interviewing + offers > 0 ? Math.round((offers / (interviewing + offers)) * 1000) / 10 : null;

  // 各阶段平均耗时（基于投递的节点日期）
  let msSql =
    `SELECT m.* FROM milestones m JOIN applications a ON a.id = m.application_id
     WHERE a.space_id = ? AND a.created_at >= COALESCE(?, '1970-01-01')`;
  const msParams = [req.spaceId, cutoff || '1970-01-01'];
  if (cutoffTo) {
    msSql += ' AND a.created_at <= ?';
    msParams.push(`${cutoffTo}T23:59:59.999Z`);
  }
  const milestones = db.prepare(msSql).all(...msParams);

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
    apply_to_exam: avg((s) => (s.apply && s.exam ? hoursBetween(s.apply, s.exam) : null)),
    exam_to_interview: avg((s) => (s.exam && s.interview ? hoursBetween(s.exam, s.interview) : null)),
    interview_to_offer: avg((s) =>
      s.interview && s.offer ? hoursBetween(s.interview, s.offer) : null
    ),
    apply_to_offer: avg((s) =>
      s.apply && s.offer ? hoursBetween(s.apply, s.offer) : null
    ),
    avg_per_stage: avg((s) => {
      if (!s.apply || !s.offer) return null;
      const stages = [s.apply, s.exam, s.interview, s.offer].filter(Boolean).length;
      if (stages < 2) return null;
      return hoursBetween(s.apply, s.offer) / (stages - 1);
    }),
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
