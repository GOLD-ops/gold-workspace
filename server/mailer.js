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

// 邮件外壳：统一的页头与内边距，所有模板复用
const LOGO_URL = 'http://47.98.114.221/logo-preview.png';
function mailShell(bodyHtml) {
  return `
    <div style="font-family:-apple-system,'Segoe UI','Microsoft YaHei',sans-serif;background:#f2f4f8;padding:28px 16px">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6eaf0">
        <div style="padding:18px 28px 14px;border-bottom:1px solid #eef1f6">
          <img src="${LOGO_URL}" width="26" height="26" alt="GOLD" style="border:0;vertical-align:middle;border-radius:6px" />
          <span style="vertical-align:middle;margin-left:8px;font-size:13px;font-weight:600;color:#6b7280;letter-spacing:0.5px">GOLD 秋招追踪器</span>
        </div>
        <div style="padding:24px 28px 22px">${bodyHtml}</div>
      </div>
    </div>`;
}

function mailTemplate(title, lines) {
  const items = (lines || [])
    .map(
      (l) =>
        `<tr>
          <td style="padding:7px 0;width:76px;color:#9aa3b2;font-size:13px;line-height:1.6;vertical-align:top">${l[0]}</td>
          <td style="padding:7px 0;color:#374151;font-size:14px;line-height:1.6;vertical-align:top;word-break:break-word">${l[1]}</td>
        </tr>`
    )
    .join('');
  return mailShell(
    `<div style="font-size:16px;font-weight:700;color:#1b2333;margin-bottom:14px">${title}</div>
     <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">${items}</table>
     <p style="color:#a8b0bd;font-size:12px;margin:20px 0 0;border-top:1px solid #eef1f6;padding-top:14px">本邮件由「秋招追踪器」自动发送，请勿直接回复。</p>`
  );
}

const SITE_URL = 'http://47.98.114.221/tools/recruitment';

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function adviceForMilestone(name = '') {
  const n = String(name || '').toLowerCase();
  if (n.includes('笔试') || n.includes('机试') || n.includes('测评')) {
    return [
      '提前检查电脑、摄像头与网络，确保笔试环境稳定',
      '做一次限时模拟，熟悉题型与时间分配',
      '复习岗位相关的核心基础知识，保持手感',
    ];
  }
  if (n.includes('面试') || n.includes('群面')) {
    return [
      '重新阅读该岗位的职位描述，梳理与岗位匹配的经历',
      '准备自我介绍与高频问题（项目深挖、优缺点、职业规划等）',
      '提前测试音视频设备，找一个安静、网络稳定的环境',
    ];
  }
  if (n.includes('offer')) {
    return [
      '仔细确认薪资、福利、工作地点与入职时间等关键信息',
      '准备入职所需材料（证件、学历证明、体检等）',
    ];
  }
  return ['登录追踪器查看该投递的最新进展', '根据节点类型提前做好相应准备'];
}

function buildGreeting(company, position, milestoneName, timeLabel) {
  const pos = position ? `「${position}」` : '';
  const name = milestoneName || '节点';
  const n = String(name).toLowerCase();
  const when = timeLabel ? `（${timeLabel}）` : '';
  if (n.includes('offer')) {
    return `你好，${company}${pos}的 Offer 已到，请及时查看确认～`;
  }
  if (n.includes('笔试') || n.includes('机试') || n.includes('测评')) {
    return `你好，${company}${pos}的${name}将在 ${timeLabel} 开始，请提前做好准备～`;
  }
  if (n.includes('面试') || n.includes('群面')) {
    return `你好，${company}${pos}的${name}即将到来${when}，请提前做好准备～`;
  }
  return `你好，${company}${pos}的「${name}」即将到来${when}，请提前做好准备～`;
}

function sectionTitle(label) {
  return `<div style="font-size:13px;font-weight:700;color:#1b2333;border-left:3px solid #3d6ee0;padding-left:8px;line-height:1.3">${label}</div>`;
}

function richMailTemplate({ headline = '', rows = [], advice = [], requirements = '', progress = [], buttonText = '', buttonUrl = '' }) {
  const rowsHtml = rows
    .map(
      (l) =>
        `<tr>
          <td style="padding:7px 0;width:72px;color:#9aa3b2;font-size:13px;line-height:1.6;vertical-align:top">${l[0]}</td>
          <td style="padding:7px 0;color:#374151;font-size:14px;line-height:1.6;vertical-align:top;word-break:break-word">${l[1]}</td>
        </tr>`
    )
    .join('');
  const heroHtml = `
    ${headline ? `<div style="font-size:18px;font-weight:700;color:#1b2333;letter-spacing:-0.2px">${headline}</div>` : ''}
    ${rowsHtml ? `<table cellpadding="0" cellspacing="0" style="margin-top:12px;border-collapse:collapse">${rowsHtml}</table>` : ''}
  `;
  const adviceHtml = advice.length
    ? `<div style="margin-top:24px">${sectionTitle('准备建议')}
        <ul style="margin:12px 0 0;padding-left:18px">${advice
          .map(
            (a) =>
              `<li style="margin:6px 0;color:#4a5568;font-size:13.5px;line-height:1.7">${a}</li>`
          )
          .join('')}</ul></div>`
    : '';
  const reqHtml = requirements
    ? `<div style="margin-top:24px">${sectionTitle('职位描述')}
        <div style="margin-top:12px;color:#4a5568;font-size:13.5px;line-height:1.8;white-space:pre-wrap;word-break:break-word">${requirements}</div></div>`
    : '';
  const progHtml = progress.length
    ? `<div style="margin-top:24px">${sectionTitle('当前进展')}
        <div style="margin-top:12px;color:#374151;font-size:13.5px;line-height:1.8">${progress.join(
          ' <span style="color:#c0c7d1;padding:0 2px">→</span> '
        )}</div></div>`
    : '';
  const btnHtml =
    buttonText && buttonUrl
      ? `<div style="margin:26px 0 6px;text-align:center"><a href="${buttonUrl}" style="display:inline-block;background:#3d6ee0;color:#ffffff;text-decoration:none;padding:11px 30px;border-radius:8px;font-size:14px;font-weight:600">${buttonText}</a></div>`
      : '';
  return mailShell(
    `${heroHtml}
     ${adviceHtml}
     ${reqHtml}
     ${progHtml}
     ${btnHtml}
     <p style="color:#a8b0bd;font-size:12px;margin:22px 0 0;border-top:1px solid #eef1f6;padding-top:14px;text-align:center">本邮件由「GOLD 秋招追踪器」自动发送；提醒规则可在追踪器的设置页中调整。</p>`
  );
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
      `SELECT r.id, r.remind_at, r.application_id, c.name AS company, a.position, a.requirements,
              a.status AS app_status, m.id AS milestone_id, m.name AS milestone_name,
              m.date AS milestone_date, m.result AS milestone_result
       FROM reminders r
       JOIN applications a ON a.id = r.application_id
       JOIN companies c ON c.id = a.company_id
       LEFT JOIN milestones m ON m.id = r.milestone_id
       WHERE r.user_id = ? AND r.sent = 0 AND r.remind_at <> '' AND r.remind_at <= ?`
    )
    .all(u.id, now);

  const nowMs = Date.now();
  for (const r of due) {
    // 节点已删除、结果已不是“待进行”，或节点时间已过但状态未更新时，静默跳过，不再发送
    let expired = false;
    const md = r.milestone_date || '';
    if (md) {
      const dt = new Date(md.includes('T') ? md : `${md}T23:59:59`);
      if (!Number.isNaN(dt.getTime()) && dt.getTime() < nowMs) expired = true;
    }
    if (!r.milestone_id || (r.milestone_result && r.milestone_result !== 'waiting') || expired) {
      // 过期或已失效的提醒不再保留记录，避免出现在“最近提醒记录”中
      db.prepare('DELETE FROM reminders WHERE id = ?').run(r.id);
      continue;
    }
    try {
      const md = r.milestone_date || '';
      const timeLabel = md ? fmtDateTime(md.includes('T') ? md : `${md}T09:00:00`) : '—';
      const milestones = db
        .prepare(
          `SELECT name, date FROM milestones WHERE application_id = ?
           ORDER BY (date IS NULL OR date = '') ASC, date ASC, id ASC`
        )
        .all(r.application_id);
      const progress = milestones.map(
        (m) => m.name + (m.date ? `(${fmtDateTime(m.date).slice(5, 10)})` : '')
      );
      await sendMail(
        to,
        `【秋招追踪】${r.company} · ${r.milestone_name || '节点'}提醒`,
        richMailTemplate({
          headline: [r.company, r.position].filter(Boolean).join(' · '),
          rows: [
            ['时间', timeLabel],
            ['当前阶段', r.app_status || '—'],
          ],
          advice: adviceForMilestone(r.milestone_name),
          requirements: r.requirements || '',
          progress,
          buttonText: '查看详情',
          buttonUrl: SITE_URL,
        })
      );
      db.prepare("UPDATE reminders SET sent = 1, last_error = '' WHERE id = ?").run(r.id);
      sent++;
    } catch (err) {
      console.error('[mailer] 阶段提醒发送失败:', err.message);
      db.prepare('UPDATE reminders SET last_error = ? WHERE id = ?').run(
        String(err.message || '发送失败').slice(0, 300),
        r.id
      );
    }
  }

  // 2) 沉默提醒：活跃状态但超过 N 天无进展（0 表示关闭）
  const silenceSwitch =
    String(
      u.silence_enabled === undefined || u.silence_enabled === null ? 1 : u.silence_enabled
    ) !== '0';
  const silenceEnabled =
    silenceSwitch &&
    u.silence_days !== undefined &&
    String(u.silence_days).trim() !== '' &&
    Number(u.silence_days) > 0;
  if (silenceEnabled) {
    const silenceDays = Number(u.silence_days);
    const cutoff = new Date(Date.now() - silenceDays * 86400000).toISOString();
    const quiet = db
      .prepare(
        `SELECT a.id, c.name AS company, a.position, a.status, a.updated_at FROM applications a
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
        const milestones = db
          .prepare(
            `SELECT name, date FROM milestones WHERE application_id = ?
             ORDER BY (date IS NULL OR date = '') ASC, date ASC, id ASC`
          )
          .all(c.id);
        const progress = milestones.map(
          (m) => m.name + (m.date ? `(${fmtDateTime(m.date).slice(5, 10)})` : '')
        );
        await sendMail(
          to,
          `【秋招追踪】${c.company} 已 ${silenceDays} 天没有进展`,
          richMailTemplate({
            headline: c.company,
            rows: [
              ['当前阶段', c.status || '—'],
              ['最后更新', c.updated_at ? fmtDateTime(c.updated_at) : '—'],
            ],
            advice: [
              '主动联系 HR 或内推人，了解最新进展',
              '登录追踪器更新节点状态，避免机会流失',
            ],
            progress,
            buttonText: '查看详情',
            buttonUrl: SITE_URL,
          })
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
  richMailTemplate,
  adviceForMilestone,
  buildGreeting,
  fmtDateTime,
  DEFAULT_SILENCE_DAYS,
};
