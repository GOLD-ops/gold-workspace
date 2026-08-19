<template>
  <Teleport to="body">
    <div v-if="confirmState.open" class="cf-overlay" @click.self="cancel">
      <div class="cf-dialog" role="dialog" aria-modal="true">
        <div class="cf-title">{{ confirmState.title }}</div>
        <div class="cf-message">{{ confirmState.message }}</div>
        <div class="cf-actions">
          <button class="cf-btn cf-cancel" @click="cancel">{{ confirmState.cancelText }}</button>
          <button
            class="cf-btn cf-confirm"
            :class="{ danger: confirmState.danger }"
            @click="confirm"
          >
            {{ confirmState.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { confirmState, resolveConfirm } from './confirm'

function cancel() {
  resolveConfirm(false)
}
function confirm() {
  resolveConfirm(true)
}
</script>

<style scoped>
.cf-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 20px;
}
.cf-dialog {
  width: 100%;
  max-width: 380px;
  background: #fff;
  border-radius: 14px;
  box-shadow: var(--tk-shadow-lg);
  padding: 22px 22px 18px;
  text-align: center;
}
.cf-title {
  font-size: 15.5px;
  font-weight: 700;
  color: var(--tk-text);
  margin-bottom: 8px;
}
.cf-message {
  font-size: 13px;
  line-height: 1.7;
  color: var(--tk-muted);
  margin-bottom: 18px;
  word-break: break-word;
}
.cf-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
}
.cf-btn {
  border: 1px solid var(--tk-border);
  background: #fff;
  color: var(--tk-text);
  border-radius: 9px;
  padding: 7px 18px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.cf-cancel:hover {
  border-color: #c8d0dc;
  background: #f5f7fa;
}
.cf-confirm {
  border-color: var(--tk-blue);
  background: var(--tk-blue);
  color: #fff;
}
.cf-confirm:hover {
  background: var(--tk-blue-dark);
}
.cf-confirm.danger {
  border-color: #dc2626;
  background: #dc2626;
}
.cf-confirm.danger:hover {
  background: #b91c1c;
}
</style>
