<script lang="ts">
  import type { InstantSchemaDef } from '@instantdb/core';
  import type { InstantSvelteDatabase } from './InstantSvelteDatabase.svelte.js';
  import type { Snippet } from 'svelte';

  let { db, children }: {
    db: InstantSvelteDatabase<InstantSchemaDef<any, any, any>>;
    children: Snippet;
  } = $props();

  const auth = db.useAuth();
</script>

{#if !auth.isLoading && !auth.user}
  {@render children()}
{/if}
