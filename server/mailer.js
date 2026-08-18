const dns = require('dns');

// 本机 DNS 指向本地代理（127.0.0.1）时，Node 内置解析可能超时，
// 补充公共 DNS 兜底。必须在 require('nodemailer') 之前执行，
// 因为 nodemailer 加载时会创建自己的 DNS 解析器并捕获默认服务器。
try {
  const servers = dns.getServers();
  if (servers.length === 1 && servers[0] === '127.0.0.1') {
    dns.setServers(['223.5.5.5', '119.29.29.29', '127.0.0.1']);
  }
} catch {
  // 忽略 DNS 配置失败
}

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const net = require('net');
const db = require('./db');

const DEFAULT_SILENCE_DAYS = 14;
let schedulerTimer = null;

// 可选加载 .env（避免额外依赖）：环境变量优先，网页不再暴露 SMTP 配置
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
} catch {
  // 忽略 .env 读取错误
}

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = {};
  for (const r of rows) s[r.key] = r.value;
  // 接收邮箱：网页设置保存的优先，未设置时回退到环境变量 MAIL_TO
  s.email = s.email || process.env.MAIL_TO || '';
  // 发信账号：仅由服务器端配置（环境变量 / .env），不暴露给网页
  s.smtp_host = process.env.SMTP_HOST || s.smtp_host || '';
  s.smtp_port = process.env.SMTP_PORT || s.smtp_port || '';
  s.smtp_secure = process.env.SMTP_SECURE || s.smtp_secure || '';
  s.smtp_user = process.env.SMTP_USER || s.smtp_user || '';
  s.smtp_pass = process.env.SMTP_PASS || s.smtp_pass || '';
  return s;
}

function resolveHostAddress(host) {
  return new Promise((resolve) => {
    if (net.isIP(host)) return resolve(null);
    dns.lookup(host, { all: true }, (err, addresses) => {
      if (err || !addresses || !addresses.length) return resolve(null);
      const v4 = addresses.find((a) => a.family === 4);
      const chosen = v4 || addresses[0];
      resolve(chosen ? chosen.address : null);
    });
  });
}

async function createTransport() {
  const s = getSettings();
  if (!s.smtp_host || !s.smtp_user || !s.smtp_pass) return null;
  const port = Number(s.smtp_port) || 465;
  const secure =
    s.smtp_secure === 'ssl' || (s.smtp_secure !== 'none' && port === 465);
  const opts = {
    host: s.smtp_host,
    port,
    secure,
    auth: { user: s.smtp_user, pass: s.smtp_pass },
  };
  // 用系统解析把域名解析为 IP 后交给 nodemailer，规避部分环境下
  // Node 内置解析器（c-ares / dns.Resolver）不可用导致连接超时；
  // TLS 通过 servername 保持域名 SNI 与证书校验
  const ip = await resolveHostAddress(s.smtp_host);
  if (ip) {
    opts.host = ip;
    opts.tls = { servername: s.smtp_host };
  }
  return nodemailer.createTransport(opts);
}

async function sendMail(to, subject, html) {
  const s = getSettings();
  const transport = await createTransport();
  if (!to || !transport) {
    return { ok: false, skipped: true, reason: '未配置邮箱或 SMTP' };
  }
  await transport.sendMail({
    from: `"秋招追踪器" <${s.smtp_user}>`,
    to,
    subject,
    html,
  });
  return { ok: true };
}

function mailTemplate(title, lines) {
  const items = (lines || [])
    .map(
      (l) =>
        `<tr><td style="padding:6px 0;color:#555;font-size:14px;line-height:1.6"><span style="color:#999;display:inline-block;min-width:72px">${l[0]}</span>${l[1]}</td></tr>`
    )
    .join('');
  return `
    <div style="font-family:-apple-system,'Segoe UI','Microsoft YaHei',sans-serif;background:#f6f8fa;padding:24px">
      <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e8edf2">
        <div style="background:#4a90d9;padding:18px 24px;color:#fff;font-size:16px;font-weight:600">🎯 ${title}</div>
        <div style="padding:20px 24px">
          <table>${items}</table>
          <p style="color:#aaa;font-size:12px;margin-top:18px;border-top:1px solid #f0f0f0;padding-top:12px">
            本邮件由「秋招追踪器」自动发送，请勿直接回复。
          </p>
        </div>
      </div>
    </div>`;
}

async function checkForUser(u) {
  const to = u.email;
  if (!to) return { sent: 0, skipped: true, reason: '未填写接收邮箱' };
  const transport = await createTransport();
  if (!transport) return { sent: 0, skipped: true, reason: '发信账号未配置' };

  let sent = 0;
  const now = new Date().toISOString();

  // 1) 节点定时提醒（到点未发送）
  const due = db
    .prepare(
      `SELECT r.id, r.remind_at, c.name AS company, a.position, m.name AS milestone_name, m.date AS milestone_date
       FROM reminders r
       JOIN applications a ON a.id = r.application_id
       JOIN companies c ON c.id = a.company_id
       LEFT JOIN milestones m ON m.id = r.milestone_id
       WHERE r.user_id = ? AND r.sent = 0 AND r.remind_at <> '' AND r.remind_at <= ?`
    )
    .all(u.id, now);

  for (const r of due) {
    try {
      await sendMail(
        to,
        `【秋招追踪】${r.company} · ${r.milestone_name || '节点'}提醒`,
        mailTemplate('节点提醒', [
          ['公司', r.company + (r.position ? ` · ${r.position}` : '')],
          ['节点', r.milestone_name || '—'],
          ['时间', r.milestone_date ? `${r.milestone_date} 09:00` : '—'],
          ['建议', '登录追踪器查看进展并做好相应准备'],
        ])
      );
      db.prepare('UPDATE reminders SET sent = 1 WHERE id = ?').run(r.id);
      sent++;
    } catch (err) {
      console.error('[mailer] 节点提醒发送失败:', err.message);
    }
  }

  // 2) 沉默提醒：活跃状态但超过 N 天无进展（0 表示关闭）
  const silenceEnabled =
    u.silence_days !== undefined &&
    String(u.silence_days).trim() !== '' &&
    Number(u.silence_days) > 0;
  if (silenceEnabled) {
    const silenceDays = Number(u.silence_days);
    const cutoff = new Date(Date.now() - silenceDays * 86400000).toISOString();
    const quiet = db
      .prepare(
        `SELECT a.id, c.name AS company, a.position FROM applications a
         JOIN companies c ON c.id = a.company_id
         JOIN spaces sp ON sp.id = a.space_id
         WHERE sp.user_id = ? AND a.status IN ('已投递', '笔试', '面试') AND a.updated_at < ?`
      )
      .all(u.id, cutoff);

    for (const c of quiet) {
      const recent = db
        .prepare(
          `SELECT COUNT(*) AS n FROM reminders WHERE application_id = ? AND kind = 'silence' AND created_at > ?`
        )
        .get(c.id, cutoff).n;
      if (recent > 0) continue;
      try {
        await sendMail(
          to,
          `【秋招追踪】${c.company} 已 ${silenceDays} 天没有进展`,
          mailTemplate('沉默提醒 · 建议跟进', [
            ['公司', c.company + (c.position ? ` · ${c.position}` : '')],
            ['现状', `已超过 ${silenceDays} 天无进展更新`],
            ['建议', '主动跟进 HR / 内推人，或更新节点状态避免机会流失'],
          ])
        );
        db.prepare(
          `INSERT INTO reminders (application_id, user_id, email, remind_at, sent, kind, created_at)
           VALUES (?, ?, ?, ?, 1, 'silence', ?)`
        ).run(c.id, u.id, to, now, now);
        sent++;
      } catch (err) {
        console.error('[mailer] 沉默提醒发送失败:', err.message);
      }
    }
  }

  return { sent };
}

async function checkReminders(userId) {
  if (userId) {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!u) return { sent: 0 };
    return checkForUser(u);
  }
  const users = db.prepare('SELECT * FROM users').all();
  let sent = 0;
  for (const u of users) {
    sent += (await checkForUser(u)).sent;
  }
  return { sent };
}

function startMailScheduler() {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(() => {
    checkReminders().catch((err) => console.error('[mailer] 调度失败:', err.message));
  }, 60000);
  setTimeout(() => checkReminders().catch(() => {}), 5000);
}

module.exports = {
  getSettings,
  sendMail,
  checkReminders,
  startMailScheduler,
  mailTemplate,
  DEFAULT_SILENCE_DAYS,
};
