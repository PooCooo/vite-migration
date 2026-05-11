<template>
  <div class="skin-panel">
    <h2>Skin Module</h2>
    <div class="swatches">
      <div
        v-for="color in colors"
        :key="color"
        class="swatch"
        :style="{ background: color }"
        @click="applyTheme(color)"
      />
    </div>
    <p>当前主题：{{ current }}</p>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const colors = ['#e03', '#0066cc', '#2e7d32', '#6a1b9a']
const current = ref(colors[0])

function applyTheme(color) {
  current.value = color
  document.documentElement.style.setProperty('--theme-color', color)
}
</script>

<style>
.skin-panel { padding: 20px; }
.swatches { display: flex; gap: 10px; margin-bottom: 12px; }
.swatch { width: 32px; height: 32px; border-radius: 50%; cursor: pointer; }
</style>
