<script setup lang="ts">
import { computed, ref } from 'vue';
import { id, type InstaQLEntity } from '@instantdb/vue';
import type { AppSchema, DB } from '../lib/db';

type Todo = InstaQLEntity<AppSchema, 'todos'>;

const props = defineProps<{ db: DB }>();

const text = ref('');

const { isLoading, error, data } = props.db.useQuery({ todos: {} });
const todos = computed(() => data.value?.todos ?? []);
const remaining = computed(() => todos.value.filter((t) => !t.done).length);

function addTodo() {
  const value = text.value.trim();
  if (!value) return;
  props.db.transact(
    props.db.tx.todos[id()].update({
      text: value,
      done: false,
      createdAt: Date.now(),
    }),
  );
  text.value = '';
}

function toggleDone(todo: Todo) {
  props.db.transact(props.db.tx.todos[todo.id].update({ done: !todo.done }));
}

function deleteTodo(todo: Todo) {
  props.db.transact(props.db.tx.todos[todo.id].delete());
}

function deleteCompleted() {
  const completed = todos.value.filter((t) => t.done);
  if (!completed.length) return;
  props.db.transact(completed.map((t) => props.db.tx.todos[t.id].delete()));
}
</script>

<template>
  <div class="p-8 grid grid-cols-2 items-start gap-2">
    <div
      class="bg-white p-6 rounded-lg border border-neutral-200 shadow flex flex-col gap-2"
    >
      <h2 class="tracking-wide text-[#F54A00] text-2xl text-center">
        Vue + Vite + Instant DB
      </h2>
    </div>

    <div
      class="bg-white rounded-lg p-6 border border-neutral-200 shadow flex flex-col"
    >
      <h2 class="tracking-wide text-[#F54A00] text-2xl">Todos</h2>
      <div class="text-xs pb-4">
        Open another tab to see todos update in realtime!
      </div>

      <div v-if="isLoading">Loading...</div>
      <div v-else-if="error" class="text-red-500">
        Error: {{ error.message }}
      </div>
      <div v-else class="border rounded border-neutral-300">
        <form
          class="flex items-center h-10 border-neutral-300"
          @submit.prevent="addTodo"
        >
          <input
            v-model="text"
            class="w-full h-full placeholder-neutral-300 px-2 outline-none bg-transparent"
            placeholder="What needs to be done?"
            type="text"
          />
        </form>

        <div class="divide-y divide-neutral-300">
          <div
            v-for="todo in todos"
            :key="todo.id"
            class="flex items-center h-10"
          >
            <div class="h-full px-2 flex items-center justify-center">
              <input
                type="checkbox"
                class="cursor-pointer w-5 h-5"
                :checked="todo.done"
                @change="toggleDone(todo)"
              />
            </div>
            <div class="flex-1 px-2 overflow-hidden flex items-center">
              <span :class="{ 'line-through': todo.done }">{{ todo.text }}</span>
            </div>
            <button
              class="h-full px-2 text-neutral-300 hover:text-neutral-500"
              @click="deleteTodo(todo)"
            >
              X
            </button>
          </div>
        </div>

        <div
          class="flex justify-between items-center h-10 px-2 text-xs border-t border-neutral-300"
        >
          <div>Remaining todos: {{ remaining }}</div>
          <button
            class="text-neutral-300 hover:text-neutral-500"
            @click="deleteCompleted"
          >
            Delete Completed
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
