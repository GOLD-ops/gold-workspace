const express = require('express');
const db = require('../../db');
const mailer = require('../../mailer');
const auth = require('../../auth');
const applications = require('./applications');

const router = express.Router();

const SECRET_KEYS = ['ai_api_key'];
const USER_KEYS = ['email', 'silence_days', 'silence_enabled', 'remind_enabled', 'remind_value', 'remind_unit', 'remind_time'];

function mask(value) {
  if (!value) return '';
  if (value.length <= 6) return '******';
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

function readGlobalSettings(masked = true) {
  const s = mailer.getSettings();
  const out = {
    ai_provider: s.ai_provider || 'deepseek',
    ai_base_url: s.ai_base_url || '',
    ai_model: s.ai_model || '',
    ai_api_key: s.ai_api_key || '',
    invite_required: s.invite_required || '0',
    invite_code: s.invite_code || '',
  };
  if (masked && out.ai_api_key) out.ai_api_key = mask(out.ai_api_key);
  return out;
}

// 当前用户的个性化设置（接收邮箱、沉默天数）
function readUserSettings(userId) {
  const u = auth.userById(userId);
  return {
    email: (u && u.email) || '',
    silence_days: (u && u.silence_days) || '14',
    silence_enabled: String(
      u && u.silence_enabled !== undefined && u.silence_enabled !== null ? u.silence_enabled : 1
    ),
    remind_enabled: String((u && u.remind_enabled !== undefined && u.remind_enabled !== null ? u.remind_enabled : 1)),
    remind_value: (u && u.remind_value) || '1',
    remind_unit: (u && u.remind_unit) || 'day',
    remind_time: (u && u.remind_time) || '08:00',
  };
}

function readSpaceAiConfig(spaceId, masked = true) {
  const row = db
    .prepare('SELECT * FROM recruitment_ai_config WHERE space_id = ?')
    .get(spaceId);
  const out = {
    ai_provider: (row && row.ai_provider) || 'deepseek',
    ai_base_url: (row && row.ai_base_url) || '',
    ai_model: (row && row.ai_model) || '',
    ai_api_key: (row && row.ai_api_key) || '',
  };
  if (masked && out.ai_api_key) out.ai_api_key = mask(out.ai_api_key);
  return out;
}

function upsertSpaceAiConfig(spaceId, patch) {
  const current = readSpaceAiConfig(spaceId, false);
  const next = { ...current };
  for (const key of ['ai_provider', 'ai_base_url', 'ai_model', 'ai_api_key']) {
    if (patch[key] === undefined) continue;
    let v = String(patch[key]);
    if (key === 'ai_api_key') {
    if (v === '' || String(v).includes('****')) v = current.ai_api_key || '';
    }
    next[key] = v;
  }
  db.prepare(
    `INSERT INTO recruitment_ai_config (space_id, ai_provider, ai_base_url, ai_model, ai_api_key, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(space_id) DO UPDATE SET
       ai_provider = excluded.ai_provider,
       ai_base_url = excluded.ai_base_url,
       ai_model = excluded.ai_model,
       ai_api_key = excluded.ai_api_key,
       updated_at = excluded.updated_at`
  ).run(
    spaceId,
    next.ai_provider,
    next.ai_base_url,
    next.ai_model,
    next.ai_api_key,
    new Date().toISOString()
  );
}

router.get('/', (req, res) => {
  const uid = req.user ? req.user.id : null;
  const out = {
    ...readUserSettings(uid),
    ...readSpaceAiConfig(req.spaceId, true),
  };
  const g = readGlobalSettings(true);
  if (req.user && req.user.is_admin) {
    out.invite_required = g.invite_required;
    out.invite_code = g.invite_code;
  }
  res.json(out);
});

router.put('/', (req, res) => {
  const body = req.body || {};

  // 用户级设置：所有人可修改自己的
  const userPatch = {};
  for (const key of USER_KEYS) {
    if (body[key] !== undefined) userPatch[key] = String(body[key]);
  }
  if (Object.keys(userPatch).length && req.user) {
    const sets = Object.keys(userPatch)
      .map((k) => `${k} = ?`)
      .join(', ');
    const vals = Object.keys(userPatch).map((k) => userPatch[k]);
    db.prepare(`UPDATE users SET ${sets} WHERE id = ?`).run(...vals, req.user.id);
    // 提醒规则变化：重新同步该用户所有“待进行”节点的提醒
    const remindKeys = ['remind_enabled', 'remind_value', 'remind_unit', 'remind_time'];
    if (remindKeys.some((k) => body[k] !== undefined)) {
      const spaces = db.prepare('SELECT id FROM spaces WHERE user_id = ?').all(req.user.id);
      const waiting = db.prepare(
        `SELECT m.* FROM milestones m JOIN applications a ON a.id = m.application_id
         WHERE a.space_id = ? AND m.result = 'waiting'`
      );
      for (const sp of spaces) {
        for (const m of waiting.all(sp.id)) {
          applications.syncReminderForMilestone(
            m.id,
            m.application_id,
            sp.id,
            m.date,
            'waiting'
          );
        }
      }
    }
  }

  // AI 配置：管理员保存全局（供未配置的空间回退），其他用户保存到自己的空间
  const adminPatch = {};
  for (const key of ['ai_provider', 'ai_base_url', 'ai_model', 'ai_api_key']) {
    if (body[key] !== undefined) adminPatch[key] = String(body[key]);
  }
  if (Object.keys(adminPatch).length && req.user && req.user.is_admin) {
    const current = readGlobalSettings(false);
    for (const [key, value] of Object.entries(adminPatch)) {
      let v = value;
      if (SECRET_KEYS.includes(key)) {
        if (v === '' || String(v).includes('****')) v = current[key] || '';
      }
      db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run(key, v);
    }
  } else if (Object.keys(adminPatch).length) {
    upsertSpaceAiConfig(req.spaceId, adminPatch);
  }

  // 邀请码等全局配置：仅管理员（非管理员提交时静默忽略，避免前端默认值触发权限错误）
  const invitePatch = {};
  for (const key of ['invite_required', 'invite_code']) {
    if (body[key] !== undefined) invitePatch[key] = String(body[key]);
  }
  if (Object.keys(invitePatch).length && req.user && req.user.is_admin) {
    for (const [key, value] of Object.entries(invitePatch)) {
      db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run(key, value);
    }
  }

  const uid = req.user ? req.user.id : null;
  const out = {
    ...readUserSettings(uid),
    ...readSpaceAiConfig(req.spaceId, true),
  };
  if (req.user && req.user.is_admin) {
    Object.assign(out, readGlobalSettings(true));
  }
  res.json(out);
});

router.post('/test-mail', async (req, res) => {
  if (!req.user) return res.status(400).json({ error: '游客请先登录后使用邮件提醒' });
  const to = auth.userById(req.user.id).email;
  if (!to) return res.status(400).json({ error: '请先填写接收提醒的邮箱' });
  try {
    const r = await mailer.sendMail(
      to,
      '【秋招追踪器】测试邮件',
      mailer.mailTemplate('邮件配置测试成功', [
        ['说明', '这是一封来自秋招追踪器的测试邮件'],
        ['时间', new Date().toLocaleString('zh-CN')],
      ])
    );
    if (r.skipped) return res.status(400).json({ error: r.reason || '发信账号未配置' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: `发送失败：${err.message}` });
  }
});

router.post('/mail-check', async (req, res) => {
  if (!req.user) return res.status(400).json({ error: '游客请先登录后使用邮件提醒' });
  const r = await mailer.checkReminders(req.user.id);
  res.json(r);
});

router.get('/reminders', (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.*, c.name AS company, a.position, m.name AS milestone_name
       FROM reminders r
       JOIN applications a ON a.id = r.application_id
       JOIN companies c ON c.id = a.company_id
       LEFT JOIN milestones m ON m.id = r.milestone_id
       WHERE r.space_id = ?
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT 100`
    )
    .all(req.spaceId);
  res.json(rows);
});

module.exports = router;
