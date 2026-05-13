<script setup lang="ts">
import { computed, ref } from 'vue';
import { id } from '@instantdb/vue';
import { resetEphemeralApp, type DB } from '../lib/db';

const props = defineProps<{ db: DB }>();

const pageSize = 4;
let writeQueue: Promise<unknown> = Promise.resolve();
const numberInput = ref('');

function enqueue(work: () => Promise<unknown>) {
  writeQueue = writeQueue.then(work, work);
}

const scrollResult = props.db.useInfiniteQuery({
  items: {
    $: { limit: pageSize, order: { value: 'asc' } },
  },
});
const allNumbersResult = props.db.useQuery({ items: {} });

const numberLineValues = computed(() =>
  [...(allNumbersResult.data.value?.items || [])].sort(
    (a, b) => a.value - b.value,
  ),
);
const loadedItems = computed(() => scrollResult.data.value?.items || []);

function addNumberItem(value: number) {
  enqueue(() =>
    props.db.transact([props.db.tx.items[id()].update({ value })]),
  );
}

function submitNumber() {
  const parsed = Number(numberInput.value);
  if (!Number.isFinite(parsed)) return;
  addNumberItem(parsed);
  numberInput.value = '';
}

function addNewLowest() {
  enqueue(async () => {
    const snapshot = await props.db.queryOnce({ items: {} });
    const existing = snapshot.data.items || [];
    const minValue = existing.reduce(
      (min, item) => Math.min(min, item.value),
      Number.POSITIVE_INFINITY,
    );
    const nextValue = Number.isFinite(minValue) ? minValue - 1 : -1;
    await props.db.transact([
      props.db.tx.items[id()].update({ value: nextValue }),
    ]);
  });
}

function addNewHighest() {
  enqueue(async () => {
    const snapshot = await props.db.queryOnce({ items: {} });
    const existing = snapshot.data.items || [];
    const maxValue = existing.reduce(
      (max, item) => Math.max(max, item.value),
      Number.NEGATIVE_INFINITY,
    );
    const nextValue = Number.isFinite(maxValue) ? maxValue + 1 : 1;
    await props.db.transact([
      props.db.tx.items[id()].update({ value: nextValue }),
    ]);
  });
}

async function deleteAll() {
  const snapshot = await props.db.queryOnce({ items: {} });
  const existing = snapshot.data.items || [];
  if (existing.length === 0) return;
  await props.db.transact(
    existing.map((item) => props.db.tx.items[item.id].delete()),
  );
}
</script>

<template>
  <div class="p-4">
    <div class="flex flex-wrap items-center gap-2">
      <input
        class="border border-gray-400 p-2"
        type="number"
        v-model="numberInput"
        @keydown.enter="submitNumber"
        placeholder="Type a number"
      />
      <button class="bg-black p-2 text-white" @click="submitNumber">
        Add number
      </button>
      <button class="bg-black p-2 text-white" @click="addNewLowest">
        Add new lowest
      </button>
      <button class="bg-black p-2 text-white" @click="addNumberItem(0)">
        Add zero
      </button>
      <button class="bg-black p-2 text-white" @click="addNewHighest">
        Add new highest
      </button>
      <button class="bg-black p-2 text-white" @click="deleteAll">
        Delete all
      </button>
      <button class="bg-black p-2 text-white" @click="resetEphemeralApp">
        Start over
      </button>
    </div>

    <button
      class="my-2 bg-black p-2 text-white disabled:opacity-50"
      :disabled="!scrollResult.canLoadNextPage.value"
      @click="scrollResult.loadNextPage()"
    >
      Load more
    </button>

    <div class="my-2 border border-gray-300 p-3">
      <h3 class="font-bold">Number line ({{ numberLineValues.length }})</h3>
      <div v-if="numberLineValues.length === 0" class="mt-2 text-sm">
        No numbers yet.
      </div>
      <div v-else class="mt-3 overflow-x-auto">
        <div class="min-w-max border-t-2 border-black px-4 pb-2">
          <div class="flex gap-6">
            <div
              v-for="item in numberLineValues"
              :key="item.id"
              class="-mt-4 flex flex-col items-center"
            >
              <div class="h-4 w-px bg-black"></div>
              <div class="mt-1 font-mono text-sm">{{ item.value }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="grid gap-2 md:grid-cols-2">
      <div class="border border-gray-300 bg-gray-100 p-3 text-xs">
        <h3 class="font-bold">Infinite Query Diagnostics</h3>
        <pre>canLoadNextPage: {{ String(scrollResult.canLoadNextPage.value) }}</pre>
        <pre>isLoading: {{ String(scrollResult.isLoading.value) }}</pre>
        <pre>loaded: {{ loadedItems.length }}</pre>
      </div>

      <div class="border border-gray-300 p-3">
        <h3 class="font-bold">Loaded items ({{ loadedItems.length }})</h3>
        <div v-if="loadedItems.length === 0">No items loaded yet.</div>
        <template v-else>
          <div
            v-for="item in loadedItems"
            :key="item.id"
            class="font-mono text-sm"
          >
            {{ item.value }}
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
