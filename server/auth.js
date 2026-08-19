const crypto = require('crypto');
const db = require('./db');
const { seedSpace } = require('./seed-data');
const spaces = require('./spaces');

const SESSION_DAYS = 30;

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    is_admin: !!u.is_admin,
    email: u.email || '',
    silence_days: u.silence_days || '14',
  };
}

function userById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function userByEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return null;
  return db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(e);
}

function createUser(username, password, isAdmin = false, email = '') {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const r = db
    .prepare(
      'INSERT INTO users (username, password_hash, salt, is_admin, email, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(username, hash, salt, isAdmin ? 1 : 0, String(email || '').trim(), new Date().toISOString());
  return r.lastInsertRowid;
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(
    token,
    userId,
    new Date(now).toISOString(),
    new Date(now + SESSION_DAYS * 86400000).toISOString()
  );
  return token;
}

function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function userByToken(token) {
  if (!token) return null;
  return db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, new Date().toISOString());
}

// 注册：始终创建普通用户（管理员由服务器端 .env 预设）
function register(username, password, inviteCode, email = '') {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;

  if (count > 0) {
    const requireInvite = db
      .prepare(`SELECT value FROM settings WHERE key = 'invite_required'`)
      .get();
    const code = db.prepare(`SELECT value FROM settings WHERE key = 'invite_code'`).get();
    if (requireInvite && requireInvite.value === '1') {
      if (!inviteCode || inviteCode !== (code ? code.value : '')) {
        return { error: '注册需要正确的邀请码' };
      }
    }
  }

  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    return { error: '昵称已被占用，请换一个' };
  }
  const e = String(email || '').trim().toLowerCase();
  if (e && userByEmail(e)) {
    return { error: '该邮箱已被注册，请直接登录或更换邮箱' };
  }

  const userId = createUser(username, password, false, e);
  return { userId, isAdmin: false };
}

// 根据 .env / 环境变量预设管理员：不存在则创建，密码变化则同步，并接管历史无主数据
function ensureAdmin() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return null;
  const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (existing) {
    const hash = hashPassword(password, existing.salt);
    if (hash !== existing.password_hash || !existing.is_admin || !existing.email) {
      const salt = crypto.randomBytes(16).toString('hex');
      const adminEmail =
        process.env.ADMIN_EMAIL || process.env.MAIL_TO || existing.email || '';
      db.prepare(
        'UPDATE users SET password_hash = ?, salt = ?, is_admin = 1, email = COALESCE(NULLIF(?, \'\'), email) WHERE id = ?'
      ).run(hashPassword(password, salt), salt, adminEmail, existing.id);
    }
    return existing.id;
  }
  const adminEmail = process.env.ADMIN_EMAIL || process.env.MAIL_TO || '';
  const id = createUser(username, password, true, adminEmail);
  db.prepare('UPDATE companies SET user_id = ? WHERE user_id IS NULL').run(id);
  const space = spaces.ensureUserSpace(id);
  seedSpace(space.id);
  return id;
}

// 登录：仅支持邮箱 + 密码
function login(email, password) {
  const u = userByEmail(email);
  if (!u) return { error: '邮箱或密码不正确' };
  const hash = hashPassword(password, u.salt);
  if (hash !== u.password_hash) return { error: '邮箱或密码不正确' };
  return { user: u };
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const user = userByToken(token);
  if (!user) return res.status(401).json({ error: '请先登录' });
  req.user = user;
  req.userId = user.id;
  req.token = token;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

// 业务接口鉴权：正式用户（Bearer）或游客（X-Space-Token）均可使用
function requireSpace(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token) {
    const user = userByToken(token);
    if (!user) return res.status(401).json({ error: '登录已过期，请重新登录' });
    const space = spaces.ensureUserSpace(user.id);
    req.user = user;
    req.userId = user.id;
    req.spaceId = space.id;
    return next();
  }
  const guestToken = req.headers['x-space-token'] || '';
  const space = spaces.getOrCreateSpaceByToken(guestToken);
  if (!space) return res.status(400).json({ error: '缺少空间标识' });
  req.spaceId = space.id;
  seedSpace(space.id); // 游客首次使用自动导入初始数据（幂等）
  next();
}

module.exports = {
  hashPassword,
  publicUser,
  userById,
  userByEmail,
  createUser,
  createSession,
  destroySession,
  userByToken,
  register,
  ensureAdmin,
  login,
  requireAuth,
  requireAdmin,
  requireSpace,
};
