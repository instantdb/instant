<script setup lang="ts">
import { db, isLoading, error } from '../lib/db';
import InfiniteScrollDemo from './InfiniteScrollDemo.vue';
</script>

<template>
  <div v-if="isLoading" class="p-8 flex justify-center">
    Creating ephemeral app...
  </div>
  <div v-else-if="error" class="p-8 text-red-500">Error: {{ error }}</div>
  <InfiniteScrollDemo v-else-if="db" :db="db" />
</template>
