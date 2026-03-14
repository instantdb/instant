<script lang="ts">
  import { SignedIn, SignedOut } from '@instantdb/svelte';
  import { dbState } from '$lib/db.svelte';

  let email = $state('');
  let code = $state('');
  let sentTo = $state('');
</script>

{#if dbState.isLoading}
  <div class="p-8 flex justify-center">Creating ephemeral app...</div>
{:else if dbState.error}
  <div class="p-8 text-red-500">Error: {dbState.error}</div>
{:else}
  {@const db = dbState.db!}
  <div class="p-8 max-w-md mx-auto flex flex-col gap-4">
    <h1 class="text-2xl text-[#F54A00] tracking-wide">Auth Components Test</h1>

    <SignedOut {db}>
      <div class="bg-white rounded-lg p-6 border border-neutral-200 shadow flex flex-col gap-4">
        <h2 class="text-lg font-semibold">Signed Out</h2>
        <p class="text-sm text-neutral-500">
          This content is rendered by the SignedOut component.
        </p>
        {#if !sentTo}
          <form
            class="flex flex-col gap-2"
            onsubmit={(e) => {
              e.preventDefault();
              if (!email) return;
              db.auth.sendMagicCode({ email }).then(() => { sentTo = email; });
            }}
          >
            <input
              bind:value={email}
              type="email"
              placeholder="Enter your email"
              class="border border-neutral-300 rounded px-3 py-2 outline-none"
            />
            <button type="submit" class="bg-[#F54A00] text-white rounded px-3 py-2">
              Send Magic Code
            </button>
          </form>
        {:else}
          <form
            class="flex flex-col gap-2"
            onsubmit={(e) => {
              e.preventDefault();
              if (!code) return;
              db.auth.signInWithMagicCode({ email: sentTo, code }).catch(() => {
                code = '';
              });
            }}
          >
            <p class="text-sm">Code sent to {sentTo}</p>
            <input
              bind:value={code}
              type="text"
              placeholder="Enter code"
              class="border border-neutral-300 rounded px-3 py-2 outline-none"
            />
            <button type="submit" class="bg-[#F54A00] text-white rounded px-3 py-2">
              Verify Code
            </button>
          </form>
        {/if}
      </div>
    </SignedOut>

    <SignedIn {db}>
      <div class="bg-white rounded-lg p-6 border border-neutral-200 shadow flex flex-col gap-4">
        <h2 class="text-lg font-semibold">Signed In</h2>
        <p class="text-sm text-neutral-500">
          This content is rendered by the SignedIn component.
        </p>
        <button
          class="bg-neutral-200 rounded px-3 py-2 hover:bg-neutral-300"
          onclick={() => db.auth.signOut()}
        >
          Sign Out
        </button>
      </div>
    </SignedIn>
  </div>
{/if}
