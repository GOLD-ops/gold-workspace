<template>
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-brand">
        <img src="/logo.svg" alt="GOLD" class="auth-logo" />
        <h1>GOLD Workspace</h1>
        <p class="auth-tagline">个人工具与求职进度管理</p>
      </div>

      <div class="auth-tabs">
        <button :class="{ active: mode === 'login' }" @click="mode = 'login'">登录</button>
        <button :class="{ active: mode === 'register' }" @click="mode = 'register'">注册</button>
      </div>

      <form class="auth-form" @submit.prevent="submit">
        <div class="auth-field">
          <label>用户名</label>
          <input v-model="username" class="tk-input" placeholder="你的用户名" autocomplete="username" />
        </div>
        <div class="auth-field">
          <label>密码</label>
          <div class="auth-password">
            <input
              v-model="password"
              :type="showPwd ? 'text' : 'password'"
              class="tk-input"
              placeholder="至少 4 位"
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
        <div v-if="mode === 'register'" class="auth-field">
          <label>邀请码 <span class="auth-optional">（如已开启邀请注册）</span></label>
          <input v-model="inviteCode" class="tk-input" placeholder="选填" autocomplete="off" />
        </div>
        <p v-if="error" class="auth-error">{{ error }}</p>
        <button type="submit" class="tk-btn tk-btn-primary auth-submit" :disabled="loading">
          {{ loading ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录' }}
        </button>
        <p class="auth-hint">
          登录后可在不同设备同步数据；游客期间产生的记录会自动合并到你的账号。
        </p>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, setToken, setStoredUser, getGuestToken } from '../api'

const router = useRouter()
const mode = ref('login')
const username = ref('')
const password = ref('')
const inviteCode = ref('')
const error = ref('')
const loading = ref(false)
const showPwd = ref(false)

async function submit() {
  if (!username.value.trim() || !password.value) {
    error.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const path = mode.value === 'login' ? '/api/auth/login' : '/api/auth/register'
    const body =
      mode.value === 'login'
        ? {
            username: username.value.trim(),
            password: password.value,
            guest_token: getGuestToken(),
          }
        : {
            username: username.value.trim(),
            password: password.value,
            invite_code: inviteCode.value.trim(),
            guest_token: getGuestToken(),
          }
    const r = await api(path, { method: 'POST', body })
    setToken(r.token)
    setStoredUser(r.user)
    const redirect = new URLSearchParams(window.location.search).get('redirect') || '/'
    router.replace(redirect)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-wrap {
  min-height: calc(100vh - 130px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}
.auth-card {
  width: 100%;
  max-width: 400px;
  background: #fff;
  border: 1px solid var(--tk-border);
  border-radius: 18px;
  box-shadow: var(--tk-shadow-lg);
  padding: 36px 34px 30px;
}
.auth-brand { text-align: center; margin-bottom: 26px; }
.auth-logo {
  width: 68px;
  height: 68px;
  margin: 0 auto 14px;
  display: block;
}
.auth-brand h1 { font-size: 20px; font-weight: 800; color: var(--tk-text); }
.auth-tagline { font-size: 13px; color: var(--tk-faint); margin-top: 6px; }
.auth-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 22px;
  background: #f1f3f7;
  border-radius: 12px;
  padding: 4px;
}
.auth-tabs button {
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
.auth-tabs button.active { background: #fff; color: var(--tk-blue); box-shadow: var(--tk-shadow-sm); }
.auth-form { display: grid; gap: 16px; }
.auth-field label { display: block; font-size: 12.5px; font-weight: 600; color: var(--tk-muted); margin-bottom: 6px; }
.auth-optional { font-weight: 400; color: var(--tk-faint); }
.auth-field .tk-input {
  width: 100%;
  height: 48px;
  padding: 0 16px;
  font-size: 14.5px;
  border-radius: 12px;
  border: 1.5px solid #dbe1ea;
  background: #f7f9fc;
  color: var(--tk-text);
  transition: all 0.18s ease;
}
.auth-field .tk-input:focus {
  background: #fff;
  border-color: var(--tk-blue);
  box-shadow: 0 0 0 4px rgba(61, 110, 224, 0.12);
}
.auth-field .tk-input::placeholder { color: #aab3c0; }
.auth-password { position: relative; }
.auth-password .tk-input { padding-right: 46px; }
.auth-eye {
  position: absolute;
  right: 12px;
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
.auth-error {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 12.5px;
}
.auth-submit {
  width: 100%;
  height: 48px;
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
.auth-hint {
  font-size: 11.5px;
  color: var(--tk-faint);
  text-align: center;
  line-height: 1.7;
  margin: 0;
}
</style>
