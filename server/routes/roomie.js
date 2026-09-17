const express = require('express');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

// 保留早期版本的五张表；下方用显式 ALTER 增量升级，不重建、不清空旧数据。
db.exec(`
CREATE TABLE IF NOT EXISTS roomie_roommates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS roomie_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount INTEGER DEFAULT 0,
  category TEXT DEFAULT '其他',
  payer_id INTEGER REFERENCES roomie_roommates(id) ON DELETE SET NULL,
  participants TEXT DEFAULT '[]',
  note TEXT DEFAULT '',
  spent_at TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS roomie_chores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  assignee_id INTEGER REFERENCES roomie_roommates(id) ON DELETE SET NULL,
  due_date TEXT DEFAULT '',
  done INTEGER DEFAULT 0,
  done_at TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS roomie_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity REAL DEFAULT 0,
  unit TEXT DEFAULT '个',
  low_threshold REAL DEFAULT 0,
  note TEXT DEFAULT '',
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS roomie_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  sort INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

function tableColumns(table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
}

function addColumn(table, column, definition) {
  if (tableColumns(table).has(column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`[roomie] 已迁移 ${table}.${column}`);
}

[
  ['roomie_roommates', 'moved_out_at', "TEXT DEFAULT ''"],
  ['roomie_roommates', 'updated_at', "TEXT DEFAULT ''"],
  ['roomie_roommates', 'user_id', 'INTEGER'],
  ['roomie_roommates', 'email_rule', 'INTEGER DEFAULT 0'],
  ['roomie_roommates', 'email_chore', 'INTEGER DEFAULT 0'],
  ['roomie_roommates', 'email_item', 'INTEGER DEFAULT 0'],
  ['roomie_roommates', 'email_settlement', 'INTEGER DEFAULT 0'],
  ['roomie_roommates', 'email_last_sent', "TEXT DEFAULT ''"],
  ['roomie_expenses', 'split_mode', "TEXT DEFAULT 'equal'"],
  ['roomie_expenses', 'split_config', "TEXT DEFAULT '{}'"],
  ['roomie_expenses', 'status', "TEXT DEFAULT 'unsettled'"],
  ['roomie_expenses', 'source_item_id', 'INTEGER'],
  ['roomie_expenses', 'updated_at', "TEXT DEFAULT ''"],
  ['roomie_chores', 'type', "TEXT DEFAULT '公共区域'"],
  ['roomie_chores', 'points', 'INTEGER DEFAULT 1'],
  ['roomie_chores', 'repeat_rule', "TEXT DEFAULT ''"],
  ['roomie_chores', 'assignment_mode', "TEXT DEFAULT 'manual'"],
  ['roomie_chores', 'updated_at', "TEXT DEFAULT ''"],
  // 同一批重复任务的分组标识，用于按“仅这一天 / 这一天及之后”批量修改
  ['roomie_chores', 'series_id', "TEXT DEFAULT ''"],
  ['roomie_items', 'target_quantity', 'REAL DEFAULT 0'],
  ['roomie_items', 'category', "TEXT DEFAULT '其他'"],
  ['roomie_items', 'purchase_mode', "TEXT DEFAULT 'claim'"],
  ['roomie_items', 'fixed_purchaser_id', 'INTEGER'],
  ['roomie_items', 'current_purchaser_id', 'INTEGER'],
  ['roomie_items', 'archived_at', "TEXT DEFAULT ''"],
  ['roomie_rules', 'status', "TEXT DEFAULT 'active'"],
  ['roomie_rules', 'version', 'INTEGER DEFAULT 1'],
  ['roomie_rules', 'parent_rule_id', 'INTEGER'],
  ['roomie_rules', 'proposal_type', "TEXT DEFAULT 'create'"],
  ['roomie_rules', 'proposed_by', 'INTEGER'],
  ['roomie_rules', 'voter_snapshot', "TEXT DEFAULT '[]'"],
  ['roomie_rules', 'deadline', "TEXT DEFAULT ''"],
  ['roomie_rules', 'effective_at', "TEXT DEFAULT ''"],
  ['roomie_rules', 'archived_at', "TEXT DEFAULT ''"],
  ['roomie_rules', 'metadata', "TEXT DEFAULT '{}'"],
  ['roomie_rules', 'category', "TEXT DEFAULT '其他'"],
].forEach(([table, column, definition]) => addColumn(table, column, definition));

db.exec(`
CREATE TABLE IF NOT EXISTS roomie_rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invite_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roomie_settings (
  space_id INTEGER PRIMARY KEY REFERENCES spaces(id) ON DELETE CASCADE,
  current_member_id INTEGER,
  reminder_rule INTEGER DEFAULT 1,
  reminder_chore INTEGER DEFAULT 1,
  reminder_item INTEGER DEFAULT 1,
  reminder_settlement INTEGER DEFAULT 1,
  reminder_email TEXT DEFAULT '',
  default_assignment_mode TEXT DEFAULT 'fair',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS roomie_split_schemes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mode TEXT DEFAULT 'ratio',
  members TEXT DEFAULT '[]',
  is_default INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS roomie_expense_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id INTEGER NOT NULL REFERENCES roomie_expenses(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES roomie_roommates(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL DEFAULT 0,
  UNIQUE(expense_id, member_id)
);
CREATE TABLE IF NOT EXISTS roomie_settlement_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  from_member_id INTEGER NOT NULL REFERENCES roomie_roommates(id),
  to_member_id INTEGER NOT NULL REFERENCES roomie_roommates(id),
  amount INTEGER NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending',
  paid_at TEXT DEFAULT '',
  confirmed_at TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS roomie_item_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES roomie_items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  delta REAL NOT NULL DEFAULT 0,
  actor_id INTEGER REFERENCES roomie_roommates(id) ON DELETE SET NULL,
  expense_id INTEGER REFERENCES roomie_expenses(id) ON DELETE SET NULL,
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS roomie_rule_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL REFERENCES roomie_rules(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES roomie_roommates(id) ON DELETE CASCADE,
  vote TEXT NOT NULL DEFAULT 'agree',
  comment TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(rule_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_roomie_members_space ON roomie_roommates(space_id);
CREATE INDEX IF NOT EXISTS idx_roomie_members_user ON roomie_roommates(user_id);
CREATE INDEX IF NOT EXISTS idx_roomie_expenses_space_date ON roomie_expenses(space_id, spent_at);
CREATE INDEX IF NOT EXISTS idx_roomie_shares_expense ON roomie_expense_shares(expense_id);
CREATE INDEX IF NOT EXISTS idx_roomie_shares_member ON roomie_expense_shares(member_id);
CREATE INDEX IF NOT EXISTS idx_roomie_transfers_month ON roomie_settlement_transfers(space_id, month);
CREATE INDEX IF NOT EXISTS idx_roomie_chores_space_date ON roomie_chores(space_id, due_date);
CREATE INDEX IF NOT EXISTS idx_roomie_items_space ON roomie_items(space_id);
CREATE INDEX IF NOT EXISTS idx_roomie_rules_space_status ON roomie_rules(space_id, status);
`);

// roomie_settings 可能已由旧版本创建，因此也要显式增量迁移。
addColumn('roomie_settings', 'reminder_rule', 'INTEGER DEFAULT 1');

function nowIso() {
  return new Date().toISOString();
}

function localDate(date = new Date()) {
  const p = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function currentMonth() {
  return localDate().slice(0, 7);
}

function validMonth(value, fallback = '') {
  const text = String(value || '');
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(text) ? text : fallback;
}

function validDate(value, fallback = '') {
  const text = String(value || '');
  const match = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(text);
  if (!match) return fallback;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? text
    : fallback;
}

function asId(value) {
  if (value === null || value === undefined || value === '') return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function asNonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function uniqueIds(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(asId).filter(Boolean))].sort((a, b) => a - b);
}

function member(spaceId, id, activeOnly = false) {
  if (!id) return null;
  const suffix = activeOnly ? " AND moved_out_at = ''" : '';
  return db
    .prepare(`SELECT * FROM roomie_roommates WHERE id = ? AND space_id = ?${suffix}`)
    .get(id, spaceId);
}

function activeMembers(spaceId) {
  return db
    .prepare("SELECT * FROM roomie_roommates WHERE space_id = ? AND moved_out_at = '' ORDER BY id")
    .all(spaceId);
}

function publicMember(row, currentId) {
  const self = !!currentId && row.id === currentId;
  return {
    ...row,
    status: row.moved_out_at ? 'moved_out' : 'active',
    is_active: !row.moved_out_at,
    is_self: self,
    current_member: self,
  };
}

function ensureSettings(spaceId) {
  const ts = nowIso();
  db.prepare(
    `INSERT OR IGNORE INTO roomie_settings
      (space_id, current_member_id, reminder_rule, reminder_chore, reminder_item, reminder_settlement,
       reminder_email, default_assignment_mode, created_at, updated_at)
     VALUES (?, NULL, 1, 1, 1, 1, '', 'fair', ?, ?)`
  ).run(spaceId, ts, ts);
  return db.prepare('SELECT * FROM roomie_settings WHERE space_id = ?').get(spaceId);
}

function settingsJson(spaceId, memberId) {
  const row = ensureSettings(spaceId);
  const current = member(spaceId, memberId);
  return {
    space_id: row.space_id,
    current_member_id: memberId || null,
    current_member: current ? publicMember(current, memberId) : null,
    reminders: {
      rule_pending: !!row.reminder_rule,
      chore_due: !!row.reminder_chore,
      item_low: !!row.reminder_item,
      settlement: !!row.reminder_settlement,
      email: row.reminder_email || '',
    },
    rule_reminder: !!row.reminder_rule,
    reminder_rule: !!row.reminder_rule,
    chore_reminder: !!row.reminder_chore,
    reminder_chore: !!row.reminder_chore,
    item_reminder: !!row.reminder_item,
    reminder_item: !!row.reminder_item,
    settlement_reminder: !!row.reminder_settlement,
    reminder_settlement: !!row.reminder_settlement,
    notification_email: row.reminder_email || '',
    reminder_email: row.reminder_email || '',
    default_assignment_mode: row.default_assignment_mode || 'fair',
    updated_at: row.updated_at,
  };
}

function actorFor(req, res, supplied) {
  const actor = member(req.spaceId, req.memberId, true);
  if (!actor) {
    res.status(409).json({ error: '你已不在该房间，请重新加入' });
    return null;
  }
  const requested = asId(
    supplied === undefined
      ? (req.body && (req.body.actor_id || req.body.member_id || req.body.roommate_id)) ||
          req.query.actor_id
      : supplied
  );
  if (requested && requested !== req.memberId) {
    res.status(403).json({ error: '不能以其他成员身份操作' });
    return null;
  }
  return actor;
}

function route(handler) {
  return (req, res) => {
    try {
      handler(req, res);
    } catch (error) {
      console.error('[roomie]', error);
      res.status(error.status || 500).json({
        error: error.status ? error.message : '操作失败，请稍后重试',
        ...(error.status ? {} : { detail: error.message }),
      });
    }
  };
}

// ===================== 房间 / 成员 =====================
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!db.prepare('SELECT id FROM roomie_rooms WHERE invite_code = ?').get(code)) {
      return code;
    }
  }
  throw Object.assign(new Error('生成房间编号失败，请重试'), { status: 500 });
}

function roomByUser(userId) {
  return db
    .prepare(
      `SELECT r.*, m.id AS member_id, m.name AS member_name, m.color AS member_color
       FROM roomie_roommates m
       JOIN roomie_rooms r ON r.space_id = m.space_id
       WHERE m.user_id = ? AND m.moved_out_at = ''
       LIMIT 1`
    )
    .get(userId);
}

function requireRoom(req, res, next) {
  const row = roomByUser(req.userId);
  if (!row) {
    return res.status(404).json({ error: '尚未加入房间', code: 'NO_ROOM' });
  }
  req.spaceId = row.space_id;
  req.memberId = row.member_id;
  req.roomId = row.id;
  req.room = row;
  next();
}

function roomJson(roomId) {
  const room = db.prepare('SELECT * FROM roomie_rooms WHERE id = ?').get(roomId);
  if (!room) return null;
  const members = db
    .prepare("SELECT * FROM roomie_roommates WHERE space_id = ? ORDER BY moved_out_at <> '', id")
    .all(room.space_id);
  return {
    ...room,
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      color: m.color,
      user_id: m.user_id,
      moved_out_at: m.moved_out_at,
      is_owner: m.user_id === room.owner_user_id,
      status: m.moved_out_at ? 'moved_out' : 'active',
    })),
  };
}

function softRemoveMember(spaceId, memberId) {
  const row = member(spaceId, memberId);
  if (!row || row.moved_out_at) return false;
  const movedAt = nowIso();
  db.transaction(() => {
    db.prepare('UPDATE roomie_roommates SET moved_out_at = ?, updated_at = ? WHERE id = ?')
      .run(movedAt, movedAt, row.id);

    db.prepare(
      `UPDATE roomie_items SET purchase_mode = 'claim', fixed_purchaser_id = NULL,
       current_purchaser_id = NULL, updated_at = ?
       WHERE space_id = ? AND archived_at = '' AND fixed_purchaser_id = ?`
    ).run(movedAt, spaceId, row.id);

    const pendingChores = db
      .prepare('SELECT * FROM roomie_chores WHERE space_id = ? AND assignee_id = ? AND done = 0')
      .all(spaceId, row.id);
    for (const chore of pendingChores) {
      if (chore.assignment_mode === 'fair') {
        const replacement = fairAssignee(spaceId, chore.due_date, chore.id);
        db.prepare('UPDATE roomie_chores SET assignee_id = ?, updated_at = ? WHERE id = ?')
          .run(replacement?.id || null, movedAt, chore.id);
      } else {
        db.prepare(
          "UPDATE roomie_chores SET assignment_mode = 'claim', assignee_id = NULL, updated_at = ? WHERE id = ?"
        ).run(movedAt, chore.id);
      }
    }

    const proposals = db
      .prepare("SELECT * FROM roomie_rules WHERE space_id = ? AND status = 'pending'")
      .all(spaceId);
    for (const proposal of proposals) {
      const voters = uniqueIds(parseJson(proposal.voter_snapshot || '[]', []));
      if (!voters.includes(row.id)) continue;
      const nextVoters = voters.filter((id) => id !== row.id);
      db.prepare('DELETE FROM roomie_rule_votes WHERE rule_id = ? AND member_id = ?')
        .run(proposal.id, row.id);
      if (!nextVoters.length || (proposal.deadline && proposal.deadline < localDate())) {
        db.prepare(
          "UPDATE roomie_rules SET status = 'expired', archived_at = ?, updated_at = ? WHERE id = ?"
        ).run(movedAt, movedAt, proposal.id);
        continue;
      }
      db.prepare('UPDATE roomie_rules SET voter_snapshot = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(nextVoters), movedAt, proposal.id);
      applyProposal(proposal.id);
    }
  })();
  return true;
}

function activeIdsOrError(spaceId, ids) {
  const normalized = uniqueIds(ids);
  if (!normalized.length) throw Object.assign(new Error('至少选择一位分摊成员'), { status: 400 });
  for (const id of normalized) {
    if (!member(spaceId, id, true)) {
      throw Object.assign(new Error(`分摊成员 ${id} 不存在或已搬走`), { status: 400 });
    }
  }
  return normalized;
}

function splitEqual(total, ids) {
  const sorted = [...ids].sort((a, b) => a - b);
  const base = Math.floor(total / sorted.length);
  let remainder = total - base * sorted.length;
  return sorted.map((memberId) => ({
    member_id: memberId,
    amount: base + (remainder-- > 0 ? 1 : 0),
  }));
}

function splitRatio(total, weighted) {
  const rows = weighted
    .map((row) => ({
      member_id: asId(row.member_id || row.roommate_id),
      value: Number(row.value ?? row.weight),
    }))
    .filter((row) => row.member_id && Number.isFinite(row.value) && row.value > 0)
    .sort((a, b) => a.member_id - b.member_id);
  const sum = rows.reduce((value, row) => value + row.value, 0);
  if (!rows.length || sum <= 0) {
    throw Object.assign(new Error('比例分摊需要为每位成员填写大于 0 的比例'), { status: 400 });
  }
  const calculated = rows.map((row) => {
    const exact = (total * row.value) / sum;
    return { ...row, amount: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  let remainder = total - calculated.reduce((value, row) => value + row.amount, 0);
  const order = [...calculated].sort(
    (a, b) => b.fraction - a.fraction || a.member_id - b.member_id
  );
  for (let index = 0; index < remainder; index += 1) {
    order[index % order.length].amount += 1;
  }
  return calculated
    .sort((a, b) => a.member_id - b.member_id)
    .map(({ member_id, amount }) => ({ member_id, amount }));
}

function memberValues(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object') {
    return Object.entries(input).map(([memberId, value]) => ({ member_id: Number(memberId), value }));
  }
  return [];
}

function buildExpenseSplit(spaceId, body, total) {
  const requested = String(body.split_method || body.split_mode || (body.scheme_id ? 'preset' : 'equal'));
  const config = body.split_config && typeof body.split_config === 'object' ? body.split_config : {};
  const mode = ['equal', 'ratio', 'fixed', 'preset'].includes(requested) ? requested : 'equal';
  let source = body.shares || config.shares || [];
  let ids = uniqueIds(body.participants || source.map((row) => row.member_id || row.roommate_id));
  let scheme = null;
  if (mode === 'preset') {
    const schemeId = asId(body.scheme_id || config.scheme_id);
    scheme = db
      .prepare('SELECT * FROM roomie_split_schemes WHERE id = ? AND space_id = ?')
      .get(schemeId, spaceId);
    if (!scheme) throw Object.assign(new Error('分摊方案不存在'), { status: 400 });
    source = parseJson(scheme.members, []);
    const participatingRows =
      scheme.mode === 'ratio'
        ? source.filter((row) => Number(row.value ?? row.weight) > 0)
        : source;
    ids = uniqueIds(participatingRows.map((row) => row.member_id || row.roommate_id));
  }
  if (!ids.length && mode === 'ratio') {
    ids = uniqueIds(
      memberValues(body.ratios || body.weights || config.ratios).map(
        (row) => row.member_id || row.roommate_id
      )
    );
  }
  if (!ids.length && mode === 'equal') ids = activeMembers(spaceId).map((row) => row.id);
  ids = activeIdsOrError(spaceId, ids);
  const baseMode = mode === 'preset' ? scheme.mode : mode;
  let shares;
  let storedConfig;
  if (baseMode === 'equal') {
    shares = splitEqual(total, ids);
    storedConfig = { participants: ids };
  } else if (baseMode === 'ratio') {
    const ratioInput = memberValues(body.ratios || body.weights || config.ratios);
    const ratios = ratioInput.length ? ratioInput : source;
    const byId = new Map(
      ratios.map((row) => [asId(row.member_id || row.roommate_id), Number(row.value ?? row.weight)])
    );
    const selectedRatios = ids.map((memberId) => ({
      member_id: memberId,
      value: byId.get(memberId),
    }));
    if (selectedRatios.some((row) => !Number.isFinite(row.value) || row.value <= 0)) {
      throw Object.assign(new Error('每位参与成员都需要填写大于 0 的比例'), { status: 400 });
    }
    shares = splitRatio(total, selectedRatios);
    storedConfig = { ratios: selectedRatios };
  } else if (baseMode === 'fixed') {
    const fixedInput = memberValues(body.fixed_amounts || config.fixed_amounts);
    const fixedRows = fixedInput.length ? fixedInput : source;
    const byId = new Map(
      fixedRows.map((row) => [
        asId(row.member_id || row.roommate_id),
        Math.round(Number(row.amount ?? row.share_cents ?? row.value)),
      ])
    );
    shares = ids.map((memberId) => ({ member_id: memberId, amount: byId.get(memberId) }));
    if (
      shares.some((row) => !Number.isInteger(row.amount) || row.amount < 0) ||
      shares.reduce((value, row) => value + row.amount, 0) !== total
    ) {
      throw Object.assign(new Error('固定金额分摊之和必须等于费用总额'), { status: 400 });
    }
    storedConfig = { fixed_amounts: shares };
  } else {
    throw Object.assign(new Error('不支持的分摊方式'), { status: 400 });
  }
  if (mode === 'preset') {
    storedConfig = {
      ...storedConfig,
      scheme_id: scheme.id,
      scheme_name: scheme.name,
      base_mode: scheme.mode,
    };
  }
  return { mode, shares, participants: shares.map((row) => row.member_id), config: storedConfig };
}

function expenseShares(expenseId) {
  return db
    .prepare(
      `SELECT s.member_id, s.member_id AS roommate_id, s.amount,
              s.amount AS share_cents, m.name, m.color
       FROM roomie_expense_shares s
       LEFT JOIN roomie_roommates m ON m.id = s.member_id
       WHERE s.expense_id = ? ORDER BY s.member_id`
    )
    .all(expenseId);
}

function replaceExpenseShares(expenseId, shares) {
  db.prepare('DELETE FROM roomie_expense_shares WHERE expense_id = ?').run(expenseId);
  const insert = db.prepare(
    'INSERT INTO roomie_expense_shares (expense_id, member_id, amount) VALUES (?, ?, ?)'
  );
  for (const share of shares) insert.run(expenseId, share.member_id, share.amount);
}

function publicExpense(row) {
  const splitConfig = parseJson(row.split_config || '{}', {});
  const ratios = Array.isArray(splitConfig.ratios) ? splitConfig.ratios : [];
  const weightByMember = new Map(
    ratios.map((entry) => [
      asId(entry.member_id || entry.roommate_id),
      Number(entry.value ?? entry.weight),
    ])
  );
  const shares = expenseShares(row.id).map((share) => ({
    ...share,
    ...(weightByMember.has(share.member_id)
      ? { weight: weightByMember.get(share.member_id) }
      : row.split_mode === 'equal'
        ? { weight: 1 }
        : {}),
  }));
  const payer = row.payer_id
    ? db.prepare('SELECT * FROM roomie_roommates WHERE id = ?').get(row.payer_id)
    : null;
  return {
    ...row,
    amount_cents: row.amount,
    split_method: row.split_mode,
    split_config: splitConfig,
    scheme_id: asId(splitConfig.scheme_id),
    participants: shares.length
      ? shares.map((share) => share.member_id)
      : uniqueIds(parseJson(row.participants, [])),
    shares,
    payer: payer || null,
  };
}

// 旧费用只有 participants：按成员 id 稳定分配整数分尾差并补入 shares。
const migrateLegacyShares = db.transaction(() => {
  const rows = db
    .prepare(
      `SELECT e.* FROM roomie_expenses e
       WHERE NOT EXISTS (SELECT 1 FROM roomie_expense_shares s WHERE s.expense_id = e.id)`
    )
    .all();
  const validMemberIds = new Set(
    db.prepare('SELECT id FROM roomie_roommates').all().map((row) => row.id)
  );
  for (const row of rows) {
    let ids = uniqueIds(parseJson(row.participants, []));
    if (!ids.length && row.payer_id) ids = [row.payer_id];
    ids = ids.filter((id) => validMemberIds.has(id));
    if (!ids.length) continue;
    replaceExpenseShares(row.id, splitEqual(Math.max(0, Math.round(row.amount || 0)), ids));
    db.prepare(
      `UPDATE roomie_expenses SET split_config = ?,
       updated_at = COALESCE(NULLIF(updated_at, ''), created_at) WHERE id = ?`
    ).run(JSON.stringify({ participants: ids, migrated_from: 'participants' }), row.id);
  }
});

db.transaction(() => {
  db.prepare("UPDATE roomie_roommates SET updated_at = created_at WHERE updated_at = ''").run();
  db.prepare("UPDATE roomie_expenses SET updated_at = created_at WHERE updated_at = ''").run();
  db.prepare("UPDATE roomie_chores SET updated_at = created_at WHERE updated_at = ''").run();
  db.prepare(
    `UPDATE roomie_items SET target_quantity = CASE
       WHEN target_quantity <= 0 THEN MAX(quantity, low_threshold) ELSE target_quantity END`
  ).run();
  db.prepare(
    "UPDATE roomie_rules SET effective_at = created_at WHERE status = 'active' AND effective_at = ''"
  ).run();
})();
migrateLegacyShares();

function getExpenseRow(spaceId, id) {
  return db.prepare('SELECT * FROM roomie_expenses WHERE id = ? AND space_id = ?').get(id, spaceId);
}

function progressedSettlementForMonth(spaceId, month) {
  return db
    .prepare(
      `SELECT 1 FROM roomie_settlement_transfers
       WHERE space_id = ? AND month = ? AND status IN ('paid', 'confirmed') LIMIT 1`
    )
    .get(spaceId, month);
}

function expenseFields(spaceId, body, existing = null) {
  const title = String(body.title ?? (existing && existing.title) ?? '').trim();
  const amount = Math.round(Number(body.amount_cents ?? body.amount ?? (existing && existing.amount)));
  const payerId = asId(body.payer_id ?? (existing && existing.payer_id));
  const spentAt = validDate(body.spent_at ?? (existing && existing.spent_at), localDate());
  if (!title) throw Object.assign(new Error('费用名称不能为空'), { status: 400 });
  if (!Number.isInteger(amount) || amount <= 0) {
    throw Object.assign(new Error('费用金额必须是大于 0 的整数分'), { status: 400 });
  }
  if (!member(spaceId, payerId, true)) {
    throw Object.assign(new Error('付款人不存在或已搬走'), { status: 400 });
  }
  const hasNewSplit =
    body.split_method !== undefined ||
    body.split_mode !== undefined ||
    body.shares !== undefined ||
    body.participants !== undefined ||
    body.scheme_id !== undefined;
  const splitBody =
    existing && !hasNewSplit
      ? {
          split_method: existing.split_mode,
          participants: expenseShares(existing.id).map((row) => row.member_id),
          shares: expenseShares(existing.id),
          split_config: parseJson(existing.split_config, {}),
        }
      : body;
  const split = buildExpenseSplit(spaceId, splitBody, amount);
  return {
    title,
    amount,
    category: String(body.category ?? (existing && existing.category) ?? '其他').trim() || '其他',
    payer_id: payerId,
    note: String(body.note ?? (existing && existing.note) ?? ''),
    spent_at: spentAt,
    source_item_id: asId(body.source_item_id ?? (existing && existing.source_item_id)),
    split,
  };
}

function insertExpense(spaceId, body) {
  const fields = expenseFields(spaceId, body);
  const ts = nowIso();
  const result = db.prepare(
    `INSERT INTO roomie_expenses
      (space_id, title, amount, category, payer_id, participants, note, spent_at,
       split_mode, split_config, status, source_item_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unsettled', ?, ?, ?)`
  ).run(
    spaceId,
    fields.title,
    fields.amount,
    fields.category,
    fields.payer_id,
    JSON.stringify(fields.split.participants),
    fields.note,
    fields.spent_at,
    fields.split.mode,
    JSON.stringify(fields.split.config),
    fields.source_item_id,
    ts,
    ts
  );
  replaceExpenseShares(result.lastInsertRowid, fields.split.shares);
  return getExpenseRow(spaceId, result.lastInsertRowid);
}

function calculateBalances(spaceId, month, expenseIds = null) {
  const parameters = [spaceId];
  let where = 'e.space_id = ?';
  if (month) {
    where += ' AND substr(e.spent_at, 1, 7) = ?';
    parameters.push(month);
  }
  if (expenseIds) {
    if (!expenseIds.length) return [];
    where += ` AND e.id IN (${expenseIds.map(() => '?').join(',')})`;
    parameters.push(...expenseIds);
  }
  const members = db
    .prepare('SELECT * FROM roomie_roommates WHERE space_id = ? ORDER BY id')
    .all(spaceId);
  const expenses = db.prepare(`SELECT e.* FROM roomie_expenses e WHERE ${where}`).all(...parameters);
  const map = new Map(
    members.map((row) => [
      row.id,
      { member_id: row.id, member: row, paid: 0, share: 0, net: 0 },
    ])
  );
  for (const expense of expenses) {
    if (expense.payer_id && map.has(expense.payer_id)) {
      map.get(expense.payer_id).paid += expense.amount;
    }
    for (const share of expenseShares(expense.id)) {
      if (map.has(share.member_id)) map.get(share.member_id).share += share.amount;
    }
  }
  return [...map.values()].map((row) => ({ ...row, net: row.paid - row.share }));
}

function minimalTransfers(balanceRows) {
  const creditors = balanceRows
    .filter((row) => row.net > 0)
    .map((row) => ({ id: row.member_id, amount: row.net }))
    .sort((a, b) => a.id - b.id);
  const debtors = balanceRows
    .filter((row) => row.net < 0)
    .map((row) => ({ id: row.member_id, amount: -row.net }))
    .sort((a, b) => a.id - b.id);
  const result = [];
  let creditorIndex = 0;
  let debtorIndex = 0;
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const amount = Math.min(creditors[creditorIndex].amount, debtors[debtorIndex].amount);
    if (amount > 0) {
      result.push({
        from_member_id: debtors[debtorIndex].id,
        to_member_id: creditors[creditorIndex].id,
        amount,
      });
    }
    creditors[creditorIndex].amount -= amount;
    debtors[debtorIndex].amount -= amount;
    if (!creditors[creditorIndex].amount) creditorIndex += 1;
    if (!debtors[debtorIndex].amount) debtorIndex += 1;
  }
  return result;
}

function transferJson(row) {
  const fromMember = member(row.space_id, row.from_member_id);
  const toMember = member(row.space_id, row.to_member_id);
  return {
    ...row,
    amount_cents: row.amount,
    from_member: fromMember || null,
    to_member: toMember || null,
    from: fromMember || row.from_member_id,
    to: toMember || row.to_member_id,
    is_paid: row.status === 'paid' || row.status === 'confirmed',
    is_confirmed: row.status === 'confirmed',
  };
}

function syncSettlementCore(spaceId, month) {
  const original = calculateBalances(spaceId, month);
  const residual = original.map((row) => ({ ...row }));
  const residualMap = new Map(residual.map((row) => [row.member_id, row]));
  const progressed = db
    .prepare(
      `SELECT * FROM roomie_settlement_transfers
       WHERE space_id = ? AND month = ? AND status IN ('paid', 'confirmed') ORDER BY id`
    )
    .all(spaceId, month);
  for (const transfer of progressed) {
    if (residualMap.has(transfer.from_member_id)) {
      residualMap.get(transfer.from_member_id).net += transfer.amount;
    }
    if (residualMap.has(transfer.to_member_id)) {
      residualMap.get(transfer.to_member_id).net -= transfer.amount;
    }
  }
  const wanted = minimalTransfers(residual);
  const pending = db
    .prepare(
      `SELECT * FROM roomie_settlement_transfers
       WHERE space_id = ? AND month = ? AND status = 'pending' ORDER BY id`
    )
    .all(spaceId, month);
  const pendingByPair = new Map();
  for (const row of pending) {
    const key = `${row.from_member_id}:${row.to_member_id}`;
    if (!pendingByPair.has(key)) pendingByPair.set(key, []);
    pendingByPair.get(key).push(row);
  }
  const used = new Set();
  const ts = nowIso();
  for (const transfer of wanted) {
    const key = `${transfer.from_member_id}:${transfer.to_member_id}`;
    const old = (pendingByPair.get(key) || []).shift();
    if (old) {
      used.add(old.id);
      db.prepare(
        'UPDATE roomie_settlement_transfers SET amount = ?, updated_at = ? WHERE id = ?'
      ).run(transfer.amount, ts, old.id);
    } else {
      const inserted = db.prepare(
        `INSERT INTO roomie_settlement_transfers
          (space_id, month, from_member_id, to_member_id, amount, status, paid_at,
           confirmed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', '', '', ?, ?)`
      ).run(
        spaceId,
        month,
        transfer.from_member_id,
        transfer.to_member_id,
        transfer.amount,
        ts,
        ts
      );
      used.add(Number(inserted.lastInsertRowid));
    }
  }
  for (const row of pending) {
    if (!used.has(row.id)) {
      db.prepare('DELETE FROM roomie_settlement_transfers WHERE id = ?').run(row.id);
    }
  }
  const transfers = db
    .prepare(
      'SELECT * FROM roomie_settlement_transfers WHERE space_id = ? AND month = ? ORDER BY id'
    )
    .all(spaceId, month);
  const expenseCount = db
    .prepare(
      "SELECT COUNT(*) AS count FROM roomie_expenses WHERE space_id = ? AND substr(spent_at, 1, 7) = ?"
    )
    .get(spaceId, month).count;
  let status = 'empty';
  if (expenseCount) {
    if (!transfers.length || transfers.every((row) => row.status === 'confirmed')) status = 'settled';
    else if (transfers.some((row) => row.status !== 'pending')) status = 'settling';
    else status = 'pending';
  }
  const expenseStatus =
    status === 'settled' ? 'settled' : status === 'settling' ? 'settling' : 'unsettled';
  db.prepare(
    "UPDATE roomie_expenses SET status = ? WHERE space_id = ? AND substr(spent_at, 1, 7) = ?"
  ).run(expenseStatus, spaceId, month);
  const total = transfers.reduce((sum, row) => sum + row.amount, 0);
  return {
    month,
    status,
    balances: residual
      // 已退出房间且账目已结清的成员不再展示，避免残留历史成员
      .filter((row) => !row.member.moved_out_at || row.net !== 0)
      .map((row) => ({
        ...row,
        roommate_id: row.member_id,
        paid_cents: row.paid,
        share_cents: row.share,
        net_cents: row.net,
      })),
    transfers: transfers.map(transferJson),
    remaining_count: transfers.filter((row) => row.status !== 'confirmed').length,
    total_transfer_amount: total,
    total_transfer_cents: total,
  };
}

const syncSettlementTransaction = db.transaction(syncSettlementCore);

function settlementFor(spaceId, month) {
  return syncSettlementTransaction(spaceId, month);
}

// ===================== 房间 =====================
router.get('/me', route((req, res) => {
  const room = roomByUser(req.userId);
  res.json({
    user: { id: req.user.id, username: req.user.username },
    room: room ? roomJson(room.id) : null,
  });
}));

router.post('/rooms', route((req, res) => {
  if (roomByUser(req.userId)) {
    return res.status(409).json({ error: '你已加入一个房间', code: 'HAS_ROOM' });
  }
  const name = String((req.body && req.body.name) || '').trim();
  if (!name) return res.status(400).json({ error: '房间名称不能为空' });
  const ts = nowIso();
  const output = db.transaction(() => {
    const space = db
      .prepare('INSERT INTO spaces (token, user_id, created_at) VALUES (?, ?, ?)')
      .run(crypto.randomBytes(16).toString('hex'), req.userId, ts);
    const spaceId = space.lastInsertRowid;
    const room = db
      .prepare(
        'INSERT INTO roomie_rooms (invite_code, name, space_id, owner_user_id, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(generateInviteCode(), name, spaceId, req.userId, ts);
    const created = db
      .prepare(
        `INSERT INTO roomie_roommates (space_id, user_id, name, color, created_at, updated_at, moved_out_at)
         VALUES (?, ?, ?, '', ?, ?, '')`
      )
      .run(spaceId, req.userId, req.user.username, ts, ts);
    ensureSettings(spaceId);
    return { roomId: room.lastInsertRowid };
  })();
  res.status(201).json(roomJson(output.roomId));
}));

router.post('/rooms/join', route((req, res) => {
  if (roomByUser(req.userId)) {
    return res.status(409).json({ error: '你已加入一个房间', code: 'HAS_ROOM' });
  }
  const code = String((req.body && req.body.invite_code) || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: '请输入房间编号' });
  const room = db.prepare('SELECT * FROM roomie_rooms WHERE invite_code = ?').get(code);
  if (!room) return res.status(404).json({ error: '房间编号不存在' });
  const ts = nowIso();
  db.prepare(
    `INSERT INTO roomie_roommates (space_id, user_id, name, color, created_at, updated_at, moved_out_at)
     VALUES (?, ?, ?, '', ?, ?, '')`
  ).run(room.space_id, req.userId, req.user.username, ts, ts);
  res.status(201).json(roomJson(room.id));
}));

router.use(requireRoom);

router.get('/rooms/current', route((req, res) => {
  res.json(roomJson(req.roomId));
}));

router.put('/rooms', route((req, res) => {
  if (req.room.owner_user_id !== req.userId) {
    return res.status(403).json({ error: '只有房主可以修改房间信息' });
  }
  const name = String((req.body && req.body.name) || '').trim();
  if (!name) return res.status(400).json({ error: '房间名称不能为空' });
  db.prepare('UPDATE roomie_rooms SET name = ? WHERE id = ?').run(name, req.roomId);
  res.json(roomJson(req.roomId));
}));

router.post('/rooms/leave', route((req, res) => {
  if (req.room.owner_user_id === req.userId) {
    return res.status(409).json({ error: '房主不能直接退出房间，可选择解散房间' });
  }
  softRemoveMember(req.spaceId, req.memberId);
  res.json({ ok: true });
}));

// 解散房间：房主专属，删除房间及其全部数据
router.post('/rooms/dissolve', route((req, res) => {
  if (req.room.owner_user_id !== req.userId) {
    return res.status(403).json({ error: '只有房主可以解散房间' });
  }
  const spaceId = req.spaceId;
  db.transaction(() => {
    // 先清理对成员/费用/公约存在引用的明细表，避免级联删除时的外键顺序问题
    db.prepare(
      'DELETE FROM roomie_expense_shares WHERE expense_id IN (SELECT id FROM roomie_expenses WHERE space_id = ?)'
    ).run(spaceId);
    db.prepare(
      'DELETE FROM roomie_rule_votes WHERE rule_id IN (SELECT id FROM roomie_rules WHERE space_id = ?)'
    ).run(spaceId);
    db.prepare('DELETE FROM roomie_settlement_transfers WHERE space_id = ?').run(spaceId);
    db.prepare('DELETE FROM roomie_item_transactions WHERE space_id = ?').run(spaceId);
    db.prepare('DELETE FROM roomie_rooms WHERE id = ?').run(req.roomId);
    db.prepare('DELETE FROM spaces WHERE id = ?').run(spaceId);
  })();
  res.json({ ok: true });
}));

// 转移房主：房主把房主身份交给另一位成员
router.post('/rooms/transfer', route((req, res) => {
  if (req.room.owner_user_id !== req.userId) {
    return res.status(403).json({ error: '只有房主可以转移房主' });
  }
  const target = member(req.spaceId, asId(req.body && req.body.member_id));
  if (!target || target.moved_out_at) {
    return res.status(404).json({ error: '成员不存在或已退出' });
  }
  if (target.user_id === req.userId) {
    return res.status(400).json({ error: '不能转移给自己' });
  }
  if (!target.user_id) {
    return res.status(400).json({ error: '该成员未关联账号，无法成为房主' });
  }
  db.prepare('UPDATE roomie_rooms SET owner_user_id = ? WHERE id = ?').run(
    target.user_id,
    req.roomId
  );
  res.json({ ok: true, room: roomJson(req.roomId) });
}));

router.delete('/rooms/members/:memberId', route((req, res) => {
  if (req.room.owner_user_id !== req.userId) {
    return res.status(403).json({ error: '只有房主可以移除成员' });
  }
  const target = member(req.spaceId, asId(req.params.memberId));
  if (!target) return res.status(404).json({ error: '成员不存在' });
  if (target.user_id === req.userId) {
    return res.status(409).json({ error: '不能移除自己' });
  }
  softRemoveMember(req.spaceId, target.id);
  res.json({ ok: true, room: roomJson(req.roomId) });
}));

// ===================== 邮件提醒（按成员各自设置） =====================
function emailPrefsJson(row, user) {
  return {
    email: (user && user.email) || '',
    rules: !!row.email_rule,
    chores: !!row.email_chore,
    items: !!row.email_item,
    settlement: !!row.email_settlement,
  };
}

router.get('/email-preferences', route((req, res) => {
  const row = member(req.spaceId, req.memberId);
  if (!row) return res.status(404).json({ error: '成员不存在' });
  res.json(emailPrefsJson(row, req.user));
}));

router.put('/email-preferences', route((req, res) => {
  const row = member(req.spaceId, req.memberId);
  if (!row) return res.status(404).json({ error: '成员不存在' });
  const body = req.body || {};
  const bool = (value, fallback) => (value === undefined ? fallback : value ? 1 : 0);
  db.prepare(
    `UPDATE roomie_roommates SET email_rule = ?, email_chore = ?, email_item = ?, email_settlement = ?
     WHERE id = ?`
  ).run(
    bool(body.rules, row.email_rule),
    bool(body.chores, row.email_chore),
    bool(body.items, row.email_item),
    bool(body.settlement, row.email_settlement),
    row.id
  );
  res.json(emailPrefsJson(member(req.spaceId, row.id), req.user));
}));

// ===================== 设置 / 当前身份 =====================
router.get('/settings', route((req, res) => {
  res.json(settingsJson(req.spaceId, req.memberId));
}));

router.put('/settings', route((req, res) => {
  const body = req.body || {};
  const current = ensureSettings(req.spaceId);
  const reminders = body.reminders && typeof body.reminders === 'object' ? body.reminders : {};
  const assignmentMode = String(
    body.default_assignment_mode ?? current.default_assignment_mode ?? 'fair'
  );
  if (!['fair', 'rotation', 'fixed', 'manual', 'claim'].includes(assignmentMode)) {
    return res.status(400).json({ error: '默认排班方式无效' });
  }
  const bool = (value, fallback) => (value === undefined ? fallback : value ? 1 : 0);
  db.prepare(
    `UPDATE roomie_settings SET reminder_rule = ?, reminder_chore = ?,
       reminder_item = ?, reminder_settlement = ?, reminder_email = ?,
       default_assignment_mode = ?, updated_at = ? WHERE space_id = ?`
  ).run(
    bool(body.rule_reminder ?? body.reminder_rule ?? reminders.rule_pending, current.reminder_rule),
    bool(body.chore_reminder ?? body.reminder_chore ?? reminders.chore_due, current.reminder_chore),
    bool(body.item_reminder ?? body.reminder_item ?? reminders.item_low, current.reminder_item),
    bool(
      body.settlement_reminder ?? body.reminder_settlement ?? reminders.settlement,
      current.reminder_settlement
    ),
    String(
      body.notification_email ?? body.reminder_email ?? reminders.email ?? current.reminder_email ?? ''
    ).trim(),
    assignmentMode,
    nowIso(),
    req.spaceId
  );
  res.json(settingsJson(req.spaceId, req.memberId));
}));

// ===================== 室友 =====================
router.get('/roommates', route((req, res) => {
  const currentId = req.memberId;
  const includeMovedOut = String(req.query.include_moved_out || '1') !== '0';
  const rows = db
    .prepare(
      `SELECT * FROM roomie_roommates WHERE space_id = ?
       ${includeMovedOut ? '' : "AND moved_out_at = ''"} ORDER BY moved_out_at <> '', id`
    )
    .all(req.spaceId)
    .map((row) => publicMember(row, currentId));
  res.json(rows);
}));

router.post('/roommates', route((req, res) => {
  return res.status(403).json({ error: '成员通过房间编号加入，不能手动添加' });
}));

router.put('/roommates/:id', route((req, res) => {
  const old = member(req.spaceId, asId(req.params.id));
  if (!old) return res.status(404).json({ error: '室友不存在' });
  if (old.user_id !== req.userId) {
    return res.status(403).json({ error: '只能修改自己的昵称' });
  }
  const name = String(req.body.name ?? old.name).trim();
  if (!name) return res.status(400).json({ error: '室友昵称不能为空' });
  db.prepare('UPDATE roomie_roommates SET name = ?, color = ?, updated_at = ? WHERE id = ?')
    .run(name, String(req.body.color ?? old.color ?? ''), nowIso(), old.id);
  res.json(publicMember(member(req.spaceId, old.id), req.memberId));
}));

// 旧 DELETE URL 保留，但升级为软搬走。
router.delete('/roommates/:id', route((req, res) => {
  if (req.room.owner_user_id !== req.userId) {
    return res.status(403).json({ error: '只有房主可以移除成员' });
  }
  const row = member(req.spaceId, asId(req.params.id));
  if (!row) return res.status(404).json({ error: '室友不存在' });
  if (row.user_id === req.userId) {
    return res.status(409).json({ error: '不能移除自己' });
  }
  softRemoveMember(req.spaceId, row.id);
  res.json({ ok: true, roommate: publicMember(member(req.spaceId, row.id), req.memberId) });
}));

router.post('/roommates/:id/restore', route((req, res) => {
  const row = member(req.spaceId, asId(req.params.id));
  if (!row) return res.status(404).json({ error: '室友不存在' });
  if (req.room.owner_user_id !== req.userId) {
    return res.status(403).json({ error: '只有房主可以恢复成员' });
  }
  db.prepare("UPDATE roomie_roommates SET moved_out_at = '', updated_at = ? WHERE id = ?")
    .run(nowIso(), row.id);
  res.json(publicMember(member(req.spaceId, row.id), req.memberId));
}));

// ===================== 默认分摊方案 =====================
function schemeJson(row) {
  const members = parseJson(row.members || '[]', []).map((entry) => ({
    ...entry,
    member_id: asId(entry.member_id || entry.roommate_id),
    roommate_id: asId(entry.member_id || entry.roommate_id),
  }));
  const weights = Object.fromEntries(
    members.map((entry) => [entry.member_id, Number(entry.value ?? entry.weight ?? 0)])
  );
  return {
    ...row,
    split_method: row.mode,
    members,
    shares: members,
    weights,
    is_default: !!row.is_default,
  };
}

function schemeFields(spaceId, body, existing = null) {
  const name = String(body.name ?? (existing && existing.name) ?? '').trim();
  const mode = String(body.mode ?? body.split_method ?? (existing && existing.mode) ?? 'ratio');
  const weightEntries =
    body.weights && typeof body.weights === 'object' && !Array.isArray(body.weights)
      ? Object.entries(body.weights).map(([memberId, value]) => ({ member_id: memberId, value }))
      : null;
  const entries =
    body.members ?? body.shares ?? weightEntries ?? (existing ? parseJson(existing.members, []) : []);
  if (!name) throw Object.assign(new Error('方案名称不能为空'), { status: 400 });
  if (!['equal', 'ratio', 'fixed'].includes(mode)) {
    throw Object.assign(new Error('方案分摊方式无效'), { status: 400 });
  }
  const normalized = entries.map((entry) => ({
    member_id: asId(entry.member_id || entry.roommate_id),
    value: Number(entry.value ?? entry.weight ?? entry.share_cents ?? entry.amount ?? 1),
  }));
  activeIdsOrError(spaceId, normalized.map((entry) => entry.member_id));
  if (normalized.some((entry) => !Number.isFinite(entry.value) || entry.value < 0)) {
    throw Object.assign(new Error('方案分摊值无效'), { status: 400 });
  }
  if (mode === 'ratio' && !normalized.some((entry) => entry.value > 0)) {
    throw Object.assign(new Error('至少一位成员的比例必须大于 0'), { status: 400 });
  }
  return {
    name,
    mode,
    members: normalized,
    is_default:
      body.is_default === undefined ? !!(existing && existing.is_default) : !!body.is_default,
  };
}

router.get('/split-schemes', route((req, res) => {
  const schemes = db
    .prepare('SELECT * FROM roomie_split_schemes WHERE space_id = ? ORDER BY is_default DESC, id')
    .all(req.spaceId)
    .map(schemeJson);
  res.json({ schemes });
}));

router.post('/split-schemes', route((req, res) => {
  const fields = schemeFields(req.spaceId, req.body || {});
  const ts = nowIso();
  const inserted = db.transaction(() => {
    if (fields.is_default) {
      db.prepare('UPDATE roomie_split_schemes SET is_default = 0 WHERE space_id = ?').run(req.spaceId);
    }
    return db.prepare(
      `INSERT INTO roomie_split_schemes
       (space_id, name, mode, members, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      req.spaceId,
      fields.name,
      fields.mode,
      JSON.stringify(fields.members),
      fields.is_default ? 1 : 0,
      ts,
      ts
    );
  })();
  res.status(201).json(
    schemeJson(db.prepare('SELECT * FROM roomie_split_schemes WHERE id = ?').get(inserted.lastInsertRowid))
  );
}));

router.put('/split-schemes/:id', route((req, res) => {
  const old = db
    .prepare('SELECT * FROM roomie_split_schemes WHERE id = ? AND space_id = ?')
    .get(asId(req.params.id), req.spaceId);
  if (!old) return res.status(404).json({ error: '分摊方案不存在' });
  const fields = schemeFields(req.spaceId, req.body || {}, old);
  db.transaction(() => {
    if (fields.is_default) {
      db.prepare('UPDATE roomie_split_schemes SET is_default = 0 WHERE space_id = ?').run(req.spaceId);
    }
    db.prepare(
      `UPDATE roomie_split_schemes SET name = ?, mode = ?, members = ?,
       is_default = ?, updated_at = ? WHERE id = ?`
    ).run(
      fields.name,
      fields.mode,
      JSON.stringify(fields.members),
      fields.is_default ? 1 : 0,
      nowIso(),
      old.id
    );
  })();
  res.json(schemeJson(db.prepare('SELECT * FROM roomie_split_schemes WHERE id = ?').get(old.id)));
}));

router.delete('/split-schemes/:id', route((req, res) => {
  const result = db
    .prepare('DELETE FROM roomie_split_schemes WHERE id = ? AND space_id = ?')
    .run(asId(req.params.id), req.spaceId);
  if (!result.changes) return res.status(404).json({ error: '分摊方案不存在' });
  res.json({ ok: true });
}));

// ===================== 费用与结算 =====================
router.get('/expenses', route((req, res) => {
  const month = validMonth(req.query.month, '');
  if (month) settlementFor(req.spaceId, month);
  const conditions = ['e.space_id = ?'];
  const parameters = [req.spaceId];
  if (month) {
    conditions.push('substr(e.spent_at, 1, 7) = ?');
    parameters.push(month);
  }
  const query = String(req.query.q || '').trim();
  if (query) {
    conditions.push('(e.title LIKE ? OR e.note LIKE ?)');
    parameters.push(`%${query}%`, `%${query}%`);
  }
  if (req.query.category) {
    conditions.push('e.category = ?');
    parameters.push(String(req.query.category));
  }
  const memberId = asId(req.query.member_id || req.query.roommate_id);
  if (memberId) {
    conditions.push(
      '(e.payer_id = ? OR EXISTS (SELECT 1 FROM roomie_expense_shares s WHERE s.expense_id = e.id AND s.member_id = ?))'
    );
    parameters.push(memberId, memberId);
  }
  if (['unsettled', 'settling', 'settled'].includes(String(req.query.status))) {
    conditions.push('e.status = ?');
    parameters.push(String(req.query.status));
  }
  const rows = db
    .prepare(
      `SELECT e.* FROM roomie_expenses e WHERE ${conditions.join(' AND ')}
       ORDER BY e.spent_at DESC, e.id DESC`
    )
    .all(...parameters);
  const currentId = req.memberId;
  const expenses = rows.map(publicExpense);
  const myPaid = rows.reduce(
    (sum, row) => sum + (row.payer_id === currentId ? row.amount : 0),
    0
  );
  const myShare = rows.reduce(
    (sum, row) =>
      sum + (expenseShares(row.id).find((share) => share.member_id === currentId)?.amount || 0),
    0
  );
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const categories = db
    .prepare("SELECT DISTINCT category FROM roomie_expenses WHERE space_id = ? AND category <> '' ORDER BY category")
    .all(req.spaceId)
    .map((row) => row.category);
  const previewBalances = calculateBalances(req.spaceId, null, rows.map((row) => row.id));
  res.json({
    expenses,
    summary: {
      count: rows.length,
      total_amount: total,
      total_cents: total,
      my_paid: myPaid,
      my_paid_cents: myPaid,
      my_share: myShare,
      my_share_cents: myShare,
      my_net: myPaid - myShare,
      my_net_cents: myPaid - myShare,
      current_member_id: currentId,
    },
    categories,
    settlement: {
      balances: previewBalances.map((row) => ({
        roommate: row.member,
        member_id: row.member_id,
        net_cents: row.net,
        paid_cents: row.paid,
        share_cents: row.share,
      })),
      transfers: minimalTransfers(previewBalances).map((row) => ({
        from: row.from_member_id,
        to: row.to_member_id,
        cents: row.amount,
      })),
    },
  });
}));

router.get('/expenses/:id', route((req, res) => {
  const row = getExpenseRow(req.spaceId, asId(req.params.id));
  if (!row) return res.status(404).json({ error: '费用记录不存在' });
  res.json(publicExpense(row));
}));

router.post('/expenses', route((req, res) => {
  const row = db.transaction(insertExpense)(req.spaceId, req.body || {});
  settlementFor(req.spaceId, row.spent_at.slice(0, 7));
  res.status(201).json(publicExpense(row));
}));

router.put('/expenses/:id', route((req, res) => {
  const old = getExpenseRow(req.spaceId, asId(req.params.id));
  if (!old) return res.status(404).json({ error: '费用记录不存在' });
  const oldMonth = old.spent_at.slice(0, 7);
  if (progressedSettlementForMonth(req.spaceId, oldMonth)) {
    return res.status(409).json({ error: '本月已有转账登记，确认结算后不能修改费用' });
  }
  const row = db.transaction(() => {
    const fields = expenseFields(req.spaceId, req.body || {}, old);
    db.prepare(
      `UPDATE roomie_expenses SET title = ?, amount = ?, category = ?, payer_id = ?,
       participants = ?, note = ?, spent_at = ?, split_mode = ?, split_config = ?,
       source_item_id = ?, status = 'unsettled', updated_at = ? WHERE id = ?`
    ).run(
      fields.title,
      fields.amount,
      fields.category,
      fields.payer_id,
      JSON.stringify(fields.split.participants),
      fields.note,
      fields.spent_at,
      fields.split.mode,
      JSON.stringify(fields.split.config),
      fields.source_item_id,
      nowIso(),
      old.id
    );
    replaceExpenseShares(old.id, fields.split.shares);
    return getExpenseRow(req.spaceId, old.id);
  })();
  settlementFor(req.spaceId, oldMonth);
  if (row.spent_at.slice(0, 7) !== oldMonth) {
    settlementFor(req.spaceId, row.spent_at.slice(0, 7));
  }
  res.json(publicExpense(row));
}));

router.delete('/expenses/:id', route((req, res) => {
  const row = getExpenseRow(req.spaceId, asId(req.params.id));
  if (!row) return res.status(404).json({ error: '费用记录不存在' });
  const month = row.spent_at.slice(0, 7);
  if (progressedSettlementForMonth(req.spaceId, month)) {
    return res.status(409).json({ error: '本月已有转账登记，不能删除费用' });
  }
  db.prepare('DELETE FROM roomie_expenses WHERE id = ?').run(row.id);
  settlementFor(req.spaceId, month);
  res.json({ ok: true });
}));

router.get('/settlements/:month', route((req, res) => {
  const month = validMonth(req.params.month);
  if (!month) return res.status(400).json({ error: '月份格式应为 YYYY-MM' });
  if (req.query.actor_id && !actorFor(req, res, req.query.actor_id)) return;
  res.json(settlementFor(req.spaceId, month));
}));

function transferAction(req, res, action) {
  const transfer = db
    .prepare('SELECT * FROM roomie_settlement_transfers WHERE id = ? AND space_id = ?')
    .get(asId(req.params.id), req.spaceId);
  if (!transfer) return res.status(404).json({ error: '结算转账不存在' });
  const actor = actorFor(req, res);
  if (!actor) return;
  if (action === 'pay') {
    if (actor.id !== transfer.from_member_id) {
      return res.status(403).json({ error: '只有付款人可以登记已转账' });
    }
    if (transfer.status === 'confirmed') {
      return res.status(409).json({ error: '这笔转账已由收款人确认' });
    }
    if (transfer.status === 'pending') {
      db.prepare(
        "UPDATE roomie_settlement_transfers SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?"
      ).run(nowIso(), nowIso(), transfer.id);
    }
  } else {
    if (actor.id !== transfer.to_member_id) {
      return res.status(403).json({ error: '只有收款人可以确认到账' });
    }
    if (transfer.status === 'pending') {
      return res.status(409).json({ error: '付款人尚未登记转账' });
    }
    if (transfer.status === 'paid') {
      db.prepare(
        "UPDATE roomie_settlement_transfers SET status = 'confirmed', confirmed_at = ?, updated_at = ? WHERE id = ?"
      ).run(nowIso(), nowIso(), transfer.id);
    }
  }
  const settlement = settlementFor(req.spaceId, transfer.month);
  const updated = settlement.transfers.find((row) => row.id === transfer.id);
  res.json({ transfer: updated || transferJson(transfer), settlement });
}

const payHandler = route((req, res) => transferAction(req, res, 'pay'));
const confirmHandler = route((req, res) => transferAction(req, res, 'confirm'));
router.post('/settlements/transfer/:id/mark-paid', payHandler);
router.post('/settlements/transfer/:id/confirm', confirmHandler);
router.post('/settlement-transfers/:id/mark-paid', payHandler);
router.post('/settlement-transfers/:id/confirm', confirmHandler);

// ===================== 值日排班 =====================
function parseRepeatRule(value) {
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value || '');
}

function repeatedChoreDates(startValue, repeatRule) {
  const start = validDate(startValue, localDate());
  const rule = String(repeatRule || 'none');
  if (!['daily', 'weekdays', 'weekly', 'biweekly', 'monthly'].includes(rule)) return [start];
  const [year, month, day] = start.split('-').map(Number);
  const cursor = new Date(year, month - 1, day, 12);
  const cutoff = new Date(cursor);
  cutoff.setDate(cutoff.getDate() + 93);
  // 每天/工作日重复的密度高得多，生成条数单独收敛，避免一次写入过多记录
  const maxCount = rule === 'daily' ? 31 : rule === 'weekdays' ? 23 : 16;
  const dates = [start];
  while (dates.length < maxCount) {
    if (rule === 'daily') {
      cursor.setDate(cursor.getDate() + 1);
    } else if (rule === 'weekdays') {
      do {
        cursor.setDate(cursor.getDate() + 1);
      } while (cursor.getDay() === 0 || cursor.getDay() === 6);
    } else if (rule === 'weekly' || rule === 'biweekly') {
      cursor.setDate(cursor.getDate() + (rule === 'weekly' ? 7 : 14));
    } else {
      const targetYear = cursor.getMonth() === 11 ? cursor.getFullYear() + 1 : cursor.getFullYear();
      const targetMonth = (cursor.getMonth() + 1) % 12;
      const lastDay = new Date(targetYear, targetMonth + 1, 0, 12).getDate();
      cursor.setFullYear(targetYear, targetMonth, Math.min(day, lastDay));
    }
    if (cursor > cutoff) break;
    dates.push(localDate(cursor));
  }
  return dates;
}

/**
 * 早期版本的重复任务没有分组标识，这里按“房间 + 标题 + 重复规则 + 分数 + 分配方式 + 负责人”
 * 分组，再要求日期严格符合规则的递进关系，尽量把同一批次生成的记录还原成一个系列。
 * 只会处理 series_id 为空的记录，新数据不受影响。
 */
function backfillChoreSeries() {
  const rows = db
    .prepare(
      `SELECT id, space_id, title, repeat_rule, points, assignment_mode, IFNULL(assignee_id, 0) AS assignee, due_date
         FROM roomie_chores
        WHERE series_id = '' AND repeat_rule NOT IN ('', 'none')
        ORDER BY space_id, title, repeat_rule, points, assignment_mode, due_date, assignee, id`
    )
    .all();
  if (!rows.length) return;
  const update = db.prepare('UPDATE roomie_chores SET series_id = ? WHERE id = ?');
  let count = 0;
  db.transaction(() => {
    let key = '';
    let seriesId = '';
    let expected = [];
    for (const row of rows) {
      // 固定/手动分配时负责人固定，可参与分组；公平轮换的负责人每天不同，不能作为分组依据
      const stableAssignee = ['fixed', 'manual'].includes(row.assignment_mode) ? row.assignee : 0;
      const rowKey = [row.space_id, row.title, row.repeat_rule, row.points, row.assignment_mode, stableAssignee].join('|');
      if (rowKey !== key || !expected.includes(row.due_date)) {
        key = rowKey;
        seriesId = crypto.randomBytes(8).toString('hex');
        expected = repeatedChoreDates(row.due_date, row.repeat_rule);
      }
      update.run(seriesId, row.id);
      count += 1;
    }
  })();
  console.log(`[roomie] 已为 ${count} 条历史重复值日任务补充分组`);
}

backfillChoreSeries();

function choreJson(row) {
  const assignee = row.assignee_id
    ? db.prepare('SELECT * FROM roomie_roommates WHERE id = ?').get(row.assignee_id)
    : null;
  const parsedRepeat = parseJson(row.repeat_rule || '', null);
  return {
    ...row,
    done: !!row.done,
    status: row.done
      ? 'done'
      : !row.assignee_id
        ? 'unclaimed'
        : row.due_date < localDate()
          ? 'overdue'
          : 'pending',
    repeat_rule: parsedRepeat === null ? row.repeat_rule : parsedRepeat,
    assignee: assignee || null,
  };
}

function fairAssignee(spaceId, dueDate, excludeChoreId = 0) {
  const month = String(dueDate || '').slice(0, 7);
  return db.prepare(
    `SELECT m.id, COALESCE(SUM(c.points), 0) AS workload, MAX(c.created_at) AS last_assigned
     FROM roomie_roommates m
     LEFT JOIN roomie_chores c ON c.assignee_id = m.id AND c.space_id = m.space_id
       AND substr(c.due_date, 1, 7) = ? AND c.id <> ?
     WHERE m.space_id = ? AND m.moved_out_at = ''
     GROUP BY m.id
     ORDER BY workload ASC, COALESCE(last_assigned, '') ASC, m.id ASC LIMIT 1`
  ).get(month, excludeChoreId, spaceId);
}

function choreFields(spaceId, body, old = null) {
  const title = String(body.title ?? (old && old.title) ?? '').trim();
  if (!title) throw Object.assign(new Error('值日事项不能为空'), { status: 400 });
  const dueDate = validDate(body.due_date ?? (old && old.due_date), localDate());
  // 工作量采用 5 分制
  const points = Math.min(5, Math.max(1, Math.round(Number(body.points ?? (old && old.points) ?? 1))));
  let mode = String(
    body.assignment_mode ??
      (old && old.assignment_mode) ??
      ensureSettings(spaceId).default_assignment_mode ??
      'fair'
  );
  if (mode === 'rotation') mode = 'fair';
  if (mode === 'free') mode = 'claim';
  // “手动指定”已与“固定负责人”合并，历史数据继续兼容
  if (mode === 'manual') mode = 'fixed';
  if (!['fair', 'fixed', 'manual', 'claim'].includes(mode)) {
    throw Object.assign(new Error('任务分配方式无效'), { status: 400 });
  }
  let assigneeId = asId(body.assignee_id ?? (old && old.assignee_id));
  if (mode === 'fair') {
    const canKeepCurrent =
      old && old.assignment_mode === 'fair' && member(spaceId, assigneeId, true);
    if (!canKeepCurrent || body.reassign === true) {
      assigneeId = (fairAssignee(spaceId, dueDate, old ? old.id : 0) || {}).id || null;
    }
  }
  if (mode === 'claim') assigneeId = null;
  if (['fixed', 'manual'].includes(mode) && !member(spaceId, assigneeId, true)) {
    throw Object.assign(new Error('固定或手动分配需要选择一位在住成员'), { status: 400 });
  }
  return {
    title,
    type: String(body.type ?? (old && old.type) ?? '公共区域').trim() || '公共区域',
    due_date: dueDate,
    points,
    repeat_rule: parseRepeatRule(body.repeat_rule ?? (old && old.repeat_rule) ?? ''),
    assignment_mode: mode,
    assignee_id: assigneeId,
  };
}

router.get('/chores', route((req, res) => {
  const conditions = ['c.space_id = ?'];
  const parameters = [req.spaceId];
  const month = validMonth(req.query.month, '');
  if (month) {
    conditions.push('substr(c.due_date, 1, 7) = ?');
    parameters.push(month);
  }
  const assigneeId = asId(req.query.member_id || req.query.assignee_id);
  if (assigneeId) {
    conditions.push('c.assignee_id = ?');
    parameters.push(assigneeId);
  }
  if (req.query.type) {
    conditions.push('c.type = ?');
    parameters.push(String(req.query.type));
  }
  const rows = db
    .prepare(
      `SELECT c.* FROM roomie_chores c WHERE ${conditions.join(' AND ')}
       ORDER BY c.done ASC, c.due_date ASC, c.id DESC`
    )
    .all(...parameters)
    .map(choreJson);
  const status = String(req.query.status || '');
  const chores = status ? rows.filter((row) => row.status === status) : rows;
  const summary = {
    count: chores.length,
    pending: chores.filter((row) => row.status === 'pending').length,
    overdue: chores.filter((row) => row.status === 'overdue').length,
    unclaimed: chores.filter((row) => row.status === 'unclaimed').length,
    done: chores.filter((row) => row.status === 'done').length,
    points: chores.reduce((sum, row) => sum + row.points, 0),
  };
  res.json({ chores, summary, types: [...new Set(rows.map((row) => row.type))] });
}));

// 批量操作范围：single=仅这一天，future=这一天及之后，all=整批
function resolveChoreScope(row, value) {
  const scope = String(value || 'single');
  if (!['single', 'future', 'all'].includes(scope)) return 'single';
  // 没有分组信息（非重复任务或历史数据）时只能单条处理
  return row.series_id ? scope : 'single';
}

function choreScopeRows(spaceId, row, scope) {
  if (scope === 'future') {
    return db
      .prepare(
        'SELECT * FROM roomie_chores WHERE space_id = ? AND series_id = ? AND due_date >= ? ORDER BY due_date, id'
      )
      .all(spaceId, row.series_id, row.due_date);
  }
  if (scope === 'all') {
    return db
      .prepare('SELECT * FROM roomie_chores WHERE space_id = ? AND series_id = ? ORDER BY due_date, id')
      .all(spaceId, row.series_id);
  }
  return [row];
}

router.post('/chores', route((req, res) => {
  const body = req.body || {};
  const firstFields = choreFields(req.spaceId, body);
  const dates = repeatedChoreDates(firstFields.due_date, firstFields.repeat_rule);
  // 一批重复任务共用同一个 series_id，用于后续按“仅这一天 / 这一天及之后”批量修改
  const seriesId = dates.length > 1 ? crypto.randomBytes(8).toString('hex') : '';
  const insert = db.prepare(
    `INSERT INTO roomie_chores
      (space_id, title, assignee_id, due_date, done, done_at, created_at, type,
       points, repeat_rule, assignment_mode, series_id, updated_at)
     VALUES (?, ?, ?, ?, 0, '', ?, ?, ?, ?, ?, ?, ?)`
  );
  const ids = db.transaction(() => dates.map((dueDate) => {
    const fields = choreFields(req.spaceId, { ...body, due_date: dueDate });
    const ts = nowIso();
    return Number(insert.run(
      req.spaceId,
      fields.title,
      fields.assignee_id,
      fields.due_date,
      ts,
      fields.type,
      fields.points,
      fields.repeat_rule,
      fields.assignment_mode,
      seriesId,
      ts
    ).lastInsertRowid);
  }))();
  const first = choreJson(db.prepare('SELECT * FROM roomie_chores WHERE id = ?').get(ids[0]));
  res.status(201).json({ ...first, created_count: ids.length });
}));

router.put('/chores/:id', route((req, res) => {
  const old = db
    .prepare('SELECT * FROM roomie_chores WHERE id = ? AND space_id = ?')
    .get(asId(req.params.id), req.spaceId);
  if (!old) return res.status(404).json({ error: '值日事项不存在' });
  const body = req.body || {};
  const scope = resolveChoreScope(old, body.scope);
  const targets = choreScopeRows(req.spaceId, old, scope);
  const update = db.prepare(
    `UPDATE roomie_chores SET title = ?, assignee_id = ?, due_date = ?, done = ?,
     done_at = ?, type = ?, points = ?, repeat_rule = ?, assignment_mode = ?, updated_at = ?
     WHERE id = ?`
  );
  const ts = nowIso();
  db.transaction(() => {
    for (const row of targets) {
      // 只允许当前这条改日期，同系列的其它天保留各自日期
      const payload = row.id === old.id ? body : { ...body, due_date: row.due_date };
      const fields = choreFields(req.spaceId, payload, row);
      const done = row.id === old.id && body.done !== undefined ? (body.done ? 1 : 0) : row.done;
      const doneAt = done ? row.done_at || ts : '';
      update.run(
        fields.title,
        fields.assignee_id,
        fields.due_date,
        done,
        doneAt,
        fields.type,
        fields.points,
        fields.repeat_rule,
        fields.assignment_mode,
        ts,
        row.id
      );
    }
  })();
  const first = choreJson(db.prepare('SELECT * FROM roomie_chores WHERE id = ?').get(old.id));
  res.json({ ...first, updated_count: targets.length });
}));

router.delete('/chores/:id', route((req, res) => {
  const old = db
    .prepare('SELECT * FROM roomie_chores WHERE id = ? AND space_id = ?')
    .get(asId(req.params.id), req.spaceId);
  if (!old) return res.status(404).json({ error: '值日事项不存在' });
  const scope = resolveChoreScope(old, (req.query && req.query.scope) || (req.body && req.body.scope));
  const result =
    scope === 'future'
      ? db
          .prepare('DELETE FROM roomie_chores WHERE space_id = ? AND series_id = ? AND due_date >= ?')
          .run(req.spaceId, old.series_id, old.due_date)
      : scope === 'all'
        ? db
            .prepare('DELETE FROM roomie_chores WHERE space_id = ? AND series_id = ?')
            .run(req.spaceId, old.series_id)
        : db.prepare('DELETE FROM roomie_chores WHERE id = ?').run(old.id);
  res.json({ ok: true, deleted_count: result.changes });
}));

router.post('/chores/:id/claim', route((req, res) => {
  const row = db
    .prepare('SELECT * FROM roomie_chores WHERE id = ? AND space_id = ?')
    .get(asId(req.params.id), req.spaceId);
  if (!row) return res.status(404).json({ error: '值日事项不存在' });
  if (row.done) return res.status(409).json({ error: '任务已完成' });
  const actor = actorFor(req, res);
  if (!actor) return;
  if (row.assignee_id && row.assignee_id !== actor.id) {
    return res.status(409).json({ error: '任务已被其他室友领取' });
  }
  db.prepare('UPDATE roomie_chores SET assignee_id = ?, updated_at = ? WHERE id = ?')
    .run(actor.id, nowIso(), row.id);
  res.json(choreJson(db.prepare('SELECT * FROM roomie_chores WHERE id = ?').get(row.id)));
}));

router.post('/chores/:id/complete', route((req, res) => {
  const row = db
    .prepare('SELECT * FROM roomie_chores WHERE id = ? AND space_id = ?')
    .get(asId(req.params.id), req.spaceId);
  if (!row) return res.status(404).json({ error: '值日事项不存在' });
  const actor = actorFor(req, res);
  if (!actor) return;
  if (row.assignee_id && row.assignee_id !== actor.id) {
    return res.status(403).json({ error: '只有任务负责人可以完成任务' });
  }
  if (row.done) return res.json(choreJson(row));
  db.prepare(
    'UPDATE roomie_chores SET assignee_id = ?, done = 1, done_at = ?, updated_at = ? WHERE id = ?'
  ).run(row.assignee_id || actor.id, nowIso(), nowIso(), row.id);
  res.json(choreJson(db.prepare('SELECT * FROM roomie_chores WHERE id = ?').get(row.id)));
}));

// ===================== 公共物品 =====================
function itemIsLow(row) {
  return Number(row.quantity) <= Number(row.low_threshold);
}

function nextPurchaser(spaceId) {
  return db.prepare(
    `SELECT m.id, COUNT(t.id) AS purchases, MAX(t.created_at) AS last_purchase
     FROM roomie_roommates m
     LEFT JOIN roomie_item_transactions t ON t.actor_id = m.id AND t.space_id = m.space_id
       AND t.kind = 'restock'
     WHERE m.space_id = ? AND m.moved_out_at = ''
     GROUP BY m.id
     ORDER BY purchases ASC, COALESCE(last_purchase, '') ASC, m.id ASC LIMIT 1`
  ).get(spaceId);
}

function normalizePurchaseMode(value) {
  const mode = String(value || 'claim');
  if (mode === 'free') return 'claim';
  return ['claim', 'fixed', 'rotation'].includes(mode) ? mode : 'claim';
}

function assignItemPurchaser(row) {
  let purchaserId = asId(row.current_purchaser_id);
  let purchaseMode = row.purchase_mode;
  let fixedPurchaserId = asId(row.fixed_purchaser_id);
  if (purchaseMode === 'fixed' && !member(row.space_id, fixedPurchaserId, true)) {
    purchaseMode = 'claim';
    fixedPurchaserId = null;
    purchaserId = null;
    db.prepare(
      "UPDATE roomie_items SET purchase_mode = 'claim', fixed_purchaser_id = NULL, current_purchaser_id = NULL, updated_at = ? WHERE id = ?"
    ).run(nowIso(), row.id);
  }
  if (!itemIsLow(row)) purchaserId = null;
  else if (purchaseMode === 'fixed') purchaserId = fixedPurchaserId;
  else if (purchaseMode === 'rotation' && !member(row.space_id, purchaserId, true)) {
    purchaserId = (nextPurchaser(row.space_id) || {}).id || null;
  } else if (purchaseMode === 'claim' && !member(row.space_id, purchaserId, true)) {
    purchaserId = null;
  }
  if (purchaserId !== row.current_purchaser_id) {
    db.prepare('UPDATE roomie_items SET current_purchaser_id = ?, updated_at = ? WHERE id = ?')
      .run(purchaserId, nowIso(), row.id);
  }
  return db.prepare('SELECT * FROM roomie_items WHERE id = ?').get(row.id);
}

function itemJson(row) {
  const normalized = assignItemPurchaser(row);
  const currentPurchaser = normalized.current_purchaser_id
    ? db.prepare('SELECT * FROM roomie_roommates WHERE id = ?').get(normalized.current_purchaser_id)
    : null;
  const fixedPurchaser = normalized.fixed_purchaser_id
    ? db.prepare('SELECT * FROM roomie_roommates WHERE id = ?').get(normalized.fixed_purchaser_id)
    : null;
  return {
    ...normalized,
    current_quantity: normalized.quantity,
    threshold: normalized.low_threshold,
    target: normalized.target_quantity,
    status: itemIsLow(normalized) ? 'low' : 'normal',
    current_purchaser: currentPurchaser || null,
    fixed_purchaser: fixedPurchaser || null,
  };
}

function itemFields(spaceId, body, old = null) {
  const name = String(body.name ?? (old && old.name) ?? '').trim();
  if (!name) throw Object.assign(new Error('物品名称不能为空'), { status: 400 });
  const quantity = asNonNegative(
    body.current_quantity ?? body.quantity,
    old ? old.quantity : 0
  );
  const target = asNonNegative(
    body.target_quantity ?? body.target,
    old ? old.target_quantity : quantity
  );
  const threshold = asNonNegative(
    body.threshold ?? body.low_threshold,
    old ? old.low_threshold : 0
  );
  const mode = normalizePurchaseMode(body.purchase_mode ?? (old && old.purchase_mode));
  const fixedId = asId(body.fixed_purchaser_id ?? (old && old.fixed_purchaser_id));
  if (target <= 0) {
    throw Object.assign(new Error('常备量必须大于 0'), { status: 400 });
  }
  if (threshold > target) {
    throw Object.assign(new Error('提醒阈值不能高于常备量'), { status: 400 });
  }
  if (mode === 'fixed' && !member(spaceId, fixedId, true)) {
    throw Object.assign(new Error('固定采购需要选择一位在住成员'), { status: 400 });
  }
  return {
    name,
    quantity,
    target_quantity: target,
    low_threshold: threshold,
    unit: String(body.unit ?? (old && old.unit) ?? '个').trim() || '个',
    category: String(body.category ?? (old && old.category) ?? '其他').trim() || '其他',
    purchase_mode: mode,
    fixed_purchaser_id: fixedId,
    note: String(body.note ?? (old && old.note) ?? ''),
  };
}

router.get('/items', route((req, res) => {
  const includeArchived = String(req.query.include_archived || '0') === '1';
  const rows = db
    .prepare(
      `SELECT * FROM roomie_items WHERE space_id = ?
       ${includeArchived ? '' : "AND archived_at = ''"} ORDER BY id DESC`
    )
    .all(req.spaceId);
  const items = rows.map(itemJson);
  if (req.query.status) {
    return res.json(items.filter((row) => row.status === req.query.status));
  }
  res.json(items);
}));

router.post('/items', route((req, res) => {
  const fields = itemFields(req.spaceId, req.body || {});
  const ts = nowIso();
  const result = db.prepare(
    `INSERT INTO roomie_items
      (space_id, name, quantity, unit, low_threshold, note, updated_at, created_at,
       target_quantity, category, purchase_mode, fixed_purchaser_id, current_purchaser_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
  ).run(
    req.spaceId,
    fields.name,
    fields.quantity,
    fields.unit,
    fields.low_threshold,
    fields.note,
    ts,
    ts,
    fields.target_quantity,
    fields.category,
    fields.purchase_mode,
    fields.fixed_purchaser_id
  );
  res.status(201).json(
    itemJson(db.prepare('SELECT * FROM roomie_items WHERE id = ?').get(result.lastInsertRowid))
  );
}));

router.put('/items/:id', route((req, res) => {
  const old = db
    .prepare('SELECT * FROM roomie_items WHERE id = ? AND space_id = ?')
    .get(asId(req.params.id), req.spaceId);
  if (!old) return res.status(404).json({ error: '物品不存在' });
  const fields = itemFields(req.spaceId, req.body || {}, old);
  db.prepare(
    `UPDATE roomie_items SET name = ?, quantity = ?, unit = ?, low_threshold = ?,
     note = ?, updated_at = ?, target_quantity = ?, category = ?, purchase_mode = ?,
     fixed_purchaser_id = ? WHERE id = ?`
  ).run(
    fields.name,
    fields.quantity,
    fields.unit,
    fields.low_threshold,
    fields.note,
    nowIso(),
    fields.target_quantity,
    fields.category,
    fields.purchase_mode,
    fields.fixed_purchaser_id,
    old.id
  );
  res.json(itemJson(db.prepare('SELECT * FROM roomie_items WHERE id = ?').get(old.id)));
}));

router.delete('/items/:id', route((req, res) => {
  const result = db
    .prepare(
      "UPDATE roomie_items SET archived_at = ?, current_purchaser_id = NULL, updated_at = ? WHERE id = ? AND space_id = ?"
    )
    .run(nowIso(), nowIso(), asId(req.params.id), req.spaceId);
  if (!result.changes) return res.status(404).json({ error: '物品不存在' });
  res.json({ ok: true, action: 'archived' });
}));

router.post('/items/:id/claim', route((req, res) => {
  const row = db
    .prepare("SELECT * FROM roomie_items WHERE id = ? AND space_id = ? AND archived_at = ''")
    .get(asId(req.params.id), req.spaceId);
  if (!row) return res.status(404).json({ error: '物品不存在' });
  const item = assignItemPurchaser(row);
  if (!itemIsLow(item)) return res.status(409).json({ error: '库存充足，无需采购' });
  const actor = actorFor(req, res);
  if (!actor) return;
  if (item.current_purchaser_id && item.current_purchaser_id !== actor.id) {
    return res.status(409).json({ error: '该采购任务已分配给其他室友' });
  }
  if (item.purchase_mode === 'fixed' && item.fixed_purchaser_id !== actor.id) {
    return res.status(403).json({ error: '该物品由固定采购负责人补货' });
  }
  db.prepare('UPDATE roomie_items SET current_purchaser_id = ?, updated_at = ? WHERE id = ?')
    .run(actor.id, nowIso(), item.id);
  res.json(itemJson(db.prepare('SELECT * FROM roomie_items WHERE id = ?').get(item.id)));
}));

router.post('/items/:id/consume', route((req, res) => {
  const row = db
    .prepare("SELECT * FROM roomie_items WHERE id = ? AND space_id = ? AND archived_at = ''")
    .get(asId(req.params.id), req.spaceId);
  if (!row) return res.status(404).json({ error: '物品不存在' });
  const actor = actorFor(req, res);
  if (!actor) return;
  const amount = Number(req.body.quantity ?? req.body.consume_quantity ?? req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: '消耗数量必须大于 0' });
  }
  if (amount > row.quantity) {
    return res.status(400).json({ error: '消耗数量不能超过当前库存' });
  }
  const transactionId = db.transaction(() => {
    db.prepare('UPDATE roomie_items SET quantity = quantity - ?, updated_at = ? WHERE id = ?')
      .run(amount, nowIso(), row.id);
    return db.prepare(
      `INSERT INTO roomie_item_transactions
        (space_id, item_id, kind, delta, actor_id, expense_id, note, created_at)
       VALUES (?, ?, 'consume', ?, ?, NULL, ?, ?)`
    ).run(req.spaceId, row.id, -amount, actor.id, String(req.body.note || ''), nowIso())
      .lastInsertRowid;
  })();
  res.json({
    item: itemJson(db.prepare('SELECT * FROM roomie_items WHERE id = ?').get(row.id)),
    transaction: db.prepare('SELECT * FROM roomie_item_transactions WHERE id = ?').get(transactionId),
  });
}));

router.post('/items/:id/restock', route((req, res) => {
  const row = db
    .prepare("SELECT * FROM roomie_items WHERE id = ? AND space_id = ? AND archived_at = ''")
    .get(asId(req.params.id), req.spaceId);
  if (!row) return res.status(404).json({ error: '物品不存在' });
  const actor = actorFor(req, res);
  if (!actor) return;
  const assigned = assignItemPurchaser(row);
  if (assigned.current_purchaser_id && assigned.current_purchaser_id !== actor.id) {
    return res.status(403).json({ error: '该采购任务已分配给其他室友' });
  }
  const hasFinal =
    req.body.final_quantity !== undefined || req.body.current_quantity !== undefined;
  const finalQuantity = hasFinal
    ? Number(req.body.final_quantity ?? req.body.current_quantity)
    : Number(assigned.quantity) + Number(req.body.quantity ?? req.body.add_quantity);
  if (!Number.isFinite(finalQuantity) || finalQuantity < assigned.quantity) {
    return res.status(400).json({ error: '补货后的库存必须不少于当前库存' });
  }
  const delta = finalQuantity - assigned.quantity;
  if (delta <= 0) return res.status(400).json({ error: '补货数量必须大于 0' });
  const buyerId = asId(req.body.buyer_id) || actor.id;
  if (!member(req.spaceId, buyerId, true)) {
    return res.status(400).json({ error: '采购人不存在或已搬走' });
  }
  const shouldCreateExpense =
    !!req.body.create_expense ||
    !!req.body.cost_cents ||
    !!req.body.expense_amount ||
    !!req.body.expense_amount_cents ||
    (req.body.expense && typeof req.body.expense === 'object');
  const expenseBody =
    req.body.expense && typeof req.body.expense === 'object'
      ? { ...req.body.expense }
      : shouldCreateExpense
        ? {
            title: req.body.expense_title || `${assigned.name}补货`,
            amount:
              req.body.cost_cents ??
              req.body.expense_amount_cents ??
              req.body.expense_amount,
            category: req.body.expense_category || '日用品',
            participants: req.body.participants,
            split_method: req.body.split_method,
            shares: req.body.shares,
            scheme_id: req.body.scheme_id,
          }
        : null;
  const output = db.transaction(() => {
    let expense = null;
    if (expenseBody) {
      expenseBody.payer_id = buyerId;
      expenseBody.spent_at = expenseBody.spent_at || localDate();
      expenseBody.source_item_id = assigned.id;
      expense = insertExpense(req.spaceId, expenseBody);
    }
    db.prepare(
      'UPDATE roomie_items SET quantity = ?, current_purchaser_id = NULL, updated_at = ? WHERE id = ?'
    ).run(finalQuantity, nowIso(), assigned.id);
    const transactionId = db.prepare(
      `INSERT INTO roomie_item_transactions
        (space_id, item_id, kind, delta, actor_id, expense_id, note, created_at)
       VALUES (?, ?, 'restock', ?, ?, ?, ?, ?)`
    ).run(
      req.spaceId,
      assigned.id,
      delta,
      buyerId,
      expense ? expense.id : null,
      String(req.body.note || ''),
      nowIso()
    ).lastInsertRowid;
    return { expense, transactionId };
  })();
  if (output.expense) settlementFor(req.spaceId, output.expense.spent_at.slice(0, 7));
  res.json({
    item: itemJson(db.prepare('SELECT * FROM roomie_items WHERE id = ?').get(assigned.id)),
    transaction: db
      .prepare('SELECT * FROM roomie_item_transactions WHERE id = ?')
      .get(output.transactionId),
    expense: output.expense ? publicExpense(output.expense) : null,
  });
}));

// ===================== 室友公约 / 提案投票 =====================
function expireRuleProposals(spaceId) {
  const ts = nowIso();
  return db.prepare(
    `UPDATE roomie_rules SET status = 'expired', archived_at = ?, updated_at = ?
     WHERE space_id = ? AND status = 'pending' AND deadline <> '' AND deadline < ?`
  ).run(ts, ts, spaceId, localDate()).changes;
}

function ruleVotes(ruleId) {
  return db
    .prepare(
      `SELECT v.*, m.name, m.color FROM roomie_rule_votes v
       LEFT JOIN roomie_roommates m ON m.id = v.member_id
       WHERE v.rule_id = ? ORDER BY v.member_id`
    )
    .all(ruleId);
}

function ruleJson(row) {
  const snapshot = uniqueIds(parseJson(row.voter_snapshot || '[]', []));
  const storedVotes = ruleVotes(row.id);
  const storedByMember = new Map(storedVotes.map((vote) => [vote.member_id, vote]));
  const votes = snapshot.map((memberId) => {
    const stored = storedByMember.get(memberId);
    const voter = stored || member(row.space_id, memberId) || {};
    const decision = stored?.vote || 'pending';
    return {
      ...stored,
      member_id: memberId,
      roommate_id: memberId,
      name: voter.name || `成员 ${memberId}`,
      color: voter.color || '',
      vote: decision,
      decision,
      comment: stored?.comment || '',
    };
  });
  const agreed = votes.filter((vote) => vote.decision === 'agree').length;
  const revisions = votes.filter((vote) => vote.decision === 'revise').length;
  return {
    ...row,
    status: row.status === 'pending' && revisions ? 'changes_requested' : row.status,
    proposer_id: row.proposed_by,
    agree_count: agreed,
    voter_count: snapshot.length,
    voter_snapshot: snapshot,
    metadata: parseJson(row.metadata || '{}', {}),
    votes,
    vote_summary: {
      total: snapshot.length,
      agreed,
      needs_revision: revisions,
      pending: votes.filter((vote) => vote.decision === 'pending').length,
      all_agreed: !!snapshot.length && agreed === snapshot.length,
    },
    target_rule: row.parent_rule_id
      ? db
          .prepare('SELECT id, title, version, status FROM roomie_rules WHERE id = ?')
          .get(row.parent_rule_id) || null
      : null,
  };
}

function activeRule(spaceId, id) {
  return db
    .prepare("SELECT * FROM roomie_rules WHERE id = ? AND space_id = ? AND status = 'active'")
    .get(id, spaceId);
}

function applyProposal(ruleId) {
  const proposal = db
    .prepare("SELECT * FROM roomie_rules WHERE id = ? AND status = 'pending'")
    .get(ruleId);
  if (!proposal) return db.prepare('SELECT * FROM roomie_rules WHERE id = ?').get(ruleId);
  if (proposal.deadline && proposal.deadline < localDate()) {
    const ts = nowIso();
    db.prepare(
      "UPDATE roomie_rules SET status = 'expired', archived_at = ?, updated_at = ? WHERE id = ?"
    ).run(ts, ts, proposal.id);
    return db.prepare('SELECT * FROM roomie_rules WHERE id = ?').get(ruleId);
  }
  const voters = uniqueIds(parseJson(proposal.voter_snapshot || '[]', []));
  const agreed = db
    .prepare("SELECT COUNT(*) AS count FROM roomie_rule_votes WHERE rule_id = ? AND vote = 'agree'")
    .get(ruleId).count;
  if (!voters.length || agreed !== voters.length) return proposal;
  const ts = nowIso();
  if (proposal.proposal_type === 'create') {
    db.prepare(
      "UPDATE roomie_rules SET status = 'active', effective_at = ?, updated_at = ? WHERE id = ?"
    ).run(ts, ts, proposal.id);
  } else {
    const target = activeRule(proposal.space_id, proposal.parent_rule_id);
    if (!target) throw Object.assign(new Error('原公约已不在生效状态'), { status: 409 });
    // 修订后原版本标记为"已被替代"，废止后标记为"已废止"，避免历史里出现重复的同一公约
    const targetStatus = proposal.proposal_type === 'revise' ? 'superseded' : 'repealed';
    db.prepare(
      'UPDATE roomie_rules SET status = ?, archived_at = ?, updated_at = ? WHERE id = ?'
    ).run(targetStatus, ts, ts, target.id);
    if (proposal.proposal_type === 'revise') {
      db.prepare(
        `UPDATE roomie_rules SET status = 'active', version = ?, effective_at = ?,
         updated_at = ? WHERE id = ?`
      ).run((target.version || 1) + 1, ts, ts, proposal.id);
    } else {
      db.prepare(
        `UPDATE roomie_rules SET status = 'repealed', effective_at = ?, archived_at = ?,
         metadata = ?, updated_at = ? WHERE id = ?`
      ).run(
        ts,
        ts,
        JSON.stringify({ outcome: 'repealed', target_rule_id: target.id }),
        ts,
        proposal.id
      );
    }
  }
  return db.prepare('SELECT * FROM roomie_rules WHERE id = ?').get(ruleId);
}

const applyProposalTransaction = db.transaction(applyProposal);

function createProposal(spaceId, body, actor) {
  const type = String(body.proposal_type || body.type || 'create');
  if (!['create', 'revise', 'repeal'].includes(type)) {
    throw Object.assign(new Error('提案类型无效'), { status: 400 });
  }
  let target = null;
  if (type !== 'create') {
    target = activeRule(spaceId, asId(body.target_rule_id || body.parent_rule_id));
    if (!target) {
      throw Object.assign(new Error('要修改或废止的生效公约不存在'), { status: 404 });
    }
  }
  const title = String(body.title ?? (target && target.title) ?? '').trim();
  const content = String(body.content ?? (target && target.content) ?? '');
  if (!title) throw Object.assign(new Error('公约标题不能为空'), { status: 400 });
  const deadline = validDate(body.deadline, '');
  if (deadline && deadline < localDate()) {
    throw Object.assign(new Error('确认截止日期不能早于今天'), { status: 400 });
  }
  const voters = activeMembers(spaceId).map((row) => row.id);
  if (!voters.length) {
    throw Object.assign(new Error('至少需要一位在住成员参与确认'), { status: 409 });
  }
  const ts = nowIso();
  const result = db.prepare(
    `INSERT INTO roomie_rules
      (space_id, title, content, category, sort, created_at, updated_at, status, version,
       parent_rule_id, proposal_type, proposed_by, voter_snapshot, deadline,
       effective_at, archived_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, '', '', ?)`
  ).run(
    spaceId,
    title,
    content,
    String(body.category ?? (target && target.category) ?? '其他').trim() || '其他',
    Number(body.sort ?? (target && target.sort) ?? 0),
    ts,
    ts,
    target ? target.version || 1 : 1,
    target ? target.id : null,
    type,
    actor.id,
    JSON.stringify(voters),
    deadline,
    JSON.stringify({ reason: String(body.reason || '') })
  );
  // 发起人天然同意自己发出的版本；其他成员仍需逐一确认。
  db.prepare(
    `INSERT INTO roomie_rule_votes
      (rule_id, member_id, vote, comment, created_at, updated_at)
     VALUES (?, ?, 'agree', '', ?, ?)`
  ).run(result.lastInsertRowid, actor.id, ts, ts);
  return applyProposalTransaction(result.lastInsertRowid);
}

router.get('/rules', route((req, res) => {
  expireRuleProposals(req.spaceId);
  const rows = db
    .prepare('SELECT * FROM roomie_rules WHERE space_id = ? ORDER BY sort, id DESC')
    .all(req.spaceId);
  const pending = rows.filter((row) => row.status === 'pending').map(ruleJson);
  const active = rows.filter((row) => row.status === 'active').map(ruleJson);
  const history = rows
    .filter((row) => !['pending', 'active'].includes(row.status))
    // 废止提案本身只是操作记录，废止结果已体现在原公约状态上，避免历史里重复出现
    .filter((row) => String(row.proposal_type || 'create') !== 'repeal')
    .map(ruleJson);
  res.json({
    pending,
    active,
    history,
    counts: { pending: pending.length, active: active.length, history: history.length },
  });
}));

const createRuleHandler = route((req, res) => {
  const actor = actorFor(req, res);
  if (!actor) return;
  const proposal = db.transaction(createProposal)(req.spaceId, req.body || {}, actor);
  res.status(201).json(ruleJson(proposal));
});

router.post('/rules', createRuleHandler);
router.post('/rules/proposals', createRuleHandler);

router.post('/rules/:id/vote', route((req, res) => {
  expireRuleProposals(req.spaceId);
  const proposal = db
    .prepare("SELECT * FROM roomie_rules WHERE id = ? AND space_id = ? AND status = 'pending'")
    .get(asId(req.params.id), req.spaceId);
  if (!proposal) return res.status(404).json({ error: '待确认提案不存在' });
  const actor = actorFor(req, res);
  if (!actor) return;
  const voters = uniqueIds(parseJson(proposal.voter_snapshot || '[]', []));
  if (!voters.includes(actor.id)) {
    return res.status(403).json({ error: '你不在本提案的确认成员快照中' });
  }
  const vote = String(req.body.decision || req.body.vote || req.body.action || 'agree');
  if (!['agree', 'revise'].includes(vote)) {
    return res.status(400).json({ error: '投票只能是 agree 或 revise' });
  }
  const comment = String(req.body.comment || req.body.feedback || '').trim();
  if (vote === 'revise' && !comment) {
    return res.status(400).json({ error: '提出修改时请填写修改意见' });
  }
  const ts = nowIso();
  db.prepare(
    `INSERT INTO roomie_rule_votes
      (rule_id, member_id, vote, comment, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(rule_id, member_id) DO UPDATE SET vote = excluded.vote,
       comment = excluded.comment, updated_at = excluded.updated_at`
  ).run(proposal.id, actor.id, vote, comment, ts, ts);
  res.json(ruleJson(applyProposalTransaction(proposal.id)));
}));

router.put('/rules/:id', route((req, res) => {
  expireRuleProposals(req.spaceId);
  const old = db
    .prepare('SELECT * FROM roomie_rules WHERE id = ? AND space_id = ?')
    .get(asId(req.params.id), req.spaceId);
  if (!old) return res.status(404).json({ error: '公约不存在' });
  const actor = actorFor(req, res);
  if (!actor) return;
  if (old.status === 'active') {
    const proposal = db.transaction(createProposal)(
      req.spaceId,
      { ...req.body, proposal_type: 'revise', target_rule_id: old.id },
      actor
    );
    return res.status(201).json(ruleJson(proposal));
  }
  if (old.status !== 'pending') {
    return res.status(409).json({ error: '历史公约不能编辑' });
  }
  const originalProposerIsActive = !!member(req.spaceId, old.proposed_by, true);
  if (old.proposed_by !== actor.id && originalProposerIsActive) {
    return res.status(403).json({ error: '只有提案发起人可以更新提案' });
  }
  const title = String(req.body.title ?? old.title).trim();
  if (!title) return res.status(400).json({ error: '公约标题不能为空' });
  const deadline = validDate(req.body.deadline, old.deadline);
  if (deadline && deadline < localDate()) {
    return res.status(400).json({ error: '确认截止日期不能早于今天' });
  }
  const voters = activeMembers(req.spaceId).map((row) => row.id);
  if (!voters.length) return res.status(409).json({ error: '至少需要一位在住成员参与确认' });
  const ts = nowIso();
  db.transaction(() => {
    db.prepare(
      `UPDATE roomie_rules SET title = ?, content = ?, category = ?, deadline = ?,
       voter_snapshot = ?, proposed_by = ?, updated_at = ? WHERE id = ?`
    ).run(
      title,
      String(req.body.content ?? old.content),
      String(req.body.category ?? old.category ?? '其他').trim() || '其他',
      deadline,
      JSON.stringify(voters),
      actor.id,
      ts,
      old.id
    );
    // 提案内容变更后，按当前在住成员重新确认，仅保留本次编辑人的同意。
    db.prepare('DELETE FROM roomie_rule_votes WHERE rule_id = ?').run(old.id);
    db.prepare(
      `INSERT INTO roomie_rule_votes
        (rule_id, member_id, vote, comment, created_at, updated_at)
       VALUES (?, ?, 'agree', '', ?, ?)`
    ).run(old.id, actor.id, ts, ts);
  })();
  res.json(ruleJson(applyProposalTransaction(old.id)));
}));

router.post('/rules/:id/revise', route((req, res) => {
  const actor = actorFor(req, res);
  if (!actor) return;
  const proposal = db.transaction(createProposal)(
    req.spaceId,
    { ...(req.body || {}), proposal_type: 'revise', target_rule_id: asId(req.params.id) },
    actor
  );
  res.status(201).json(ruleJson(proposal));
}));

router.post('/rules/:id/repeal', route((req, res) => {
  const actor = actorFor(req, res);
  if (!actor) return;
  const proposal = db.transaction(createProposal)(
    req.spaceId,
    { ...(req.body || {}), proposal_type: 'repeal', target_rule_id: asId(req.params.id) },
    actor
  );
  res.status(201).json(ruleJson(proposal));
}));

router.delete('/rules/:id', route((req, res) => {
  const old = db
    .prepare('SELECT * FROM roomie_rules WHERE id = ? AND space_id = ?')
    .get(asId(req.params.id), req.spaceId);
  if (!old) return res.status(404).json({ error: '公约不存在' });
  const actor = actorFor(req, res);
  if (!actor) return;
  if (old.status === 'pending') {
    if (old.proposed_by !== actor.id) {
      return res.status(403).json({ error: '只有发起人可以撤回提案' });
    }
    db.prepare('DELETE FROM roomie_rules WHERE id = ?').run(old.id);
    return res.json({ ok: true, action: 'withdrawn' });
  }
  if (old.status !== 'active') {
    return res.status(409).json({ error: '历史公约无需再次废止' });
  }
  const proposal = db.transaction(createProposal)(
    req.spaceId,
    { proposal_type: 'repeal', target_rule_id: old.id },
    actor
  );
  res.status(202).json({
    ok: true,
    action: 'repeal_proposed',
    proposal: ruleJson(proposal),
  });
}));

// ===================== 待办提醒聚合 =====================
router.get('/alerts', route((req, res) => {
  const actor = actorFor(req, res, req.query.actor_id);
  if (!actor) return;
  const preferences = ensureSettings(req.spaceId);
  const today = localDate();
  const alerts = [];
  expireRuleProposals(req.spaceId);

  // voter_snapshot 是 JSON；在 JS 中做精确包含判断，避免 id=1 匹配到 11。
  // 站内红点默认开启，不再受提醒开关控制（开关改为控制邮件推送）
  {
    const pendingRules = db
      .prepare("SELECT * FROM roomie_rules WHERE space_id = ? AND status = 'pending'")
      .all(req.spaceId);
    for (const rule of pendingRules) {
      const voters = uniqueIds(parseJson(rule.voter_snapshot || '[]', []));
      const ownVote = db
        .prepare('SELECT vote FROM roomie_rule_votes WHERE rule_id = ? AND member_id = ?')
        .get(rule.id, actor.id);
      const needsRevision = db
        .prepare("SELECT 1 FROM roomie_rule_votes WHERE rule_id = ? AND vote = 'revise' LIMIT 1")
        .get(rule.id);
      if (rule.proposed_by === actor.id && needsRevision) {
        alerts.push({
          type: 'rule_revision',
          level: 'todo',
          id: rule.id,
          title: `公约收到修改意见：${rule.title}`,
        });
      } else if (voters.includes(actor.id) && !ownVote && !needsRevision) {
        alerts.push({
          type: 'rule_vote',
          level: 'todo',
          id: rule.id,
          title: `待确认公约：${rule.title}`,
        });
      }
    }
  }

  {
    const monthSettlement = settlementFor(req.spaceId, currentMonth());
    for (const transfer of monthSettlement.transfers) {
      if (transfer.from_member_id === actor.id && transfer.status === 'pending') {
        alerts.push({
          type: 'settlement_pay',
          level: 'todo',
          id: transfer.id,
          title: `待转账 ¥${(transfer.amount / 100).toFixed(2)}`,
        });
      }
      if (transfer.to_member_id === actor.id && transfer.status === 'paid') {
        alerts.push({
          type: 'settlement_confirm',
          level: 'todo',
          id: transfer.id,
          title: `待确认收款 ¥${(transfer.amount / 100).toFixed(2)}`,
        });
      }
    }
  }

  {
    // 站内红点只提示“今天到期或已逾期”的值日（未来的任务由邮件在到期前一天提醒）
    const chores = db
      .prepare(
        `SELECT * FROM roomie_chores WHERE space_id = ? AND done = 0 AND due_date <> ''
         AND due_date <= ? AND (assignee_id = ? OR assignee_id IS NULL)
         ORDER BY due_date`
      )
      .all(req.spaceId, today, actor.id);
    for (const chore of chores) {
      alerts.push({
        type: chore.assignee_id ? 'chore_due' : 'chore_unclaimed',
        level: chore.due_date < today ? 'urgent' : 'todo',
        id: chore.id,
        title: `${chore.assignee_id ? '值日待完成' : '值日待认领'}：${chore.title}`,
        due_date: chore.due_date,
      });
    }
  }

  {
    const lowItems = db
      .prepare(
        "SELECT * FROM roomie_items WHERE space_id = ? AND archived_at = '' AND quantity <= low_threshold"
      )
      .all(req.spaceId);
    for (const raw of lowItems) {
      const item = assignItemPurchaser(raw);
      if (!item.current_purchaser_id || item.current_purchaser_id === actor.id) {
        alerts.push({
          type: item.current_purchaser_id ? 'item_purchase' : 'item_claim',
          level: 'todo',
          id: item.id,
          title: `${item.current_purchaser_id ? '待补货' : '低库存待认领'}：${item.name}`,
        });
      }
    }
  }

  const badges = {
    rules: alerts.filter((row) => row.type.startsWith('rule_')).length,
    expenses: alerts.filter((row) => row.type.startsWith('settlement_')).length,
    chores: alerts.filter((row) => row.type.startsWith('chore_')).length,
    items: alerts.filter((row) => row.type.startsWith('item_')).length,
  };
  res.json({ total: alerts.length, badges, alerts, current_member_id: actor.id });
}));

module.exports = router;
