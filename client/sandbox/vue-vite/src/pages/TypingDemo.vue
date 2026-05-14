<script setup lang="ts">
import { ref } from 'vue';
import { id } from '@instantdb/vue';
import type { DB } from '../lib/db';

const props = defineProps<{ db: DB }>();

const userId = id();
const room = props.db.room('typing-indicator-example' as any, '1234');

props.db.rooms.useSyncPresence(room as any, { id: userId });

const { active, inputProps } = props.db.rooms.useTypingIndicator(
  room as any,
  'chat-input',
);

const message = ref('');

function typingInfo(activeList: any[]) {
  if (activeList.length === 1) return '1 person is typing...';
  return `${activeList.length} people are typing...`;
}
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-4 p-8">
    <h1 class="text-2xl tracking-wide text-[#F54A00]">Typing Indicator</h1>
    <p class="text-sm text-neutral-500">
      Open this page in two tabs. Start typing in one; the other should show a
      typing indicator below the textarea.
    </p>

    <textarea
      v-model="message"
      @keydown="inputProps.onKeydown"
      @blur="inputProps.onBlur"
      placeholder="Write a message..."
      rows="4"
      class="rounded border border-neutral-300 px-3 py-2 font-mono text-sm outline-none"
    />

    <div class="h-4 text-xs text-neutral-500">
      {{ active.length ? typingInfo(active) : '' }}
    </div>
  </div>
</template>
