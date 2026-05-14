<script setup lang="ts">
import { ref } from 'vue';
import { SignedIn, SignedOut } from '@instantdb/vue';
import { db, isLoading, error } from '../lib/db';

const email = ref('');
const code = ref('');
const sentTo = ref('');

function sendCode() {
  if (!email.value || !db.value) return;
  const target = email.value;
  db.value.auth.sendMagicCode({ email: target }).then(() => {
    sentTo.value = target;
  });
}

function verifyCode() {
  if (!code.value || !sentTo.value || !db.value) return;
  db.value.auth
    .signInWithMagicCode({ email: sentTo.value, code: code.value })
    .catch(() => {
      code.value = '';
    });
}
</script>

<template>
  <div v-if="isLoading" class="p-8 flex justify-center">
    Creating ephemeral app...
  </div>
  <div v-else-if="error" class="p-8 text-red-500">Error: {{ error }}</div>
  <div v-else-if="db" class="p-8 max-w-md mx-auto flex flex-col gap-4">
    <h1 class="text-2xl text-[#F54A00] tracking-wide">Auth Components Test</h1>

    <SignedOut :db="db">
      <div
        class="bg-white rounded-lg p-6 border border-neutral-200 shadow flex flex-col gap-4"
      >
        <h2 class="text-lg font-semibold">Signed Out</h2>
        <p class="text-sm text-neutral-500">
          This content is rendered by the SignedOut component.
        </p>
        <form v-if="!sentTo" class="flex flex-col gap-2" @submit.prevent="sendCode">
          <input
            v-model="email"
            type="email"
            placeholder="Enter your email"
            class="border border-neutral-300 rounded px-3 py-2 outline-none"
          />
          <button
            type="submit"
            class="bg-[#F54A00] text-white rounded px-3 py-2"
          >
            Send Magic Code
          </button>
        </form>
        <form v-else class="flex flex-col gap-2" @submit.prevent="verifyCode">
          <p class="text-sm">Code sent to {{ sentTo }}</p>
          <input
            v-model="code"
            type="text"
            placeholder="Enter code"
            class="border border-neutral-300 rounded px-3 py-2 outline-none"
          />
          <button
            type="submit"
            class="bg-[#F54A00] text-white rounded px-3 py-2"
          >
            Verify Code
          </button>
        </form>
      </div>
    </SignedOut>

    <SignedIn :db="db">
      <div
        class="bg-white rounded-lg p-6 border border-neutral-200 shadow flex flex-col gap-4"
      >
        <h2 class="text-lg font-semibold">Signed In</h2>
        <p class="text-sm text-neutral-500">
          This content is rendered by the SignedIn component.
        </p>
        <button
          class="bg-neutral-200 rounded px-3 py-2 hover:bg-neutral-300"
          @click="db.auth.signOut()"
        >
          Sign Out
        </button>
      </div>
    </SignedIn>
  </div>
</template>
