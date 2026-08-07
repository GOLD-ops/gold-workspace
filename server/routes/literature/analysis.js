const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../../db');
const { chatJson } = require('../../ai-client');

const router = express.Router();

// 内存中的分析队列（按空间隔离；服务重启后由 index.js 重置状态）
const queues = (globalThis.__litQueues = globalThis.__litQueues || new Map());

function nowIso() {
  return new Date().toISOString();
}

function queueFor(spaceId) {
  if (!queues.has(spaceId)) {
    queues.set(spaceId, {
      running: false,
      queue: [],
      stats: { total: 0, done: 0, failed: 0 },
    });
  }
  return queues.get(spaceId);
}

function buildPrompt(fields, text) {
  const typeNames = {
    text: '文本',
    year: '年份（格式如 2026，未知填"未提及"）',
    date: '日期（格式如 2026-08，未知填"未提及"）',
    month: '月份（格式如 2026-08）',
    boolean: '布尔（只回答"是"或"否"）',
    number: '数字',
    month: '月份（格式如 2026-08）',
    category: '单选分类',
    multi: '多选分类（列出所有符合的选项，用逗号分隔）',
  };
  const fieldMap = fields
    .map((f) => {
      const opts = f.options ? `；候选：${f.options}` : '';
      const extra = f.description ? `；要求：${f.description}` : '';
      return `"${f.field_key}": "${f.label}（${typeNames[f.type] || '文本'}${opts}${extra}）"`;
    })
    .join(', ');
  return `字段清单：{${fieldMap}}
文献全文："""${text}"""`;
}

async function processPaper(paperId, spaceId, fields) {
  const paper = db
    .prepare('SELECT * FROM literature_papers WHERE id = ? AND space_id = ?')
    .get(paperId, spaceId);
  if (!paper) return;
  db.prepare('UPDATE literature_papers SET status = ?, error = ?, updated_at = ? WHERE id = ?').run(
    'analyzing',
    '',
    nowIso(),
    paperId
  );
  try {
    if (paper.text_status !== 'text' && paper.text_status !== 'ocr') {
      throw new Error('文本尚未就绪（待提取或提取失败）');
    }
    const text = fs.readFileSync(paper.text_path, 'utf8');
    const system =
      '你是专业的学术文献分析助手。根据用户提供的文献文本与字段清单，逐项提取或总结。' +
      '只输出一个 JSON 对象，键必须与字段清单中的 key 完全一致，值为字符串。' +
      '内容使用中文；信息不足时填"未提及"，不要编造。不要输出任何解释或 Markdown。';
    const { parsed } = await chatJson({
      system,
      user: buildPrompt(fields, text),
      maxTokens: 4000,
      timeoutMs: 120000,
      namespace: 'lit',
      spaceId,
    });
    const ts = nowIso();
    const tx = db.transaction(() => {
      for (const f of fields) {
        const v = parsed[f.field_key];
        const val = v === undefined || v === null ? '' : String(v);
        const exist = db
          .prepare('SELECT id FROM literature_analyses WHERE paper_id = ? AND field_key = ?')
          .get(paperId, f.field_key);
        if (exist) {
          db.prepare('UPDATE literature_analyses SET value = ?, updated_at = ? WHERE id = ?').run(
            val,
            ts,
            exist.id
          );
        } else {
          db.prepare(
            'INSERT INTO literature_analyses (paper_id, field_key, value, updated_at) VALUES (?, ?, ?, ?)'
          ).run(paperId, f.field_key, val, ts);
        }
      }
    });
    tx();
    db.prepare('UPDATE literature_papers SET status = ?, error = ?, updated_at = ? WHERE id = ?').run(
      'done',
      '',
      nowIso(),
      paperId
    );
    return true;
  } catch (e) {
    db.prepare('UPDATE literature_papers SET status = ?, error = ?, updated_at = ? WHERE id = ?').run(
      'error',
      e.message || '分析失败',
      nowIso(),
      paperId
    );
    return false;
  }
}

async function runQueue(spaceId) {
  const q = queueFor(spaceId);
  if (q.running) return;
  q.running = true;
  const fields = db
    .prepare(
      'SELECT field_key, label, type, description, options FROM literature_fields WHERE space_id = ? AND enabled = 1 ORDER BY sort, id'
    )
    .all(spaceId);
  try {
    while (q.queue.length) {
      const id = q.queue.shift();
      const ok = await processPaper(id, spaceId, fields);
      if (ok) q.stats.done++;
      else q.stats.failed++;
    }
  } finally {
    q.running = false;
  }
}

router.post('/start', (req, res) => {
  const ids = Array.isArray(req.body.paper_ids)
    ? req.body.paper_ids.map(Number).filter(Boolean)
    : [];
  if (!ids.length) return res.status(400).json({ error: '请先选择要分析的文献' });
  const q = queueFor(req.spaceId);
  const valid = [];
  for (const id of ids) {
    const paper = db
      .prepare('SELECT * FROM literature_papers WHERE id = ? AND space_id = ?')
      .get(id, req.spaceId);
    if (!paper) continue;
    if (paper.status === 'analyzing') continue;
    if (paper.text_status !== 'text' && paper.text_status !== 'ocr') {
      return res.status(400).json({
        error: `「${paper.filename}」的文本尚未就绪，请稍后或先手动粘贴文本`,
      });
    }
    valid.push(id);
  }
  if (!valid.length) return res.status(400).json({ error: '没有可分析的文献' });
  q.stats.total += valid.length;
  q.queue.push(...valid);
  runQueue(req.spaceId).catch(() => {});
  res.json({ ok: true, queued: valid.length });
});

router.get('/status', (req, res) => {
  const q = queueFor(req.spaceId);
  res.json({ running: q.running, queued: q.queue.length, ...q.stats });
});

module.exports = router;
module.exports.resetAll = function resetAll() {
  db.prepare("UPDATE literature_papers SET status = 'pending', error = '' WHERE status = 'analyzing'").run();
};
