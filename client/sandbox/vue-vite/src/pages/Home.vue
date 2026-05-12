<script setup lang="ts">
import { RouterLink } from 'vue-router';

const routes = [
  { href: '/todos', label: 'todos' },
  { href: '/infinite-scroll', label: 'infinite-scroll' },
  { href: '/cursors', label: 'cursors' },
  { href: '/auth', label: 'auth' },
];
</script>

<template>
  <div class="p-8">
    <h1 class="text-2xl mb-3">Vue + Vite + Instant Sandbox</h1>
    <ul class="list-disc pl-6">
      <li v-for="route in routes" :key="route.href">
        <RouterLink class="underline text-blue-600" :to="route.href">
          {{ route.label }}
        </RouterLink>
      </li>
    </ul>
  </div>
</template>
