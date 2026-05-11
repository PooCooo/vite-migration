<template>
  <div class="searchbox">
    <h2>Searchbox Module</h2>
    <input v-model="query" placeholder="搜索..." @keyup.enter="search" />
    <button @click="search">搜索</button>
    <p v-if="result">结果：{{ result }}</p>
    <Counter />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Counter from './components/Counter.vue'

const query = ref('')
const result = ref('')

function search() {
  result.value = `搜索关键词: "${query.value}"`
}
</script>

<style>
.searchbox {
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 4px;
  max-width: 400px;
}
.searchbox input {
  padding: 6px 10px;
  margin-right: 8px;
  border: 1px solid #ccc;
  border-radius: 3px;
}
.searchbox button {
  padding: 6px 14px;
  background: #e03;
  color: #fff;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}
</style>
