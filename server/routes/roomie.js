const express = require('express');
const db = require('../db');

const router = express.Router();

// 合租生活管家业务表：若不存在则创建（与 db.js 中的结构保持一致）
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

function nowIso() {
  return new Date().toISOString();
}

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function parseParticipants(value) {
  try {
    const arr = JSON.parse(value || '[]');
    return Array.isArray(arr) ? arr.map((x) => Number(x)) : [];
  } catch {
    return [];
  }
}

function listRoommates(spaceId) {
  return db
    .prepare('SELECT * FROM roomie_roommates WHERE space_id = ? ORDER BY id')
    .all(spaceId);
}

function publicExpense(e) {
  return { ...e, participants: parseParticipants(e.participants) };
}

// 结算：计算每人净额，并给出最少笔数的转账建议
function settlement(spaceId) {
  const roommates = listRoommates(spaceId);
  const rows = db
    .prepare('SELECT * FROM roomie_expenses WHERE space_id = ? ORDER BY spent_at DESC, id DESC')
    .all(spaceId);

  const net = {};
  for (const r of roommates) net[r.id] = 0;

  for (const e of rows) {
    const parts = parseParticipants(e.participants);
    const count = parts.length || 1;
    const each = e.amount / count;
    if (e.payer_id != null) net[e.payer_id] = (net[e.payer_id] || 0) + e.amount;
    for (const pid of parts) {
      if (pid == null) continue;
      net[pid] = (net[pid] || 0) - each;
    }
  }

  const balances = roommates
    .map((r) => ({
      roommate: r,
      net_cents: Math.round(net[r.id] || 0),
      paid_cents: Math.round(rows.reduce((s, e) => (e.payer_id === r.id ? s + e.amount : s), 0)),
    }))
    .sort((a, b) => a.roommate.id - b.roommate.id);

  const creditors = [];
  const debtors = [];
  for (const b of balances) {
    if (b.net_cents > 0) creditors.push({ id: b.roommate.id, cents: b.net_cents });
    else if (b.net_cents < 0) debtors.push({ id: b.roommate.id, cents: -b.net_cents });
  }

  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < creditors.length && j < debtors.length) {
    const amt = Math.min(creditors[i].cents, debtors[j].cents);
    if (amt > 0) transfers.push({ from: debtors[j].id, to: creditors[i].id, cents: amt });
    creditors[i].cents -= amt;
    debtors[j].cents -= amt;
    if (creditors[i].cents <= 0) i++;
    if (debtors[j].cents <= 0) j++;
  }

  return { balances, transfers };
}

// ===================== 室友 =====================
router.get('/roommates', (req, res) => {
  res.json(listRoommates(req.spaceId));
});

router.post('/roommates', (req, res) => {
  const name = String((req.body && req.body.name) || '').trim();
  if (!name) return res.status(400).json({ error: '室友昵称不能为空' });
  const color = String((req.body && req.body.color) || '');
  const r = db
    .prepare('INSERT INTO roomie_roommates (space_id, name, color, created_at) VALUES (?, ?, ?, ?)')
    .run(req.spaceId, name, color, nowIso());
  res.json(db.prepare('SELECT * FROM roomie_roommates WHERE id = ?').get(r.lastInsertRowid));
});

router.put('/roommates/:id', (req, res) => {
  const row = db
    .prepare('SELECT * FROM roomie_roommates WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!row) return res.status(404).json({ error: '室友不存在' });
  const name = String((req.body && req.body.name) || '').trim();
  if (!name) return res.status(400).json({ error: '室友昵称不能为空' });
  const color = String((req.body && req.body.color) || '');
  db.prepare('UPDATE roomie_roommates SET name = ?, color = ? WHERE id = ?').run(
    name,
    color,
    row.id
  );
  res.json(db.prepare('SELECT * FROM roomie_roommates WHERE id = ?').get(row.id));
});

router.delete('/roommates/:id', (req, res) => {
  const r = db
    .prepare('DELETE FROM roomie_roommates WHERE id = ? AND space_id = ?')
    .run(req.params.id, req.spaceId);
  if (!r.changes) return res.status(404).json({ error: '室友不存在' });
  res.json({ ok: true });
});

// ===================== 费用 AA =====================
router.get('/expenses', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM roomie_expenses WHERE space_id = ? ORDER BY spent_at DESC, id DESC')
    .all(req.spaceId)
    .map(publicExpense);
  res.json({ expenses: rows, settlement: settlement(req.spaceId) });
});

function expenseFields(body) {
  return {
    title: String(body.title || '').trim(),
    amount: Math.round(Number(body.amount) || 0),
    category: String(body.category || '其他').trim() || '其他',
    payer_id: body.payer_id == null ? null : Number(body.payer_id),
    participants: Array.isArray(body.participants)
      ? body.participants.map((x) => Number(x)).filter((x) => Number.isInteger(x))
      : [],
    note: String(body.note || ''),
    spent_at: String(body.spent_at || todayStr()),
  };
}

router.post('/expenses', (req, res) => {
  const f = expenseFields(req.body || {});
  if (!f.title) return res.status(400).json({ error: '费用名称不能为空' });
  if (!f.amount || f.amount <= 0) return res.status(400).json({ error: '金额需大于 0' });
  const r = db
    .prepare(
      `INSERT INTO roomie_expenses (space_id, title, amount, category, payer_id, participants, note, spent_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.spaceId,
      f.title,
      f.amount,
      f.category,
      f.payer_id,
      JSON.stringify(f.participants),
      f.note,
      f.spent_at,
      nowIso()
    );
  res.json(
    publicExpense(db.prepare('SELECT * FROM roomie_expenses WHERE id = ?').get(r.lastInsertRowid))
  );
});

router.put('/expenses/:id', (req, res) => {
  const row = db
    .prepare('SELECT * FROM roomie_expenses WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!row) return res.status(404).json({ error: '费用记录不存在' });
  const f = expenseFields(req.body || {});
  if (!f.title) return res.status(400).json({ error: '费用名称不能为空' });
  if (!f.amount || f.amount <= 0) return res.status(400).json({ error: '金额需大于 0' });
  db.prepare(
    `UPDATE roomie_expenses SET title = ?, amount = ?, category = ?, payer_id = ?, participants = ?, note = ?, spent_at = ?
     WHERE id = ?`
  ).run(
    f.title,
    f.amount,
    f.category,
    f.payer_id,
    JSON.stringify(f.participants),
    f.note,
    f.spent_at,
    row.id
  );
  res.json(publicExpense(db.prepare('SELECT * FROM roomie_expenses WHERE id = ?').get(row.id)));
});

router.delete('/expenses/:id', (req, res) => {
  const r = db
    .prepare('DELETE FROM roomie_expenses WHERE id = ? AND space_id = ?')
    .run(req.params.id, req.spaceId);
  if (!r.changes) return res.status(404).json({ error: '费用记录不存在' });
  res.json({ ok: true });
});

// ===================== 值日排班 =====================
router.get('/chores', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM roomie_chores WHERE space_id = ? ORDER BY done ASC, due_date ASC, id DESC')
    .all(req.spaceId);
  res.json(rows);
});

router.post('/chores', (req, res) => {
  const title = String((req.body && req.body.title) || '').trim();
  if (!title) return res.status(400).json({ error: '值日事项不能为空' });
  const assigneeId = req.body.assignee_id == null ? null : Number(req.body.assignee_id);
  const dueDate = String((req.body && req.body.due_date) || todayStr());
  const r = db
    .prepare(
      `INSERT INTO roomie_chores (space_id, title, assignee_id, due_date, done, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`
    )
    .run(req.spaceId, title, assigneeId, dueDate, nowIso());
  res.json(db.prepare('SELECT * FROM roomie_chores WHERE id = ?').get(r.lastInsertRowid));
});

router.put('/chores/:id', (req, res) => {
  const row = db
    .prepare('SELECT * FROM roomie_chores WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!row) return res.status(404).json({ error: '值日事项不存在' });
  const title = String((req.body && req.body.title) || '').trim();
  if (!title) return res.status(400).json({ error: '值日事项不能为空' });
  const assigneeId = req.body.assignee_id == null ? null : Number(req.body.assignee_id);
  const dueDate = String((req.body && req.body.due_date) || row.due_date || '');
  const done = req.body.done == null ? row.done : Number(req.body.done) ? 1 : 0;
  const doneAt = done ? (row.done_at || nowIso()) : '';
  db.prepare(
    `UPDATE roomie_chores SET title = ?, assignee_id = ?, due_date = ?, done = ?, done_at = ?
     WHERE id = ?`
  ).run(title, assigneeId, dueDate, done, doneAt, row.id);
  res.json(db.prepare('SELECT * FROM roomie_chores WHERE id = ?').get(row.id));
});

router.delete('/chores/:id', (req, res) => {
  const r = db
    .prepare('DELETE FROM roomie_chores WHERE id = ? AND space_id = ?')
    .run(req.params.id, req.spaceId);
  if (!r.changes) return res.status(404).json({ error: '值日事项不存在' });
  res.json({ ok: true });
});

// ===================== 公共物品 =====================
router.get('/items', (req, res) => {
  res.json(
    db
      .prepare('SELECT * FROM roomie_items WHERE space_id = ? ORDER BY id DESC')
      .all(req.spaceId)
  );
});

function itemFields(body) {
  return {
    name: String(body.name || '').trim(),
    quantity: Number(body.quantity) || 0,
    unit: String(body.unit || '个').trim() || '个',
    low_threshold: Number(body.low_threshold) || 0,
    note: String(body.note || ''),
  };
}

router.post('/items', (req, res) => {
  const f = itemFields(req.body || {});
  if (!f.name) return res.status(400).json({ error: '物品名称不能为空' });
  const ts = nowIso();
  const r = db
    .prepare(
      `INSERT INTO roomie_items (space_id, name, quantity, unit, low_threshold, note, updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.spaceId, f.name, f.quantity, f.unit, f.low_threshold, f.note, ts, ts);
  res.json(db.prepare('SELECT * FROM roomie_items WHERE id = ?').get(r.lastInsertRowid));
});

router.put('/items/:id', (req, res) => {
  const row = db
    .prepare('SELECT * FROM roomie_items WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!row) return res.status(404).json({ error: '物品不存在' });
  const f = itemFields(req.body || {});
  if (!f.name) return res.status(400).json({ error: '物品名称不能为空' });
  db.prepare(
    `UPDATE roomie_items SET name = ?, quantity = ?, unit = ?, low_threshold = ?, note = ?, updated_at = ?
     WHERE id = ?`
  ).run(f.name, f.quantity, f.unit, f.low_threshold, f.note, nowIso(), row.id);
  res.json(db.prepare('SELECT * FROM roomie_items WHERE id = ?').get(row.id));
});

router.delete('/items/:id', (req, res) => {
  const r = db
    .prepare('DELETE FROM roomie_items WHERE id = ? AND space_id = ?')
    .run(req.params.id, req.spaceId);
  if (!r.changes) return res.status(404).json({ error: '物品不存在' });
  res.json({ ok: true });
});

// ===================== 室友公约 =====================
router.get('/rules', (req, res) => {
  res.json(
    db
      .prepare('SELECT * FROM roomie_rules WHERE space_id = ? ORDER BY sort, id')
      .all(req.spaceId)
  );
});

router.post('/rules', (req, res) => {
  const title = String((req.body && req.body.title) || '').trim();
  if (!title) return res.status(400).json({ error: '公约标题不能为空' });
  const content = String((req.body && req.body.content) || '');
  const ts = nowIso();
  const r = db
    .prepare(
      `INSERT INTO roomie_rules (space_id, title, content, sort, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`
    )
    .run(req.spaceId, title, content, ts, ts);
  res.json(db.prepare('SELECT * FROM roomie_rules WHERE id = ?').get(r.lastInsertRowid));
});

router.put('/rules/:id', (req, res) => {
  const row = db
    .prepare('SELECT * FROM roomie_rules WHERE id = ? AND space_id = ?')
    .get(req.params.id, req.spaceId);
  if (!row) return res.status(404).json({ error: '公约不存在' });
  const title = String((req.body && req.body.title) || '').trim();
  if (!title) return res.status(400).json({ error: '公约标题不能为空' });
  const content = String((req.body && req.body.content) || '');
  db.prepare('UPDATE roomie_rules SET title = ?, content = ?, updated_at = ? WHERE id = ?').run(
    title,
    content,
    nowIso(),
    row.id
  );
  res.json(db.prepare('SELECT * FROM roomie_rules WHERE id = ?').get(row.id));
});

router.delete('/rules/:id', (req, res) => {
  const r = db
    .prepare('DELETE FROM roomie_rules WHERE id = ? AND space_id = ?')
    .run(req.params.id, req.spaceId);
  if (!r.changes) return res.status(404).json({ error: '公约不存在' });
  res.json({ ok: true });
});

module.exports = router;
