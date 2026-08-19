const express = require('express');
const db = require('../../db');
const mailer = require('../../mailer');

const router = express.Router();

const PROVIDER_PRESETS = {
  deepseek: { base: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  openai: { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  kimi: { base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
};

function extractJson(text) {
  const t = String(text || '').trim();
  try {
    const obj = JSON.parse(t);
    if (obj && typeof obj === 'object') return obj;
  } catch {
    // ignore
  }
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // ignore
    }
  }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch {
      // ignore
    }
  }
  return null;
}

function cleanFields(obj) {
  const allowed = [
    'name',
    'link',
    'referral_code',
    'notes',
  ];
  const out = {};
  for (const k of allowed) {
    const v = obj ? obj[k] : undefined;
    out[k] = v === undefined || v === null ? '' : String(v).trim();
  }
  return out;
}

function cleanAppFields(obj) {
  const allowed = ['position', 'department', 'city', 'salary', 'notes', 'requirements'];
  const out = {};
  for (const k of allowed) {
    const v = obj ? obj[k] : undefined;
    out[k] = v === undefined || v === null ? '' : String(v).trim();
  }
  return out;
}

async function callAi(req, res, system, userText) {
  const spaceCfg = db
    .prepare('SELECT * FROM recruitment_ai_config WHERE space_id = ?')
    .get(req.spaceId);
  const s = mailer.getSettings();
  const provider = (spaceCfg && spaceCfg.ai_provider) || s.ai_provider || 'deepseek';
  const preset = PROVIDER_PRESETS[provider] || {};
  const base = (
    (spaceCfg && spaceCfg.ai_base_url) || s.ai_base_url || preset.base || ''
  ).replace(/\/+$/, '');
  const model = (spaceCfg && spaceCfg.ai_model) || s.ai_model || preset.model || 'deepseek-v4-flash';
  const apiKey = (spaceCfg && spaceCfg.ai_api_key) || s.ai_api_key;
  if (!base || !apiKey) {
    return res
      .status(400)
      .json({ error: '尚未配置 AI 服务，请先在「设置」中填写 API Key 与接口地址' });
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: String(userText).slice(0, 12000) },
        ],
        temperature: 0.1,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      return res.status(502).json({ error: `AI 接口返回 ${resp.status}：${detail.slice(0, 200)}` });
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = extractJson(content);
    if (!parsed) {
      return res.status(502).json({ error: 'AI 返回内容无法解析，请重试或更换模型' });
    }
    return { ok: true, parsed, raw: content.slice(0, 500) };
  } catch (err) {
    return res.status(502).json({ error: `请求失败：${err.message}` });
  }
}

router.post('/parse', async (req, res) => {
  const { text } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: '请先粘贴招聘文本' });
  }
  const system = `你是专业的秋招信息提取助手。请从用户粘贴的招聘文本 / 内推帖中提取以下字段，并只输出一个 JSON 对象，不要输出任何解释或 Markdown：
{
  "name": "公司名",
  "link": "投递链接或内推链接（没有则空字符串）",
  "referral_code": "内推码（没有则空字符串）",
  "notes": "其他值得记录的信息（如招聘要求、截止时间等），50字以内；没有则空字符串"
}`;
  const r = await callAi(req, res, system, text);
  if (r && r.parsed) res.json({ ok: true, fields: cleanFields(r.parsed), raw: r.raw });
});

// 投递信息识别：粘贴官网投递记录，提取岗位、城市、部门、薪资等投递级字段
router.post('/parse-application', async (req, res) => {
  const { text } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: '请先粘贴投递记录' });
  }
  const system = `你是专业的秋招信息提取助手。用户粘贴的是一段官网投递记录（可能包含公司名、岗位、城市、薪资等）。请只提取以下投递级字段，并只输出一个 JSON 对象，不要输出任何解释或 Markdown：
{
  "position": "应聘岗位（没有则空字符串）",
  "department": "部门/业务线（没有则空字符串）",
  "city": "工作城市/地点（没有则空字符串）",
  "salary": "薪资范围（如 20k-30k·14薪，没有则空字符串）",
  "requirements": "职位描述/职责/技能（完整保留原文的换行格式，换行用\\n表示；没有则空字符串）",
  "notes": "与该投递相关的其他信息（如岗位编号、批次、截止时间等），50字以内；没有则空字符串"
}`;
  const r = await callAi(req, res, system, text);
  if (r && r.parsed) res.json({ ok: true, fields: cleanAppFields(r.parsed), raw: r.raw });
});

module.exports = router;
