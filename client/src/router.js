import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from './api'
import HomeView from './views/HomeView.vue'
import AuthView from './views/AuthView.vue'

const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/login', name: 'login', component: AuthView },
  {
    path: '/tools/recruitment',
    name: 'recruitment',
    component: () => import('./tools/recruitment/RecruitmentTracker.vue'),
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach((to) => {
  const logged = !!getToken()
  if (to.path !== '/login' && !logged) return '/login'
  if (to.path === '/login' && logged) return '/'
})

export default router
