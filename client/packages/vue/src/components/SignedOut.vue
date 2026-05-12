<script setup lang="ts">
import type { InstantSchemaDef } from '@instantdb/core';
import type { InstantVueDatabase } from '../InstantVueDatabase.js';

const props = defineProps<{
  db: InstantVueDatabase<InstantSchemaDef<any, any, any>, boolean>;
}>();

const { isLoading, error, user } = props.db.useAuth();
</script>

<template>
  <slot v-if="!isLoading && !error && !user" />
</template>
