<template>
  <div>
    <div class="tk-settings-section tk-card">
      <h4>邮件提醒</h4>
      <p class="tk-desc">
        提醒邮件将由服务器配置的发信邮箱发送到下方接收邮箱；可为任意节点设置「提前 N 小时/天」定时提醒，「沉默提醒」会在已投递记录超过 N 天无进展时自动跟进。
      </p>
      <div class="tk-form-grid">
        <div class="tk-field">
          <label>接收提醒的邮箱</label>
          <input v-model="s.email" type="email" class="tk-input" placeholder="you@example.com" />
        </div>
        <div class="tk-field">
          <label>沉默提醒天数（0 表示关闭）</label>
          <input v-model="s.silence_days" type="number" min="0" class="tk-input" />
        </div>
      </div>
      <div class="tk-toolbar" style="margin-top: 12px">
        <button class="tk-btn tk-btn-primary" @click="saveSettings">保存设置</button>
        <button class="tk-btn" @click="testMail">发送测试邮件</button>
        <button class="tk-btn" @click="mailCheck">立即检查提醒</button>
      </div>
    </div>

    <div v-if="isAdmin" class="tk-settings-section tk-card">
      <h4>AI 智能识别配置</h4>
      <p class="tk-desc">
        粘贴招聘文本自动填写公司、岗位、薪资等字段。支持 DeepSeek、OpenAI、Kimi 及任意 OpenAI 兼容接口，密钥仅保存在你自己的服务器。
      </p>
      <div class="tk-form-grid">
        <div class="tk-field">
          <label>服务商</label>
          <select v-model="s.ai_provider" class="tk-select" @change="onProviderChange">
            <option value="deepseek">DeepSeek</option>
            <option value="openai">OpenAI</option>
            <option value="kimi">Kimi（Moonshot）</option>
            <option value="custom">自定义（OpenAI 兼容）</option>
          </select>
        </div>
        <div class="tk-field">
          <label>接口地址</label>
          <input v-model="s.ai_base_url" class="tk-input" placeholder="https://api.deepseek.com/v1" />
        </div>
        <div class="tk-field">
          <label>模型</label>
          <input v-model="s.ai_model" class="tk-input" placeholder="deepseek-chat" />
        </div>
        <div class="tk-field">
          <label>API Key</label>
          <div class="st-password">
            <input
              v-model="s.ai_api_key"
              :type="showKey ? 'text' : 'password'"
              class="tk-input"
              :placeholder="s.ai_api_key ? '已保存：' + s.ai_api_key + '（留空则不变）' : 'sk-…'"
            />
            <button
              type="button"
              class="st-eye"
              :title="showKey ? '隐藏' : '显示'"
              @click="showKey = !showKey"
            >
              <svg
                v-if="!showKey"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <svg
                v-else
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div class="tk-toolbar" style="margin-top: 12px">
        <button class="tk-btn tk-btn-primary" @click="saveSettings">保存 AI 配置</button>
      </div>
    </div>

    <div v-if="isAdmin" class="tk-settings-section tk-card">
      <h4>注册邀请</h4>
      <p class="tk-desc">
        默认开放注册；开启邀请码后，新用户必须输入正确邀请码才能注册。开启时会自动生成邀请码，也可以手动修改或一键重新生成。
      </p>
      <div class="tk-form-grid">
        <div class="tk-field">
          <label>需要邀请码</label>
          <select v-model="s.invite_required" class="tk-select" @change="onInviteToggle">
            <option value="0">关闭（开放注册）</option>
            <option value="1">开启（凭邀请码注册）</option>
          </select>
        </div>
        <div class="tk-field">
          <label>邀请码</label>
          <div class="st-invite-row">
            <input v-model="s.invite_code" class="tk-input" placeholder="点击「生成」自动创建，或手动输入" />
            <button class="tk-btn tk-btn-icon" title="自动生成新邀请码" @click="generateInvite">生成</button>
            <button class="tk-btn tk-btn-icon" title="复制邀请码" :disabled="!s.invite_code" @click="copyInvite">复制</button>
          </div>
        </div>
      </div>
      <div class="tk-toolbar" style="margin-top: 12px">
        <button class="tk-btn tk-btn-primary" @click="saveSettings">保存邀请设置</button>
      </div>
    </div>

    <div class="tk-settings-section tk-card">
      <h4>数据管理</h4>
      <p class="tk-desc">导出 JSON 备份可跨设备迁移；导入支持「合并」与「完全覆盖」两种模式。</p>
      <div class="tk-toolbar">
        <button class="tk-btn" @click="exportData">导出 JSON 备份</button>
        <label class="tk-btn" style="cursor: pointer">
          导入备份
          <input type="file" accept=".json,application/json" style="display: none" @change="importFile" />
        </label>
        <span style="flex: 1"></span>
        <button class="tk-btn tk-btn-danger" @click="clearAll">清空我的数据</button>
      </div>
    </div>

    <div class="tk-settings-section tk-card" v-if="reminders.length">
      <h4>最近提醒记录</h4>
      <table class="st-table">
        <thead>
          <tr><th>时间</th><th>公司</th><th>节点</th><th>类型</th><th>状态</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in reminders.slice(0, 20)" :key="r.id">
            <td>{{ formatDateTime(r.created_at) }}</td>
            <td>{{ r.company }}</td>
            <td>{{ r.milestone_name || '—' }}</td>
            <td>{{ r.kind === 'silence' ? '沉默提醒' : '节点提醒' }}</td>
            <td>
              <span :class="r.sent ? 'st-sent' : 'st-pending'">{{ r.sent ? '已发送' : '待发送' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 导入方式选择 -->
    <div v-if="pendingImport" class="tk-modal-overlay" @click.self="pendingImport = null">
      <div class="tk-modal st-import-modal">
        <div class="tk-modal-header">
          <h3>选择导入方式</h3>
          <button class="tk-modal-close" @click="pendingImport = null">✕</button>
        </div>
        <div class="tk-modal-body">
          <p class="st-import-file">
            文件：<strong>{{ pendingImport.name }}</strong>（{{ pendingImport.count }} 条记录）
          </p>
          <p class="st-import-hint">请选择导入方式：</p>
          <div class="st-import-options">
            <button class="tk-btn tk-btn-primary" @click="doImport('merge')">
              合并导入
              <span class="st-import-sub">保留现有记录，相同公司合并，其余追加</span>
            </button>
            <button class="tk-btn tk-btn-danger" @click="doImport('overwrite')">
              完全覆盖
              <span class="st-import-sub">删除现有全部记录，以文件内容替换（不可恢复）</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api, todayStr, formatDateTime, getStoredUser, copyText } from '../../api'

const emit = defineEmits(['reload', 'notify'])

const PRESETS = {
  deepseek: { base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  openai: { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  kimi: { base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  custom: { base: '', model: '' },
}

const s = ref({
  email: '',
  silence_days: '14',
  ai_provider: 'deepseek',
  ai_base_url: '',
  ai_model: '',
  ai_api_key: '',
  invite_required: '0',
  invite_code: '',
})
const reminders = ref([])
const pendingImport = ref(null)
let lastProvider = 'deepseek'
const isAdmin = computed(() => !!(getStoredUser() && getStoredUser().is_admin))
const showKey = ref(false)

onMounted(async () => {
  s.value = { ...s.value, ...(await api('/api/recruitment/settings')) }
  lastProvider = s.value.ai_provider
  loadReminders()
})

async function loadReminders() {
  try {
    reminders.value = await api('/api/recruitment/settings/reminders')
  } catch {
    reminders.value = []
  }
}

function onProviderChange() {
  const prev = PRESETS[lastProvider] || {}
  const next = PRESETS[s.value.ai_provider] || {}
  if (!s.value.ai_base_url || s.value.ai_base_url === prev.base) s.value.ai_base_url = next.base
  if (!s.value.ai_model || s.value.ai_model === prev.model) s.value.ai_model = next.model
  lastProvider = s.value.ai_provider
}

async function saveSettings() {
  try {
    const r = await api('/api/recruitment/settings', { method: 'PUT', body: { ...s.value } })
    s.value = { ...s.value, ...r }
    emit('notify', '设置已保存')
  } catch (e) {
    emit('notify', e.message)
  }
}

async function testMail() {
  try {
    await api('/api/recruitment/settings/test-mail', { method: 'POST' })
    emit('notify', '测试邮件已发送，请查收')
  } catch (e) {
    emit('notify', e.message)
  }
}

async function mailCheck() {
  try {
    const r = await api('/api/recruitment/settings/mail-check', { method: 'POST' })
    emit('notify', r.skipped ? '提醒检查完成（尚未配置邮箱/SMTP）' : `提醒检查完成，本次发送 ${r.sent} 封`)
    loadReminders()
  } catch (e) {
    emit('notify', e.message)
  }
}

async function exportData() {
  const data = await api('/api/recruitment/companies/export')
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `秋招追踪器备份-${todayStr()}.json`
  a.click()
  URL.revokeObjectURL(a.href)
  emit('notify', '已导出 JSON 备份')
}

async function importFile(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  try {
    const data = JSON.parse(await file.text())
    if (!data || !Array.isArray(data.companies)) {
      throw new Error('文件不是有效的秋招追踪器备份')
    }
    pendingImport.value = { name: file.name, count: data.companies.length, data }
  } catch (err) {
    emit('notify', `导入失败：${err.message}`)
  }
}

async function doImport(mode) {
  const info = pendingImport.value
  pendingImport.value = null
  try {
    const r = await api('/api/recruitment/companies/import', {
      method: 'POST',
      body: { mode, data: info.data },
    })
    emit('reload')
    emit('notify', `导入完成：新增 ${r.imported} 条，合并 ${r.merged} 条`)
  } catch (err) {
    emit('notify', `导入失败：${err.message}`)
  }
}

async function clearAll() {
  const ok1 = window.confirm('确定清空我的全部投递数据（公司、节点、笔记、提醒）吗？此操作不可恢复！')
  if (!ok1) return
  const ok2 = window.confirm('再次确认：真的要清空我的数据吗？建议先导出备份。')
  if (!ok2) return
  await api('/api/recruitment/companies', { method: 'DELETE' })
  emit('reload')
  emit('notify', '已清空我的数据')
}

function randomCode(len = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 去掉易混淆字符
  let out = ''
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

async function generateInvite() {
  s.value.invite_code = randomCode()
  await saveSettings()
  emit('notify', `已生成并保存新邀请码：${s.value.invite_code}`)
}

function onInviteToggle() {
  if (s.value.invite_required === '1' && !s.value.invite_code) {
    s.value.invite_code = randomCode()
    emit('notify', '已自动生成邀请码，可手动修改或点「保存邀请设置」生效')
  }
}

async function copyInvite() {
  if (!s.value.invite_code) return
  await copyText(s.value.invite_code)
  emit('notify', '邀请码已复制')
}
</script>

<style scoped>
.st-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.st-table th, .st-table td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid #eef1f5;
}
.st-table th { color: #9ca3af; font-weight: 500; }
.st-sent { color: #10b981; }
.st-pending { color: #f59e0b; }
.st-import-modal { max-width: 520px; }
.st-import-file { font-size: 13px; color: var(--tk-muted); margin-bottom: 16px; }
.st-import-hint { font-size: 12px; color: var(--tk-faint); margin-bottom: 12px; }
.st-import-options { display: grid; gap: 10px; }
.st-import-options .tk-btn {
  justify-content: space-between;
  width: 100%;
  padding: 14px 18px;
  border-radius: 12px;
  flex-wrap: wrap;
}
.st-import-sub {
  font-size: 11.5px;
  opacity: 0.75;
  font-weight: 400;
  width: 100%;
  text-align: left;
}
.st-invite-row { display: flex; gap: 8px; align-items: center; }
.st-invite-row .tk-input { flex: 1; min-width: 0; font-family: Consolas, Monaco, monospace; letter-spacing: 0.04em; }
.st-password { position: relative; }
.st-password .tk-input { padding-right: 42px; }
.st-eye {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: #98a2b3;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 6px;
  transition: color 0.15s ease;
}
.st-eye:hover { color: var(--tk-blue); }
@media (max-width: 700px) {
  .st-table { display: block; overflow-x: auto; white-space: nowrap; }
}
</style>
