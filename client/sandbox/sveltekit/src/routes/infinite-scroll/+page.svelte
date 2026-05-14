<script lang="ts">
  import { id, tx } from '@instantdb/svelte';
  import { dbState, resetEphemeralApp } from '$lib/db.svelte';

  const pageSize = 4;
  let writeQueue: Promise<unknown> = Promise.resolve();
  let numberInput = $state('');

  function enqueue(work: () => Promise<unknown>) {
    writeQueue = writeQueue.then(work, work);
  }

  function addNumberItem(db: any, value: number) {
    enqueue(() => db.transact([tx.items[id()].update({ value })]));
  }

  function submitNumber(db: any) {
    const parsed = Number(numberInput);
    if (!Number.isFinite(parsed)) return;
    addNumberItem(db, parsed);
    numberInput = '';
  }

  function addNewLowest(db: any) {
    enqueue(async () => {
      const snapshot = await db.queryOnce({ items: {} });
      const existing = snapshot.data.items || [];
      const minValue = existing.reduce(
        (min: number, item: { value: number }) => Math.min(min, item.value),
        Number.POSITIVE_INFINITY,
      );
      const nextValue = Number.isFinite(minValue) ? minValue - 1 : -1;
      await db.transact([tx.items[id()].update({ value: nextValue })]);
    });
  }

  function addZero(db: any) {
    addNumberItem(db, 0);
  }

  function addNewHighest(db: any) {
    enqueue(async () => {
      const snapshot = await db.queryOnce({ items: {} });
      const existing = snapshot.data.items || [];
      const maxValue = existing.reduce(
        (max: number, item: { value: number }) => Math.max(max, item.value),
        Number.NEGATIVE_INFINITY,
      );
      const nextValue = Number.isFinite(maxValue) ? maxValue + 1 : 1;
      await db.transact([tx.items[id()].update({ value: nextValue })]);
    });
  }

  async function deleteAll(db: any) {
    const snapshot = await db.queryOnce({ items: {} });
    const existing = snapshot.data.items || [];
    if (existing.length === 0) return;
    await db.transact(
      existing.map((item: { id: string }) => tx.items[item.id].delete()),
    );
  }
</script>

{#if dbState.isLoading}
  <div class="p-8 flex justify-center">Creating ephemeral app...</div>
{:else if dbState.error}
  <div class="p-8 text-red-500">Error: {dbState.error}</div>
{:else}
  {@const db = dbState.db!}
  {@const scrollResult = db.useInfiniteQuery({
    items: {
      $: { limit: pageSize, order: { value: 'asc' } },
    },
  })}
  {@const allNumbersResult = db.useQuery({ items: {} })}
  {@const numberLineValues = [...(allNumbersResult.data?.items || [])].sort(
    (a, b) => a.value - b.value,
  )}
  {@const loadedValues = (scrollResult.data?.items || []).map((i) => i.value)}

  <div class="p-4">
    <div class="flex flex-wrap items-center gap-2">
      <input
        class="border border-gray-400 p-2"
        type="number"
        bind:value={numberInput}
        onkeydown={(e) => {
          if (e.key === 'Enter') submitNumber(db);
        }}
        placeholder="Type a number"
      />
      <button class="bg-black p-2 text-white" onclick={() => submitNumber(db)}>
        Add number
      </button>
      <button class="bg-black p-2 text-white" onclick={() => addNewLowest(db)}>
        Add new lowest
      </button>
      <button class="bg-black p-2 text-white" onclick={() => addZero(db)}>
        Add zero
      </button>
      <button class="bg-black p-2 text-white" onclick={() => addNewHighest(db)}>
        Add new highest
      </button>
      <button class="bg-black p-2 text-white" onclick={() => deleteAll(db)}>
        Delete all
      </button>
      <button class="bg-black p-2 text-white" onclick={resetEphemeralApp}>
        Start over
      </button>
    </div>

    <button
      class="my-2 bg-black p-2 text-white disabled:opacity-50"
      disabled={!scrollResult.canLoadNextPage}
      onclick={() => scrollResult.loadNextPage()}
    >
      Load more
    </button>

    <div class="my-2 border border-gray-300 p-3">
      <h3 class="font-bold">Number line ({numberLineValues.length})</h3>
      {#if numberLineValues.length === 0}
        <div class="mt-2 text-sm">No numbers yet.</div>
      {:else}
        <div class="mt-3 overflow-x-auto">
          <div class="min-w-max border-t-2 border-black px-4 pb-2">
            <div class="flex gap-6">
              {#each numberLineValues as item (item.id)}
                <div class="-mt-4 flex flex-col items-center">
                  <div class="h-4 w-px bg-black"></div>
                  <div class="mt-1 font-mono text-sm">{item.value}</div>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    </div>

    <div class="grid gap-2 md:grid-cols-2">
      <div class="border border-gray-300 bg-gray-100 p-3 text-xs">
        <h3 class="font-bold">Infinite Query Diagnostics</h3>
        <pre>canLoadNextPage: {String(scrollResult.canLoadNextPage)}</pre>
        <pre>isLoading: {String(scrollResult.isLoading)}</pre>
        <pre>loaded: {loadedValues.length}</pre>
      </div>

      <div class="border border-gray-300 p-3">
        <h3 class="font-bold">Loaded items ({loadedValues.length})</h3>
        {#if loadedValues.length === 0}
          <div>No items loaded yet.</div>
        {:else}
          {#each scrollResult.data?.items || [] as item (item.id)}
            <div class="font-mono text-sm">{item.value}</div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}
