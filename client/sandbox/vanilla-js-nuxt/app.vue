<template>
  <button @click="triggerTest">call ID endpoint</button>
  <p><b>Server response:</b></p>
  <p>{{ JSON.stringify(response, null, 2) }}</p>
</template>

<script setup lang="ts">
import { id } from '@instantdb/core'
import { v4 } from 'uuid'

const response = ref(null)

async function triggerTest() {
  console.log('client-side v4:', v4)
  console.log('client-side instantdb id:', id)

  console.log('client-side uuid v4():', v4())
  console.log('client-side instantdb id():', id())

  response.value = await $fetch('/api/createId')
  console.log('server endpoint response:', response.value)
}
</script>

<style>
body {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 90vh;
}
</style>
