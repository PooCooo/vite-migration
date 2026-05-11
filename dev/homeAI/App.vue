<template>
  <div class="home-ai">
    <h2>HomeAI Module</h2>
    <p>AI 入口模块（单入口，对应 homeAI/main.js）</p>
    <button @click="toggle">{{ visible ? '收起' : '展开' }}</button>
    <div v-if="visible" class="panel">AI 面板内容...</div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
const visible = ref(false)
const toggle = () => visible.value = !visible.value
</script>

<style>
.home-ai { padding: 20px; }
.panel { margin-top: 10px; padding: 10px; background: #e8f4fd; border-radius: 4px; }
</style>
