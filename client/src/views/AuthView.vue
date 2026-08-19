<template>
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-brand">
        <img src="/logo.svg" alt="GOLD" class="auth-logo" />
        <h1>GOLD Workspace</h1>
      </div>

      <form class="auth-form" @submit.prevent="submit">
        <!-- 登录：密码 / 验证码 -->
        <template v-if="mode === 'login'">
          <div class="auth-subtabs">
            <button
              type="button"
              :class="{ active: loginMethod === 'password' }"
              @click="loginMethod = 'password'"
            >
              密码登录
            </button>
            <button
              type="button"
              :class="{ active: loginMethod === 'code' }"
              @click="loginMethod = 'code'"
            >
              验证码登录
            </button>
          </div>

          <template v-if="loginMethod === 'password'">
            <div class="auth-row-field">
              <label>邮箱</label>
              <div class="auth-input-wrap">
                <input v-model="email" class="tk-input" placeholder="you@example.com" autocomplete="email" />
              </div>
            </div>
            <div class="auth-row-field">
              <label>密码</label>
              <div class="auth-input-wrap">
                <div class="auth-password">
                  <input
                    v-model="password"
                    :type="showPwd ? 'text' : 'password'"
                    class="tk-input"
                    placeholder="请输入密码"
                    autocomplete="current-password"
                  />
                  <button
                    type="button"
                    class="auth-eye"
                    :title="showPwd ? '隐藏密码' : '显示密码'"
                    @click="showPwd = !showPwd"
                  >
                    <svg
                      v-if="!showPwd"
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
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
                      width="18"
                      height="18"
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
          </template>

          <template v-else>
            <div class="auth-row-field">
              <label>邮箱</label>
              <div class="auth-input-wrap">
                <input v-model="email" class="tk-input" placeholder="you@example.com" autocomplete="email" />
              </div>
            </div>
            <div class="auth-row-field">
              <label>验证码</label>
              <div class="auth-input-wrap">
                <div class="auth-code-row">
                  <input v-model="code" class="tk-input" placeholder="6 位验证码" autocomplete="one-time-code" />
                  <button type="button" class="auth-send" :disabled="countdown > 0 || sendingCode" @click="sendCode">
                    {{ countdown > 0 ? `${countdown}s` : sendingCode ? '发送中…' : '发送验证码' }}
                  </button>
                </div>
              </div>
            </div>
          </template>
        </template>

        <!-- 注册 -->
        <template v-else-if="mode === 'register'">
          <p class="auth-register-hint">请使用邮箱注册，验证码将发送到你的邮箱。</p>
          <div class="auth-row-field">
            <label>邮箱</label>
            <div class="auth-input-wrap">
              <input v-model="email" class="tk-input" placeholder="you@example.com" autocomplete="email" />
            </div>
          </div>
          <div class="auth-row-field">
            <label>验证码</label>
            <div class="auth-input-wrap">
              <div class="auth-code-row">
                <input v-model="code" class="tk-input" placeholder="6 位验证码" autocomplete="one-time-code" />
                <button type="button" class="auth-send" :disabled="countdown > 0 || sendingCode" @click="sendCode">
                  {{ countdown > 0 ? `${countdown}s` : sendingCode ? '发送中…' : '发送验证码' }}
                </button>
              </div>
            </div>
          </div>
          <div class="auth-row-field">
            <label>密码</label>
            <div class="auth-input-wrap">
              <div class="auth-password">
                <input
                  v-model="password"
                  :type="showPwd ? 'text' : 'password'"
                  class="tk-input"
                  placeholder="至少 4 位"
                  autocomplete="new-password"
                />
                <button
                  type="button"
                  class="auth-eye"
                  :title="showPwd ? '隐藏密码' : '显示密码'"
                  @click="showPwd = !showPwd"
                >
                  <svg
                    v-if="!showPwd"
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
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
                    width="18"
                    height="18"
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
          <div class="auth-row-field">
            <label>邀请码</label>
            <div class="auth-input-wrap">
              <input v-model="inviteCode" class="tk-input" placeholder="选填，如已开启邀请注册" autocomplete="off" />
            </div>
          </div>
        </template>

        <!-- 找回密码 -->
        <template v-else>
          <p class="auth-register-hint">通过注册邮箱验证后设置新密码。</p>
          <div class="auth-row-field">
            <label>邮箱</label>
            <div class="auth-input-wrap">
              <input v-model="email" class="tk-input" placeholder="you@example.com" autocomplete="email" />
            </div>
          </div>
          <div class="auth-row-field">
            <label>验证码</label>
            <div class="auth-input-wrap">
              <div class="auth-code-row">
                <input v-model="code" class="tk-input" placeholder="6 位验证码" autocomplete="one-time-code" />
                <button type="button" class="auth-send" :disabled="countdown > 0 || sendingCode" @click="sendCode">
                  {{ countdown > 0 ? `${countdown}s` : sendingCode ? '发送中…' : '发送验证码' }}
                </button>
              </div>
            </div>
          </div>
          <div class="auth-row-field">
            <label>新密码</label>
            <div class="auth-input-wrap">
              <div class="auth-password">
                <input
                  v-model="password"
                  :type="showPwd ? 'text' : 'password'"
                  class="tk-input"
                  placeholder="至少 4 位"
                  autocomplete="new-password"
                />
                <button
                  type="button"
                  class="auth-eye"
                  :title="showPwd ? '隐藏密码' : '显示密码'"
                  @click="showPwd = !showPwd"
                >
                  <svg
                    v-if="!showPwd"
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
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
                    width="18"
                    height="18"
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
        </template>

        <p v-if="success" class="auth-success">{{ success }}</p>
        <p v-if="error" class="auth-error">{{ error }}</p>
        <button type="submit" class="tk-btn tk-btn-primary auth-submit" :disabled="loading">
          {{ loading ? '请稍候…' : submitLabel }}
        </button>

        <div class="auth-switch">
          <button
            v-if="mode === 'login' && loginMethod === 'password'"
            type="button"
            class="auth-link"
            @click="mode = 'reset'"
          >
            忘记密码？
          </button>
          <span style="flex: 1"></span>
          <template v-if="mode === 'login'">
            <span>没有账号？</span>
            <button type="button" @click="mode = 'register'">注册 &gt;</button>
          </template>
          <template v-else-if="mode === 'register'">
            <span>已有账号？</span>
            <button type="button" @click="mode = 'login'">登录 &gt;</button>
          </template>
          <template v-else>
            <button type="button" @click="mode = 'login'">&lt; 返回登录</button>
          </template>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { api, setToken, setStoredUser, getGuestToken } from '../api'

const router = useRouter()
const mode = ref('login')
const loginMethod = ref('password')
const email = ref('')
const code = ref('')
const password = ref('')
const inviteCode = ref('')
const error = ref('')
const success = ref('')
const loading = ref(false)
const sendingCode = ref(false)
const showPwd = ref(false)
const countdown = ref(0)
let countdownTimer = null

const submitLabel = computed(() => {
  if (mode.value === 'register') return '注册并登录'
  if (mode.value === 'reset') return '重置密码'
  return '立即登录'
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function startCountdown() {
  countdown.value = 60
  clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) clearInterval(countdownTimer)
  }, 1000)
}

async function sendCode() {
  const mail = email.value.trim()
  if (!EMAIL_RE.test(mail)) {
    error.value = '请先填写正确的邮箱地址'
    return
  }
  const purpose = mode.value === 'register' ? 'register' : mode.value === 'reset' ? 'reset' : 'login'
  sendingCode.value = true
  error.value = ''
  success.value = ''
  try {
    const r = await api('/api/auth/send-code', { method: 'POST', body: { email: mail, purpose } })
    success.value = r.message || '验证码已发送'
    startCountdown()
  } catch (e) {
    error.value = e.message
  } finally {
    sendingCode.value = false
  }
}

async function submit() {
  error.value = ''
  success.value = ''
  if (mode.value === 'register') {
    if (!email.value.trim() || !code.value.trim() || !password.value) {
      error.value = '请完整填写邮箱、验证码和密码'
      return
    }
  } else if (mode.value === 'reset') {
    if (!email.value.trim() || !code.value.trim() || !password.value) {
      error.value = '请完整填写邮箱、验证码和新密码'
      return
    }
  } else if (loginMethod.value === 'code') {
    if (!email.value.trim() || !code.value.trim()) {
      error.value = '请填写邮箱和验证码'
      return
    }
  } else if (!EMAIL_RE.test(email.value.trim()) || !password.value) {
    error.value = '请输入正确的邮箱和密码'
    return
  }

  loading.value = true
  try {
    const guest_token = getGuestToken()
    if (mode.value === 'register') {
      const r = await api('/api/auth/register', {
        method: 'POST',
        body: {
          email: email.value.trim(),
          code: code.value.trim(),
          password: password.value,
          invite_code: inviteCode.value.trim(),
          guest_token,
        },
      })
      setToken(r.token)
      setStoredUser(r.user)
      goHome()
      return
    }
    if (mode.value === 'reset') {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: {
          email: email.value.trim(),
          code: code.value.trim(),
          password: password.value,
        },
      })
      success.value = '密码已重置，请使用新密码登录'
      mode.value = 'login'
      loginMethod.value = 'password'
      password.value = ''
      code.value = ''
      return
    }
    const path = loginMethod.value === 'code' ? '/api/auth/login-code' : '/api/auth/login'
    const body =
      loginMethod.value === 'code'
        ? { email: email.value.trim(), code: code.value.trim(), guest_token }
        : { email: email.value.trim(), password: password.value, guest_token }
    const r = await api(path, { method: 'POST', body })
    setToken(r.token)
    setStoredUser(r.user)
    goHome()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function goHome() {
  const redirect = new URLSearchParams(window.location.search).get('redirect') || '/'
  router.replace(redirect)
}
</script>

<style scoped>
.auth-wrap {
  min-height: calc(100vh - 130px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 20px;
}
.auth-card {
  width: 100%;
  max-width: 400px;
  background: #fff;
  border: 1px solid var(--tk-border);
  border-radius: 18px;
  box-shadow: var(--tk-shadow-lg);
  padding: 34px 32px 28px;
}
.auth-brand { text-align: center; margin-bottom: 22px; }
.auth-logo {
  width: 62px;
  height: 62px;
  margin: 0 auto 12px;
  display: block;
}
.auth-brand h1 { font-size: 20px; font-weight: 800; color: var(--tk-text); }
.auth-subtabs {
  display: flex;
  gap: 6px;
  background: #f1f3f7;
  border-radius: 10px;
  padding: 4px;
  margin-bottom: 20px;
}
.auth-subtabs button {
  flex: 1;
  border: none;
  background: transparent;
  padding: 9px 0;
  border-radius: 9px;
  font-size: 14px;
  font-weight: 600;
  color: var(--tk-muted);
  cursor: pointer;
  transition: all 0.18s ease;
}
.auth-subtabs button.active { background: #fff; color: var(--tk-blue); box-shadow: var(--tk-shadow-sm); }
.auth-register-hint {
  font-size: 12px;
  color: var(--tk-muted);
  background: #f0f6ff;
  border: 1px solid #d6e6ff;
  border-radius: 10px;
  padding: 8px 12px;
  line-height: 1.6;
}
.auth-form { display: grid; gap: 18px; }
.auth-row-field { display: flex; align-items: center; gap: 8px; }
.auth-row-field > label {
  flex: none;
  width: 3em;
  text-align: left;
  font-size: 14px;
  font-weight: 600;
  color: var(--tk-muted);
  white-space: nowrap;
}
.auth-input-wrap { flex: 1; min-width: 0; }
.auth-input-wrap .tk-input {
  width: 100%;
  height: 46px;
  padding: 0 16px;
  font-size: 14.5px;
  border-radius: 12px;
  border: 1.5px solid #dbe1ea;
  background: #f7f9fc;
  color: var(--tk-text);
  transition: all 0.18s ease;
}
.auth-input-wrap .tk-input:focus {
  background: #fff;
  border-color: var(--tk-blue);
  box-shadow: 0 0 0 4px rgba(61, 110, 224, 0.12);
}
.auth-input-wrap .tk-input::placeholder { color: #aab3c0; }
.auth-password { position: relative; }
.auth-password .tk-input { padding-right: 44px; }
.auth-eye {
  position: absolute;
  right: 11px;
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
.auth-eye:hover { color: var(--tk-blue); }
.auth-code-row { display: flex; gap: 8px; }
.auth-code-row .tk-input { flex: 1; min-width: 0; }
.auth-send {
  flex: none;
  height: 46px;
  padding: 0 16px;
  border: 1px solid var(--tk-blue);
  background: var(--tk-blue-soft);
  color: var(--tk-blue);
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.18s ease;
}
.auth-send:hover:not(:disabled) { background: #dfe9fb; }
.auth-send:disabled { opacity: 0.6; cursor: not-allowed; }
.auth-link {
  border: none;
  background: transparent;
  color: var(--tk-blue);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 0;
}
.auth-link:hover { text-decoration: underline; }
.auth-error {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
}
.auth-success {
  background: #e8f5ee;
  color: #0e9f6e;
  border: 1px solid #bfe6d2;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
}
.auth-submit {
  width: 100%;
  height: 48px;
  margin-top: 10px;
  justify-content: center;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #fff;
  background: linear-gradient(135deg, #3d6ee0 0%, #2f56b8 100%);
  box-shadow: 0 8px 20px rgba(61, 110, 224, 0.28);
  transition: all 0.18s ease;
}
.auth-submit:hover {
  transform: translateY(-1px);
  background: linear-gradient(135deg, #2f56b8 0%, #26489d 100%);
  box-shadow: 0 12px 26px rgba(61, 110, 224, 0.34);
}
.auth-submit:active { transform: translateY(0); }
.auth-submit:disabled { opacity: 0.65; transform: none; }
.auth-switch {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--tk-faint);
}
.auth-switch button {
  border: none;
  background: transparent;
  color: var(--tk-blue);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 0;
}
.auth-switch button:hover { text-decoration: underline; }
</style>
