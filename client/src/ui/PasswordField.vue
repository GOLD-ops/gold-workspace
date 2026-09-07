<template>
  <div class="pf">
    <input
      class="pf-input"
      :type="show ? 'text' : 'password'"
      :value="modelValue"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      @input="$emit('update:modelValue', $event.target.value)"
    />
    <button
      type="button"
      class="pf-eye"
      :title="show ? '隐藏密码' : '显示密码'"
      tabindex="-1"
      @click="show = !show"
    >
      <svg
        v-if="!show"
        xmlns="http://www.w3.org/2000/svg"
        width="17"
        height="17"
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
        width="17"
        height="17"
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
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  autocomplete: { type: String, default: 'current-password' },
})
defineEmits(['update:modelValue'])

const show = ref(false)
</script>

<style scoped>
.pf {
  position: relative;
  width: 100%;
}
.pf-input {
  width: 100%;
  height: 46px;
  padding: 0 44px 0 16px;
  font-size: 14.5px;
  border-radius: 12px;
  border: 1.5px solid #dbe1ea;
  background: #f7f9fc;
  color: var(--tk-text);
  box-sizing: border-box;
  font-family: inherit;
  outline: none;
  transition: all 0.18s ease;
}
.pf-input:focus {
  background: #fff;
  border-color: var(--tk-blue);
  box-shadow: 0 0 0 4px rgba(61, 110, 224, 0.12);
}
.pf-input::placeholder { color: #aab3c0; }
.pf-input::-ms-reveal,
.pf-input::-ms-clear {
  display: none;
}
.pf-eye {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #98a2b3;
  cursor: pointer;
  padding: 5px;
  border-radius: 8px;
  transition: color 0.15s ease, background 0.15s ease;
}
.pf-eye:hover {
  color: var(--tk-blue);
  background: rgba(61, 110, 224, 0.08);
}
</style>
