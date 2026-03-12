<script lang="ts">
  import { id, type InstaQLEntity } from '@instantdb/svelte';
  import { db } from '$lib/db';
  import type { AppSchema } from '../instant.schema';

  type Todo = InstaQLEntity<AppSchema, 'todos'>;

  const auth = db.useAuth();
  const state = db.useQuery({ todos: {} });

  let text = $state('');
  let email = $state('');
  let code = $state('');
  let sentEmail = $state('');

  function addTodo(todoText: string) {
    db.transact(
      db.tx.todos[id()].update({
        text: todoText,
        done: false,
        createdAt: Date.now(),
      }),
    );
  }

  function deleteTodo(todo: Todo) {
    db.transact(db.tx.todos[todo.id].delete());
  }

  function toggleDone(todo: Todo) {
    db.transact(db.tx.todos[todo.id].update({ done: !todo.done }));
  }

  function deleteCompleted(todos: Todo[]) {
    const completed = todos.filter((todo) => todo.done);
    if (completed.length === 0) return;
    const txs = completed.map((todo) => db.tx.todos[todo.id].delete());
    db.transact(txs);
  }

  function handleSendCode() {
    if (!email) return;
    sentEmail = email;
    db.auth.sendMagicCode({ email }).catch((err: any) => {
      alert('Error sending code: ' + err.body?.message);
      sentEmail = '';
    });
  }

  function handleVerifyCode() {
    if (!code || !sentEmail) return;
    db.auth.signInWithMagicCode({ email: sentEmail, code }).catch((err: any) => {
      alert('Error verifying code: ' + err.body?.message);
      code = '';
    });
  }
</script>

{#if auth.isLoading}
  <div class="p-8 flex justify-center">Loading...</div>
{:else if auth.user}
  <div class="p-8 grid grid-cols-2 items-start gap-2">
    {@render welcome()}
    {@render todoApp()}
  </div>
{:else}
  {@render login()}
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

{#snippet todoApp()}
  <div class="bg-white rounded-lg p-6 border border-neutral-200 shadow flex flex-col">
    <div class="flex justify-between items-center">
      <h2 class="tracking-wide text-[#F54A00] text-2xl">Todos</h2>
      <button
        class="text-xs text-neutral-400 hover:text-neutral-600"
        onclick={() => db.auth.signOut()}
      >
        Sign out
      </button>
    </div>
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
        {@render todoForm()}
        {@render todoList(todos)}
        {@render actionBar(todos)}
      </div>
    {/if}
  </div>
{/snippet}

{#snippet todoForm()}
  <div class="flex items-center h-10 border-neutral-300">
    <form
      class="flex-1 h-full"
      onsubmit={(e) => {
        e.preventDefault();
        if (!text) return;
        addTodo(text);
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

{#snippet todoList(todos: Todo[])}
  <div class="divide-y divide-neutral-300">
    {#each todos as todo (todo.id)}
      <div class="flex items-center h-10">
        <div class="h-full px-2 flex items-center justify-center">
          <div class="w-5 h-5 flex items-center justify-center">
            <input
              type="checkbox"
              class="cursor-pointer"
              checked={todo.done}
              onchange={() => toggleDone(todo)}
            />
          </div>
        </div>
        <div class="flex-1 px-2 overflow-hidden flex items-center">
          <span class:line-through={todo.done}>{todo.text}</span>
        </div>
        <button
          class="h-full px-2 flex items-center justify-center text-neutral-300 hover:text-neutral-500"
          onclick={() => deleteTodo(todo)}
        >
          X
        </button>
      </div>
    {/each}
  </div>
{/snippet}

{#snippet actionBar(todos: Todo[])}
  <div class="flex justify-between items-center h-10 px-2 text-xs border-t border-neutral-300">
    <div>
      Remaining todos: {todos.filter((t) => !t.done).length}
    </div>
    <button
      class="text-neutral-300 hover:text-neutral-500"
      onclick={() => deleteCompleted(todos)}
    >
      Delete Completed
    </button>
  </div>
{/snippet}

{#snippet login()}
  <div class="p-8 flex justify-center">
    <div class="bg-white rounded-lg p-6 border border-neutral-200 shadow max-w-sm w-full">
      <h2 class="tracking-wide text-[#F54A00] text-2xl mb-4">Sign in</h2>
      {#if !sentEmail}
        <form onsubmit={(e) => { e.preventDefault(); handleSendCode(); }}>
          <input
            bind:value={email}
            class="w-full border border-neutral-300 rounded px-3 py-2 mb-2 outline-none"
            placeholder="Enter your email"
            type="email"
          />
          <button
            type="submit"
            class="w-full bg-[#F54A00] text-white rounded px-3 py-2 hover:bg-[#d94300]"
          >
            Send Code
          </button>
        </form>
      {:else}
        <form onsubmit={(e) => { e.preventDefault(); handleVerifyCode(); }}>
          <p class="text-sm text-neutral-500 mb-2">
            We sent a code to {sentEmail}
          </p>
          <input
            bind:value={code}
            class="w-full border border-neutral-300 rounded px-3 py-2 mb-2 outline-none"
            placeholder="Enter code"
            type="text"
          />
          <button
            type="submit"
            class="w-full bg-[#F54A00] text-white rounded px-3 py-2 hover:bg-[#d94300]"
          >
            Verify Code
          </button>
          <button
            type="button"
            class="w-full text-sm text-neutral-400 hover:text-neutral-600 mt-2"
            onclick={() => { sentEmail = ''; code = ''; }}
          >
            Use a different email
          </button>
        </form>
      {/if}
    </div>
  </div>
{/snippet}
