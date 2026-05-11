<template>
  <div class="ai-searchbox">
    <h2>AI Searchbox Module (Result Page)</h2>
    <textarea v-model="prompt" rows="3" placeholder="输入 AI 问题..." />
    <button @click="ask">提问</button>
    <div v-if="answer" class="answer">{{ answer }}</div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const prompt = ref('')
const answer = ref('')

function ask() {
  answer.value = `[模拟回答] 你问的是: "${prompt.value}"`
}
</script>

<style>
.ai-searchbox { padding: 20px; }
.ai-searchbox textarea { display: block; width: 100%; margin-bottom: 8px; padding: 8px; }
.ai-searchbox button { padding: 6px 14px; background: #0066cc; color: #fff; border: none; border-radius: 3px; cursor: pointer; }
.answer { margin-top: 12px; padding: 10px; background: #f5f5f5; border-radius: 4px; }
</style>
