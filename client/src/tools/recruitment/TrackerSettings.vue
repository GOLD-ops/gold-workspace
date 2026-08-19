<template>
  <div>
<div class="tk-settings-section tk-card">
      <h4>AI 智能识别配置</h4>
      <p class="tk-desc">
        粘贴招聘文本自动识别并创建公司。支持 DeepSeek、OpenAI、Kimi 及任意 OpenAI 兼容接口；
        {{ isAdmin ? '当前为全局配置，未单独配置的用户将回退使用该配置。' : '配置仅对当前账号/设备生效，不影响其他用户。' }}
      </p>
      <div class="st-ai-layout">
        <div class="st-ai-fields">
          <div class="tk-field">
            <label>服务商</label>
            <SelectPicker v-model="s.ai_provider" :options="providerOptions" @change="onProviderChange" />
          </div>
          <div class="tk-field">
            <label>接口地址</label>
            <input v-model="s.ai_base_url" class="tk-input" placeholder="https://api.deepseek.com" />
          </div>
          <div class="tk-field">
            <label>模型</label>
            <input v-model="s.ai_model" class="tk-input" placeholder="deepseek-v4-flash" />
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
        <div class="st-ai-save">
          <button class="tk-btn tk-btn-primary" @click="saveSettings('ai')">保存配置</button>
        </div>
      </div>
    </div>

<div class="tk-settings-section tk-card">
      <h4>注册邀请</h4>
      <p class="tk-desc">
        默认开放注册；开启邀请码后，新用户必须输入正确邀请码才能注册。开启时会自动生成邀请码，也可以手动修改或一键重新生成。
      </p>
      <div class="st-invite-row">
        <div class="st-invite-field st-invite-toggle">
          <div class="st-group-title">需要邀请码</div>
          <SelectPicker
            v-model="s.invite_required"
            :options="inviteOptions"
            class="st-invite-picker"
            @change="onInviteToggle"
          />
        </div>
        <div class="st-invite-field st-invite-code">
          <div class="st-group-title">邀请码</div>
          <div class="st-invite-code-row">
            <input v-model="s.invite_code" class="tk-input" placeholder="点击「生成」自动创建，或手动输入" />
            <button class="tk-btn tk-btn-icon" title="自动生成新邀请码" @click="generateInvite">生成</button>
            <button class="tk-btn tk-btn-icon" title="复制邀请码" :disabled="!s.invite_code" @click="copyInvite">复制</button>
          </div>
        </div>
        <div class="st-invite-btns">
          <button class="tk-btn tk-btn-primary" @click="saveSettings">保存配置</button>
        </div>
      </div>
    </div>

<div class="tk-settings-section tk-card">
      <h4>邮件提醒</h4>
      <p class="tk-desc">
        提醒邮件将发送到下方接收邮箱；「阶段提醒」会在面试、笔试等节点开始前按你设置的提前时间自动发送提醒；「沉默提醒」会在已投递记录超过设定天数仍无进展时自动提醒你跟进。
      </p>

      <div class="st-mail-row">
        <div class="st-mail-field st-mail-email">
          <div class="st-group-title">接收邮箱</div>
          <input v-model="s.email" type="email" class="tk-input" placeholder="接收邮箱" />
        </div>
        <div class="st-mail-field st-mail-rule">
          <div class="st-mail-title-line">
            <label class="st-check" title="笔试、面试等环节前自动提醒">
              <input
                type="checkbox"
                :checked="s.remind_enabled === '1'"
                @change="s.remind_enabled = $event.target.checked ? '1' : '0'"
              />
            </label>
            <span class="st-group-title">阶段提醒</span>
          </div>
          <div class="st-remind-main">
            <div class="st-remind-row">
              <span class="st-remind-label">提前</span>
              <input v-model="s.remind_value" type="number" min="1" class="tk-input st-remind-num" />
              <SelectPicker v-model="s.remind_unit" :options="unitOptions" class="st-remind-unit-picker" />
              <template v-if="s.remind_unit === 'day'">
                <input v-model="s.remind_time" type="time" class="tk-input st-remind-time" />
              </template>
            </div>
          </div>
        </div>
        <div class="st-mail-field st-mail-silence">
          <div class="st-mail-title-line">
            <label class="st-check" title="投递超过 N 天无进展时自动跟进">
              <input
                type="checkbox"
                :checked="s.silence_enabled === '1'"
                @change="s.silence_enabled = $event.target.checked ? '1' : '0'"
              />
            </label>
            <span class="st-group-title">沉默提醒</span>
          </div>
          <input
            v-model="s.silence_days"
            type="number"
            min="0"
            class="tk-input st-silence-input"
            placeholder="天数"
            :disabled="s.silence_enabled !== '1'"
          />
        </div>
        <div class="st-mail-btns">
          <button class="tk-btn" @click="testMail">发送测试邮件</button>
          <button class="tk-btn tk-btn-primary" @click="saveSettings('mail')">保存配置</button>
        </div>
      </div>
    
      <div class="st-remind-history">
        <div class="st-remind-history-title">最近提醒记录</div>
      <table class="st-table">
        <thead>
          <tr><th>提醒时间</th><th>公司</th><th>岗位</th><th>节点</th><th>类型</th><th>状态</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in reminders.slice(0, 20)" :key="r.id">
            <td>{{ r.remind_at ? formatDateTime(r.remind_at) : '—' }}</td>
            <td>{{ r.company }}</td>
            <td>{{ r.position || '—' }}</td>
            <td>{{ r.milestone_name || '—' }}</td>
            <td>{{ r.kind === 'silence' ? '沉默提醒' : '阶段提醒' }}</td>
            <td>
              <span
                v-if="r.sent"
                class="st-sent"
              >已发送</span>
              <span
                v-else-if="r.last_error"
                class="st-failed"
                :title="r.last_error"
              >发送失败</span>
              <span v-else class="st-pending">待发送</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api, todayStr, formatDateTime, getStoredUser, copyText } from '../../api'
import { confirmDialog } from '../../ui/confirm'
import SelectPicker from './SelectPicker.vue'

const emit = defineEmits(['reload', 'notify'])

const PRESETS = {
  deepseek: { base: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  openai: { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  kimi: { base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  custom: { base: '', model: '' },
}

const providerOptions = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'kimi', label: 'Kimi（Moonshot）' },
  { value: 'custom', label: '自定义（OpenAI 兼容）' },
]
const unitOptions = [
  { value: 'day', label: '天' },
  { value: 'hour', label: '小时' },
]
const inviteOptions = [
  { value: '0', label: '关闭（开放注册）' },
  { value: '1', label: '开启（凭邀请码注册）' },
]

const s = ref({
  email: '',
  silence_days: '14',
  silence_enabled: '1',
  remind_enabled: '1',
  remind_value: '1',
  remind_unit: 'day',
  remind_time: '08:00',
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
  // 未配置时自动预填当前服务商的默认接口地址与模型
  const preset = PRESETS[s.value.ai_provider] || {}
  if (!s.value.ai_base_url && preset.base) s.value.ai_base_url = preset.base
  if (!s.value.ai_model && preset.model) s.value.ai_model = preset.model
  loadReminders()
  // 每 60 秒自动刷新提醒记录，让「已发送」状态及时更新
  remindTimer = setInterval(loadReminders, 60000)
})

let remindTimer = null
onBeforeUnmount(() => clearInterval(remindTimer))

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

const AI_KEYS = ['ai_provider', 'ai_base_url', 'ai_model', 'ai_api_key']
const MAIL_KEYS = ['email', 'silence_days', 'remind_enabled', 'remind_value', 'remind_unit', 'remind_time']

async function saveSettings(scope = 'all') {
  const isGuest = !getStoredUser()
  if (scope === 'mail' && isGuest) {
    emit('notify', '游客请先登录后使用邮件提醒')
    return
  }
  try {
    let payload = { ...s.value }
    if (scope === 'ai') {
      payload = Object.fromEntries(AI_KEYS.filter((k) => payload[k] !== undefined).map((k) => [k, payload[k]]))
      // 掩码（含 ****）不代表真实 Key，不提交，避免覆盖已保存的真实 Key
      if (String(payload.ai_api_key || '').includes('****')) {
        delete payload.ai_api_key
      }
    } else if (scope === 'mail') {
      payload = Object.fromEntries(MAIL_KEYS.filter((k) => payload[k] !== undefined).map((k) => [k, payload[k]]))
    }
    if (!isAdmin.value) {
      delete payload.invite_required
      delete payload.invite_code
    }
    const r = await api('/api/recruitment/settings', { method: 'PUT', body: payload })
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
  const ok1 = await confirmDialog({
    title: '清空全部数据',
    message: '确定清空我的全部投递数据（公司、节点、笔记、提醒）吗？此操作不可恢复！建议先导出备份。',
    confirmText: '清空数据',
  })
  if (!ok1) return
  const ok2 = await confirmDialog({
    title: '再次确认',
    message: '真的要清空我的数据吗？清空后所有记录将无法找回。',
    confirmText: '确认清空',
  })
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
    emit('notify', '已自动生成邀请码，可手动修改或点「保存配置」生效')
  }
}

async function copyInvite() {
  if (!s.value.invite_code) return
  await copyText(s.value.invite_code)
  emit('notify', '邀请码已复制')
}
</script>

<style scoped>
.st-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12.5px;
}
.st-table th {
  text-align: left;
  padding: 9px 12px;
  color: var(--tk-faint);
  font-weight: 600;
  font-size: 11.5px;
  letter-spacing: 0.02em;
  background: #f7f9fc;
}
.st-table th:first-child { border-radius: 10px 0 0 10px; }
.st-table th:last-child { border-radius: 0 10px 10px 0; }
.st-table td {
  text-align: left;
  padding: 10px 12px;
  color: var(--tk-muted);
  border: none;
}
.st-table tbody tr {
  transition: background 0.12s ease;
}
.st-table tbody tr:hover { background: #f7f9fc; }
.st-table td:first-child { color: var(--tk-text); }
.st-sent {
  display: inline-block;
  color: #0e9f6e;
  background: #e8f5ee;
  border-radius: 999px;
  padding: 2px 10px;
  font-weight: 600;
}
.st-pending {
  display: inline-block;
  color: #d97706;
  background: #fef3c7;
  border-radius: 999px;
  padding: 2px 10px;
  font-weight: 600;
}
.st-failed {
  display: inline-block;
  color: #dc2626;
  background: #fee2e2;
  border-radius: 999px;
  padding: 2px 10px;
  font-weight: 600;
  cursor: help;
}
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
.st-invite-row {
  display: flex;
  align-items: flex-end;
  gap: 24px;
  flex-wrap: wrap;
}
.st-invite-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.st-invite-field .st-group-title { margin-bottom: 0; }
.st-invite-toggle { flex: none; width: 200px; }
.st-invite-code { flex: none; width: 320px; }
.st-invite-code-row { display: flex; gap: 8px; align-items: center; }
.st-invite-code-row .tk-input {
  flex: 1;
  min-width: 0;
  font-family: Consolas, Monaco, monospace;
  letter-spacing: 0.04em;
}
.st-invite-btns {
  display: flex;
  flex: none;
  margin-left: auto;
  padding-bottom: 2px;
  padding-left: 14px;
}
.st-group { margin-top: 16px; }
.st-group:first-of-type { margin-top: 10px; }
.st-mail-row {
  display: flex;
  align-items: flex-end;
  gap: 24px;
  flex-wrap: wrap;
}
.st-mail-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.st-mail-field .st-group-title { margin-bottom: 0; }
.st-mail-title-line {
  display: flex;
  align-items: center;
  gap: 6px;
}
.st-mail-title-line .st-check {
  font-weight: 400;
  color: var(--tk-text);
}
.st-mail-email { flex: none; width: 200px; }
.st-mail-rule { flex: none; width: auto; }
.st-mail-silence { flex: none; width: 110px; }
.st-mail-btns {
  display: flex;
  gap: 8px;
  flex: none;
  padding-bottom: 2px;
  margin-left: auto;
  padding-left: 14px;
}
.st-silence-input { width: 100%; }
.st-silence-input:disabled {
  background: #f4f6f9;
  color: #b6bdc9;
  cursor: not-allowed;
}
.st-group-title {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--tk-muted);
  margin-bottom: 8px;
  letter-spacing: 0.02em;
}
.st-group-desc {
  font-size: 12px;
  color: var(--tk-faint);
  margin: 0 0 10px;
  line-height: 1.6;
}
.st-remind-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
}
.st-check {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
  color: var(--tk-text);
  cursor: pointer;
  white-space: nowrap;
}
.st-check input {
  width: 15px;
  height: 15px;
  accent-color: var(--tk-blue);
  cursor: pointer;
}
.st-remind-row {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: nowrap;
}
.st-remind-label { font-size: 12px; color: var(--tk-muted); white-space: nowrap; }
.st-remind-num,
.st-remind-unit,
.st-remind-time {
  height: 30px;
  min-height: 30px;
  padding: 0 6px;
  box-sizing: border-box;
  line-height: 28px;
}
.st-remind-num { width: 46px; }
.st-remind-unit { width: 60px; }
.st-remind-time { width: 78px; }
.st-ai-layout {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}
.st-ai-fields {
  display: flex;
  gap: 20px;
  align-items: flex-end;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}
.st-ai-fields .tk-field {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.st-ai-fields .tk-field:nth-child(1) { width: 150px; }
.st-ai-fields .tk-field:nth-child(2) { width: 230px; }
.st-ai-fields .tk-field:nth-child(3) { width: 150px; }
.st-ai-fields .tk-field:nth-child(4) { width: 210px; }
.st-ai-fields .tk-field label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--tk-muted);
}
.st-ai-save {
  display: flex;
  align-items: center;
  flex: none;
  margin-left: auto;
  padding-left: 14px;
}
.st-actions {
  margin-top: 16px;
  margin-bottom: 0;
}
.st-remind-history {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed #e4e9f1;
}
.st-remind-history-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--tk-text);
  margin-bottom: 10px;
}
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
