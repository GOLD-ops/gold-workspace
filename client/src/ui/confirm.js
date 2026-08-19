import { reactive } from 'vue'

export const confirmState = reactive({
  open: false,
  title: '',
  message: '',
  confirmText: '确认删除',
  cancelText: '取消',
  danger: true,
  resolve: null,
})

// 打开确认弹窗，返回 Promise<boolean>
export function confirmDialog(options = {}) {
  confirmState.title = options.title || '确认操作'
  confirmState.message = options.message || ''
  confirmState.confirmText = options.confirmText || '确认删除'
  confirmState.cancelText = options.cancelText || '取消'
  confirmState.danger = options.danger !== false
  confirmState.open = true
  return new Promise((resolve) => {
    confirmState.resolve = resolve
  })
}

export function resolveConfirm(result) {
  confirmState.open = false
  if (confirmState.resolve) confirmState.resolve(result)
  confirmState.resolve = null
}
