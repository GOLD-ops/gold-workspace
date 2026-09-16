// 费用分类预设，可在记账时直接选择，也支持自定义输入
export const CATEGORIES = [
  '房租',
  '水电燃气',
  '网络',
  '物业费',
  '日用品',
  '餐饮',
  '保洁',
  '维修',
  '娱乐',
  '其他',
]

// 成员头像配色：清新活泼的色调，明快且互相区分
export const COLORS = [
  '#4A90D9', // 晴空蓝
  '#2BB3A3', // 薄荷青
  '#5FBF6A', // 嫩绿
  '#F5A623', // 蜜橙
  '#EC5F92', // 樱花粉
  '#8E7BE0', // 薰衣草紫
  '#F2655A', // 珊瑚红
  '#29B6D8', // 清透蓝
]

export function colorFor(key) {
  const n = Number(key) || 0
  return COLORS[Math.abs(n) % COLORS.length]
}

export function roommateColor(roommate) {
  return roommate && roommate.color ? roommate.color : colorFor(roommate.id)
}

// 头像文字：取昵称最后一个字，比首字更有区分度
export function memberInitial(name) {
  const text = String(name || '').trim()
  return text ? text.slice(-1) : '?'
}

// 分 → 元字符串
export function centsToYuan(cents) {
  return (Math.round(Number(cents) || 0) / 100).toFixed(2)
}

// 元字符串 → 分
export function yuanToCents(str) {
  const n = parseFloat(str)
  if (Number.isNaN(n)) return 0
  return Math.round(n * 100)
}

export function todayStr() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function addDays(value, amount) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  date.setDate(date.getDate() + Number(amount || 0))
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

export function currentMonth() {
  return todayStr().slice(0, 7)
}

export function shiftMonth(value, offset) {
  const [year, month] = String(value || currentMonth()).split('-').map(Number)
  const date = new Date(year, (month || 1) - 1 + Number(offset || 0), 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(value) {
  const [year, month] = String(value || currentMonth()).split('-')
  return `${year} 年 ${Number(month)} 月`
}

export function safeJson(value, fallback = {}) {
  if (value && typeof value === 'object') return value
  try {
    return JSON.parse(value || '')
  } catch {
    return fallback
  }
}
