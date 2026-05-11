<template>
  <div class="counter">
    <span>count: {{ count }}</span>
    <button @click="count++">+1</button>
  </div>
</template>

<script setup>
import { ref } from 'vue'
const count = ref(0)
</script>
