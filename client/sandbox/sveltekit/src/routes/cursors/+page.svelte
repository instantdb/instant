<script lang="ts">
  import { Cursors } from '@instantdb/svelte';
  import { dbState } from '$lib/db.svelte';
</script>

{#if dbState.isLoading}
  <div class="p-8 flex justify-center">Creating ephemeral app...</div>
{:else if dbState.error}
  <div class="p-8 text-red-500">Error: {dbState.error}</div>
{:else}
  {@const db = dbState.db!}
  {@const room = db.room('main' as any, 'cursors-demo')}

  <Cursors {room} className="min-h-screen">
    <div class="p-8 flex flex-col gap-4">
      <h1 class="text-2xl text-[#F54A00] tracking-wide">Cursors Test</h1>
      <p class="text-neutral-500">
        Open this page in multiple tabs to see cursors from other users.
        Move your mouse around to broadcast your cursor position.
      </p>
      <div class="grid grid-cols-3 gap-4">
        {#each Array(6) as _, i}
          <div class="bg-white rounded-lg p-8 border border-neutral-200 shadow flex items-center justify-center text-neutral-400">
            Box {i + 1}
          </div>
        {/each}
      </div>
    </div>
  </Cursors>
{/if}
