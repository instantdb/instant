<script lang="ts">
  import { id, type InstaQLEntity } from '@instantdb/svelte';
  import { dbState, type AppSchema } from '$lib/db.svelte';

  type Todo = InstaQLEntity<AppSchema, 'todos'>;

  let text = $state('');
</script>

{#if dbState.isLoading}
  <div class="p-8 flex justify-center">Creating ephemeral app...</div>
{:else if dbState.error}
  <div class="p-8 text-red-500">Error: {dbState.error}</div>
{:else}
  {@const db = dbState.db!}
  {@const state = db.useQuery({ todos: {} })}
  <div class="p-8 grid grid-cols-2 items-start gap-2">
    {@render welcome()}
    {@render todoApp(db, state)}
  </div>
{/if}

{#snippet welcome()}
  <div class="bg-white p-6 rounded-lg border border-neutral-200 shadow flex justify-center flex-col gap-2">
    <h2 class="tracking-wide text-[#F54A00] text-2xl text-center">
      SvelteKit + Instant DB
    </h2>
    <div class="grid grid-cols-1 md:grid-cols-2 grow gap-2">
      <a
        href="https://svelte.dev/docs/svelte"
        target="_blank"
        rel="noopener noreferrer"
        class="border hover:bg-neutral-100 py-8 shadow flex flex-col gap-2 items-center justify-center font-semibold border-neutral-200 rounded"
      >
        <img src="https://svelte.dev/svelte-logo.svg" width={34} alt="Svelte logo" />
        Svelte Docs
      </a>
      <a
        target="_blank"
        href="https://www.instantdb.com/docs"
        rel="noopener noreferrer"
        class="border shadow flex flex-col py-8 gap-2 hover:bg-neutral-100 items-center justify-center font-semibold border-neutral-200 rounded"
      >
        <img src="https://www.instantdb.com/img/icon/logo-512.svg" width={34} alt="InstantDB logo" />
        Instant Docs
      </a>
    </div>
  </div>
{/snippet}

{#snippet todoApp(db: any, state: any)}
  <div class="bg-white rounded-lg p-6 border border-neutral-200 shadow flex flex-col">
    <h2 class="tracking-wide text-[#F54A00] text-2xl">Todos</h2>
    <div class="text-xs pb-4">
      Open another tab to see todos update in realtime!
    </div>
    {#if state.isLoading}
      <div>Loading...</div>
    {:else if state.error}
      <div class="text-red-500">Error: {state.error.message}</div>
    {:else}
      {@const todos = state.data?.todos ?? []}
      <div class="border rounded border-neutral-300">
        {@render todoForm(db)}
        {@render todoList(db, todos)}
        {@render actionBar(db, todos)}
      </div>
    {/if}
  </div>
{/snippet}

{#snippet todoForm(db: any)}
  <div class="flex items-center h-10 border-neutral-300">
    <form
      class="flex-1 h-full"
      onsubmit={(e) => {
        e.preventDefault();
        if (!text) return;
        db.transact(db.tx.todos[id()].update({ text, done: false, createdAt: Date.now() }));
        text = '';
      }}
    >
      <input
        bind:value={text}
        class="w-full h-full placeholder-neutral-300 px-2 outline-none bg-transparent"
        autofocus
        placeholder="What needs to be done?"
        type="text"
      />
    </form>
  </div>
{/snippet}

{#snippet todoList(db: any, todos: Todo[])}
  <div class="divide-y divide-neutral-300">
    {#each todos as todo (todo.id)}
      <div class="flex items-center h-10">
        <div class="h-full px-2 flex items-center justify-center">
          <div class="w-5 h-5 flex items-center justify-center">
            <input
              type="checkbox"
              class="cursor-pointer"
              checked={todo.done}
              onchange={() => db.transact(db.tx.todos[todo.id].update({ done: !todo.done }))}
            />
          </div>
        </div>
        <div class="flex-1 px-2 overflow-hidden flex items-center">
          <span class:line-through={todo.done}>{todo.text}</span>
        </div>
        <button
          class="h-full px-2 flex items-center justify-center text-neutral-300 hover:text-neutral-500"
          onclick={() => db.transact(db.tx.todos[todo.id].delete())}
        >
          X
        </button>
      </div>
    {/each}
  </div>
{/snippet}

{#snippet actionBar(db: any, todos: Todo[])}
  <div class="flex justify-between items-center h-10 px-2 text-xs border-t border-neutral-300">
    <div>
      Remaining todos: {todos.filter((t: Todo) => !t.done).length}
    </div>
    <button
      class="text-neutral-300 hover:text-neutral-500"
      onclick={() => {
        const completed = todos.filter((t: Todo) => t.done);
        if (completed.length) db.transact(completed.map((t: Todo) => db.tx.todos[t.id].delete()));
      }}
    >
      Delete Completed
    </button>
  </div>
{/snippet}
