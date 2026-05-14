<script lang="ts">
  import { dbState, resetEphemeralApp } from '$lib/db.svelte';

  let clientId = $state(crypto.randomUUID());

  let writerStatus = $state<'idle' | 'open' | 'closed' | 'error'>('idle');
  let writerError = $state<string | null>(null);
  let writer = $state<WritableStreamDefaultWriter<string> | null>(null);
  let sentLines = $state<string[]>([]);
  let customInput = $state('');

  let readerClientId = $state(clientId);
  let readerStatus = $state<'idle' | 'reading' | 'done' | 'error'>('idle');
  let readerError = $state<string | null>(null);
  let reader = $state<ReadableStreamDefaultReader<string> | null>(null);
  let receivedLines = $state<string[]>([]);

  function regenerateClientId() {
    const next = crypto.randomUUID();
    clientId = next;
    readerClientId = next;
  }

  function createWriter(db: any) {
    writerError = null;
    sentLines = [];
    try {
      const stream = db.streams.createWriteStream({ clientId });
      writer = stream.getWriter();
      writerStatus = 'open';
    } catch (e) {
      writerError = (e as Error).message;
      writerStatus = 'error';
    }
  }

  async function writeChunk(chunk: string) {
    if (!writer) return;
    try {
      await writer.write(chunk + '\n');
      sentLines = [...sentLines, chunk];
    } catch (e) {
      writerError = (e as Error).message;
    }
  }

  async function closeWriter() {
    if (!writer) return;
    try {
      await writer.close();
      writer = null;
      writerStatus = 'closed';
    } catch (e) {
      writerError = (e as Error).message;
    }
  }

  async function startReading(db: any) {
    readerError = null;
    receivedLines = [];
    readerStatus = 'reading';
    try {
      const stream: ReadableStream<string> = db.streams.createReadStream({
        clientId: readerClientId,
      });
      const r = stream.getReader();
      reader = r;
      let buffer = '';
      while (true) {
        const { value, done } = await r.read();
        if (done) break;
        if (value !== undefined) {
          buffer += value;
          const parts = buffer.split('\n');
          buffer = parts.pop()!;
          const nonEmpty = parts.filter((p) => p.length > 0);
          if (nonEmpty.length > 0) {
            receivedLines = [...receivedLines, ...nonEmpty];
          }
        }
      }
      if (buffer) receivedLines = [...receivedLines, buffer];
      reader = null;
      readerStatus = 'done';
    } catch (e) {
      reader = null;
      readerStatus = 'error';
      readerError = (e as Error).message;
    }
  }

  async function cancelReader() {
    if (!reader) return;
    try {
      await reader.cancel('User cancelled');
      reader = null;
      readerStatus = 'done';
    } catch (e) {
      readerError = (e as Error).message;
    }
  }
</script>

{#if dbState.isLoading}
  <div class="p-8 flex justify-center">Creating ephemeral app...</div>
{:else if dbState.error}
  <div class="p-8 text-red-500">Error: {dbState.error}</div>
{:else}
  {@const db = dbState.db!}

  <div class="p-4 flex flex-col gap-4">
    <div class="flex items-center gap-2">
      <span class="text-sm">Client ID</span>
      <input
        class="flex-1 border border-gray-400 p-2 font-mono text-sm"
        bind:value={clientId}
        disabled={writerStatus === 'open'}
      />
      <button
        class="bg-black p-2 text-white"
        onclick={regenerateClientId}
        disabled={writerStatus === 'open'}
      >
        New ID
      </button>
      <button class="bg-black p-2 text-white" onclick={resetEphemeralApp}>
        Start over
      </button>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <div class="border border-gray-300 p-3 flex flex-col gap-2">
        <h2 class="text-lg font-bold">Writer</h2>
        <div class="text-sm">Status: {writerStatus}</div>
        {#if writerError}
          <div class="text-sm text-red-600">Error: {writerError}</div>
        {/if}

        {#if writerStatus !== 'open'}
          <button
            class="bg-blue-600 p-2 text-white w-fit"
            onclick={() => createWriter(db)}
          >
            Create stream
          </button>
        {:else}
          <div class="flex flex-wrap gap-2">
            <button
              class="bg-gray-700 p-2 text-white"
              onclick={() => writeChunk('Hello, world!')}
            >
              "Hello, world!"
            </button>
            <button
              class="bg-gray-700 p-2 text-white"
              onclick={() =>
                writeChunk(JSON.stringify({ event: 'ping', ts: Date.now() }))}
            >
              JSON ping
            </button>
          </div>
          <div class="flex gap-2">
            <input
              class="flex-1 border border-gray-400 p-2 text-sm"
              bind:value={customInput}
              placeholder="Type a custom string..."
              onkeydown={(e) => {
                if (e.key === 'Enter' && customInput) {
                  writeChunk(customInput);
                  customInput = '';
                }
              }}
            />
            <button
              class="bg-gray-700 p-2 text-white disabled:opacity-50"
              disabled={!customInput}
              onclick={() => {
                writeChunk(customInput);
                customInput = '';
              }}
            >
              Write
            </button>
          </div>
          <button class="bg-red-600 p-2 text-white w-fit" onclick={closeWriter}>
            Close
          </button>
        {/if}

        {#if sentLines.length > 0}
          <div class="text-sm font-medium mt-2">
            Sent ({sentLines.length}):
          </div>
          <div class="bg-gray-100 p-2 font-mono text-xs max-h-48 overflow-auto">
            {#each [...sentLines].reverse() as line, i (i)}
              <div>{line}</div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="border border-gray-300 p-3 flex flex-col gap-2">
        <h2 class="text-lg font-bold">Reader</h2>
        <label class="flex items-center gap-2 text-sm">
          Client ID
          <input
            class="flex-1 border border-gray-400 p-1 font-mono text-xs"
            bind:value={readerClientId}
            disabled={readerStatus === 'reading'}
          />
        </label>
        <div class="text-sm">Status: {readerStatus}</div>
        {#if readerError}
          <div class="text-sm text-red-600">Error: {readerError}</div>
        {/if}
        <div class="flex gap-2">
          <button
            class="bg-green-600 p-2 text-white disabled:opacity-50"
            disabled={readerStatus === 'reading'}
            onclick={() => startReading(db)}
          >
            Start reading
          </button>
          <button
            class="bg-red-600 p-2 text-white disabled:opacity-50"
            disabled={readerStatus !== 'reading'}
            onclick={cancelReader}
          >
            Cancel
          </button>
        </div>

        {#if receivedLines.length > 0}
          <div class="text-sm font-medium mt-2">
            Received ({receivedLines.length}):
          </div>
          <div class="bg-gray-100 p-2 font-mono text-xs max-h-48 overflow-auto">
            {#each [...receivedLines].reverse() as line, i (i)}
              <div>{line}</div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
