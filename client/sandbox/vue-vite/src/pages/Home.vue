<script setup lang="ts">
import { RouterLink } from 'vue-router';

const routes = [
  { href: '/todos', label: 'todos' },
  { href: '/infinite-scroll', label: 'infinite-scroll' },
  { href: '/cursors', label: 'cursors' },
  { href: '/typing', label: 'typing' },
  { href: '/auth', label: 'auth' },
];
</script>

<template>
  <div class="p-8">
    <h1 class="mb-3 text-2xl">Vue + Vite + Instant Sandbox</h1>
    <p class="mb-3 text-sm text-neutral-500">
      The ephemeral app id is stored in this tab's URL
      (<code>?app=&lt;id&gt;</code>). Copy the URL into another tab or window to
      share the same Instant app — for example, to test cursors or typing
      indicators with two peers.
    </p>
    <ul class="list-disc pl-6">
      <li v-for="route in routes" :key="route.href">
        <RouterLink class="text-blue-600 underline" :to="route.href">
          {{ route.label }}
        </RouterLink>
      </li>
    </ul>
  </div>
</template>
