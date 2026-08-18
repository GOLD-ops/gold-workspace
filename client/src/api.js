const TOKEN_KEY = 'tk_token'
const USER_KEY = 'tk_user'
const GUEST_KEY = 'tk_guest'

// 游客空间标识：首次访问自动生成，用于在服务器端隔离/关联数据
export function getGuestToken() {
  let t = localStorage.getItem(GUEST_KEY)
  if (!t) {
    t =
      window.crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : 'g-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem(GUEST_KEY, t)
  }
  return t
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
  } catch {
    return null
  }
}

export function setStoredUser(user) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
  else localStorage.removeItem(USER_KEY)
}

export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  else headers['X-Space-Token'] = getGuestToken()
  const res = await fetch(path, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) {
    clearToken()
    setStoredUser(null)
    if (window.location.pathname !== '/login') {
      window.location.reload()
    }
    throw new Error('登录已过期，请重新登录')
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = data && data.error ? data.error : `请求失败（${res.status}）`;
    throw new Error(msg);
  }
  return data;
}

export const STATUSES = ['未投递', '已投递', '笔试', '面试', 'Offer', '已淘汰'];

export const STATUS_COLORS = {
  未投递: '#94a3b8',
  已投递: '#4a90d9',
  笔试: '#f59e0b',
  面试: '#8b5cf6',
  Offer: '#10b981',
  已淘汰: '#64748b',
};

export const RESULT_OPTIONS = [
  { value: 'none', label: '无结果' },
  { value: 'waiting', label: '等待中' },
  { value: 'pass', label: '通过' },
  { value: 'fail', label: '未通过' },
];

export const RESULT_COLORS = {
  none: { color: '#64748b', bg: '#f1f5f9' },
  waiting: { color: '#d97706', bg: '#fef3c7' },
  pass: { color: '#0e9f6e', bg: '#e8f5ee' },
  fail: { color: '#dc2626', bg: '#fee2e2' },
};

export const PRIORITY_COLORS = {
  高: { color: '#dc2626', bg: '#fee2e2' },
  中: { color: '#d97706', bg: '#fef3c7' },
  低: { color: '#64748b', bg: '#f1f5f9' },
};

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseTagsText(text) {
  return String(text || '')
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}
