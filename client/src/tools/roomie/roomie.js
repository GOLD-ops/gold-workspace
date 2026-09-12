export const CATEGORIES = ['房租', '水电燃气', '网络', '日用品', '餐饮', '其他']

export const COLORS = [
  '#3d6ee0',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#0ea5e9',
  '#ec4899',
  '#64748b',
]

export function colorFor(key) {
  const n = Number(key) || 0
  return COLORS[Math.abs(n) % COLORS.length]
}

export function roommateColor(roommate) {
  return roommate && roommate.color ? roommate.color : colorFor(roommate.id)
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
