const mailer = require('./mailer');
const db = require('./db');

const PROVIDER_PRESETS = {
  deepseek: { base: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  openai: { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  kimi: { base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
};

function getAiConfig(namespace = '', spaceId = null) {
  // 文献分析：优先使用该空间（用户）自己的配置
  if (spaceId) {
    const row = db
      .prepare(
        'SELECT ai_provider, ai_base_url, ai_model, ai_api_key FROM literature_ai_config WHERE space_id = ?'
      )
      .get(spaceId);
    if (row && row.ai_api_key) {
      const provider = row.ai_provider || 'deepseek';
      const preset = PROVIDER_PRESETS[provider] || {};
      return {
        base: (row.ai_base_url || preset.base || '').replace(/\/+$/, ''),
        model: row.ai_model || preset.model || 'deepseek-chat',
        apiKey: row.ai_api_key || '',
        source: 'space',
      };
    }
  }
  const s = mailer.getSettings();
  const pre = namespace ? `${namespace}_` : '';
  const provider = s[`${pre}ai_provider`] || 'deepseek';
  const preset = PROVIDER_PRESETS[provider] || {};
  return {
    base: (s[`${pre}ai_base_url`] || preset.base || '').replace(/\/+$/, ''),
    model: s[`${pre}ai_model`] || preset.model || 'deepseek-chat',
    apiKey: s[`${pre}ai_api_key`] || '',
  };
}

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

async function chatJson({ system, user, maxTokens = 2000, timeoutMs = 90000, namespace = '', spaceId = null }) {
  const cfg = getAiConfig(namespace, spaceId);
  if (!cfg.base || !cfg.apiKey) {
    const err = new Error('尚未配置 AI 服务');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${cfg.base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      const err = new Error(`AI 接口返回 ${resp.status}：${detail.slice(0, 200)}`);
      err.code = 'AI_HTTP_ERROR';
      throw err;
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = extractJson(content);
    if (!parsed) {
      const err = new Error('AI 返回内容无法解析，请重试');
      err.code = 'AI_PARSE_ERROR';
      throw err;
    }
    return { parsed, content };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { getAiConfig, extractJson, chatJson };
