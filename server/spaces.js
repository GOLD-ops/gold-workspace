const crypto = require('crypto');
const db = require('./db');

function randomToken() {
  return crypto.randomBytes(16).toString('hex');
}

function getSpaceByToken(token) {
  if (!token || typeof token !== 'string' || token.length < 8) return null;
  return db.prepare('SELECT * FROM spaces WHERE token = ?').get(token);
}

function getSpaceById(id) {
  return db.prepare('SELECT * FROM spaces WHERE id = ?').get(id);
}

function getSpaceByUser(userId) {
  return db.prepare('SELECT * FROM spaces WHERE user_id = ? ORDER BY id LIMIT 1').get(userId);
}

function createSpace(token, userId = null) {
  const r = db
    .prepare('INSERT INTO spaces (token, user_id, created_at) VALUES (?, ?, ?)')
    .run(token || randomToken(), userId, new Date().toISOString());
  return getSpaceById(r.lastInsertRowid);
}

// 游客空间：按 token 查找，不存在则创建
function getOrCreateSpaceByToken(token) {
  if (!token || typeof token !== 'string' || token.length < 8) return null;
  return getSpaceByToken(token) || createSpace(token);
}

// 正式用户空间：不存在则创建
function ensureUserSpace(userId) {
  return getSpaceByUser(userId) || createSpace(randomToken(), userId);
}

// 把游客空间绑定到账号（未绑定他人时），实现游客数据合并
function bindSpaceToUser(token, userId) {
  const space = getSpaceByToken(token);
  if (!space) return { error: '空间不存在' };
  if (space.user_id && space.user_id !== userId) {
    return { error: '该空间已绑定其他账号' };
  }
  if (space.user_id === userId) return { ok: true, space };
  db.prepare('UPDATE spaces SET user_id = ? WHERE id = ?').run(userId, space.id);
  return { ok: true, space: getSpaceById(space.id) };
}

module.exports = {
  randomToken,
  getSpaceByToken,
  getSpaceById,
  getSpaceByUser,
  createSpace,
  getOrCreateSpaceByToken,
  ensureUserSpace,
  bindSpaceToUser,
};
