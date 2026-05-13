<script setup lang="ts">
import { computed } from 'vue';
import { Cursors } from '@instantdb/vue';
import { db, isLoading, error } from '../lib/db';

const room = computed(() => db.value?.room('main' as any, 'cursors-demo'));
</script>

<template>
  <div v-if="isLoading" class="p-8 flex justify-center">
    Creating ephemeral app...
  </div>
  <div v-else-if="error" class="p-8 text-red-500">Error: {{ error }}</div>
  <Cursors v-else-if="room" :room="room" class="min-h-screen">
    <div class="p-8 flex flex-col gap-4">
      <h1 class="text-2xl text-[#F54A00] tracking-wide">Cursors Test</h1>
      <p class="text-neutral-500">
        Open this page in multiple tabs to see cursors from other users. Move
        your mouse around to broadcast your cursor position.
      </p>
      <div class="grid grid-cols-3 gap-4">
        <div
          v-for="i in 6"
          :key="i"
          class="bg-white rounded-lg p-8 border border-neutral-200 shadow flex items-center justify-center text-neutral-400"
        >
          Box {{ i }}
        </div>
      </div>
    </div>
  </Cursors>
</template>
