<template>
  <div class="app">
    <!-- 导航栏 -->
    <nav class="navbar">
      <div class="nav-content">
        <RouterLink to="/" class="logo">
          <img src="/logo.svg" alt="GOLD" class="logo-mark" />
          <span>GOLD Workspace</span>
        </RouterLink>
        <div class="nav-right">
          <template v-if="user">
            <span class="nav-user">{{ user.username }}<em v-if="user.is_admin">管理员</em></span>
            <button class="nav-logout" @click="logout">退出</button>
          </template>
          <RouterLink v-else to="/login" class="nav-link">登录</RouterLink>
          <a href="https://github.com/GOLD-ops" target="_blank" class="nav-link">GitHub</a>
        </div>
      </div>
    </nav>

    <!-- 路由视图：主页 / 各工具页面 -->
    <router-view />

    <!-- Footer -->
    <footer class="footer">
      <p>© 2026 GOLD · Built with Vue + Node.js + SQLite</p>
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, getStoredUser, clearToken, setStoredUser } from './api'

const route = useRoute()
const router = useRouter()
const user = ref(getStoredUser())

function refreshUser() {
  user.value = getStoredUser()
}

async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' })
  } catch {
    // 忽略退出接口错误
  }
  clearToken()
  setStoredUser(null)
  user.value = null
  router.push('/login')
}

onMounted(refreshUser)
watch(() => route.path, refreshUser)
</script>

<style scoped>
* { margin: 0; padding: 0; box-sizing: border-box; }
.app { min-height: 100vh; background: #fbfcfd; color: #333; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

/* 导航栏 */
.navbar { background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.06); position: sticky; top: 0; z-index: 10; }
.nav-content { max-width: 1200px; margin: 0 auto; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
.logo { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 700; color: #1a1a1a; text-decoration: none; }
.logo-mark { width: 28px; height: 28px; flex: none; }
.nav-right { display: flex; align-items: center; gap: 14px; }
.nav-user { font-size: 13px; color: #4a5568; display: inline-flex; align-items: center; gap: 6px; }
.nav-user em {
  font-style: normal;
  font-size: 11px;
  background: #eef3fc;
  color: #3d6ee0;
  border-radius: 999px;
  padding: 1px 8px;
}
.nav-logout {
  border: 1px solid #e4e8f0;
  background: #fff;
  color: #5d6878;
  border-radius: 8px;
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.nav-logout:hover { border-color: #fecaca; color: #dc2626; background: #fef2f2; }
.nav-link { color: #666; text-decoration: none; font-size: 14px; transition: color 0.2s; }
.nav-link:hover { color: #4a90d9; }

/* Footer */
.footer { text-align: center; padding: 32px 20px; color: #aaa; font-size: 12px; border-top: 1px solid #eee; margin-top: 40px; background: #fff; }
</style>
