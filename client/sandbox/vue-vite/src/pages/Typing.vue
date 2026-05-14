<script setup lang="ts">
import { db, isLoading, error } from '../lib/db';
import TypingDemo from './TypingDemo.vue';
</script>

<template>
  <div v-if="isLoading" class="flex justify-center p-8">
    Creating ephemeral app...
  </div>
  <div v-else-if="error" class="p-8 text-red-500">Error: {{ error }}</div>
  <TypingDemo v-else-if="db" :db="db" />
</template>
