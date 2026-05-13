<script setup lang="ts">
import { computed, ref } from "vue";
import { id, type InstaQLEntity } from "@instantdb/vue";
import { db } from "./lib/db";
import type { AppSchema } from "./instant.schema";

type Todo = InstaQLEntity<AppSchema, "todos">;

const { isLoading: authLoading, user } = db.useAuth();
const { isLoading: queryLoading, error, data } = db.useQuery({ todos: {} });

const todos = computed(() => data.value?.todos ?? []);
const remaining = computed(() => todos.value.filter((t) => !t.done).length);

const text = ref("");
const email = ref("");
const code = ref("");
const sentEmail = ref("");

function addTodo() {
  const value = text.value.trim();
  if (!value) return;
  db.transact(
    db.tx.todos[id()].update({
      text: value,
      done: false,
      createdAt: Date.now(),
    }),
  );
  text.value = "";
}

function toggleDone(todo: Todo) {
  db.transact(db.tx.todos[todo.id].update({ done: !todo.done }));
}

function deleteTodo(todo: Todo) {
  db.transact(db.tx.todos[todo.id].delete());
}

function deleteCompleted() {
  const completed = todos.value.filter((t) => t.done);
  if (!completed.length) return;
  db.transact(completed.map((t) => db.tx.todos[t.id].delete()));
}

function sendCode() {
  if (!email.value) return;
  const target = email.value;
  db.auth
    .sendMagicCode({ email: target })
    .then(() => {
      sentEmail.value = target;
    })
    .catch((err: any) => {
      alert("Error sending code: " + (err.body?.message ?? err.message));
    });
}

function verifyCode() {
  if (!code.value || !sentEmail.value) return;
  db.auth
    .signInWithMagicCode({ email: sentEmail.value, code: code.value })
    .catch((err: any) => {
      alert("Error verifying code: " + (err.body?.message ?? err.message));
      code.value = "";
    });
}

function resetEmail() {
  sentEmail.value = "";
  code.value = "";
}
</script>

<template>
  <div v-if="authLoading" class="p-8 flex justify-center">Loading...</div>

  <div v-else-if="user" class="p-8 grid grid-cols-2 items-start gap-2">
    <div
      class="bg-white p-6 rounded-lg border border-neutral-200 shadow flex justify-center flex-col gap-2"
    >
      <h2 class="tracking-wide text-[#F54A00] text-2xl text-center">
        Vue + Vite + Instant DB
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 grow gap-2">
        <a
          href="https://vuejs.org/guide/introduction.html"
          target="_blank"
          rel="noopener noreferrer"
          class="border hover:bg-neutral-100 py-8 shadow flex flex-col gap-2 items-center justify-center font-semibold border-neutral-200 rounded"
        >
          <img
            src="https://vuejs.org/images/logo.png"
            width="34"
            alt="Vue logo"
          />
          Vue Docs
        </a>
        <a
          href="https://www.instantdb.com/docs"
          target="_blank"
          rel="noopener noreferrer"
          class="border shadow flex flex-col py-8 gap-2 hover:bg-neutral-100 items-center justify-center font-semibold border-neutral-200 rounded"
        >
          <img
            src="https://www.instantdb.com/img/icon/logo-512.svg"
            width="34"
            alt="Instant logo"
          />
          Instant Docs
        </a>
      </div>
    </div>

    <div
      class="bg-white rounded-lg p-6 border border-neutral-200 shadow flex flex-col"
    >
      <div class="flex justify-between items-center">
        <h2 class="tracking-wide text-[#F54A00] text-2xl">Todos</h2>
        <button
          class="text-xs text-neutral-400 hover:text-neutral-600"
          @click="db.auth.signOut()"
        >
          Sign out
        </button>
      </div>
      <div class="text-xs pb-4">
        Open another tab to see todos update in realtime!
      </div>

      <div v-if="queryLoading">Loading...</div>
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
              class="h-full px-2 flex items-center justify-center text-neutral-300 hover:text-neutral-500"
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

  <div v-else class="p-8 flex justify-center">
    <div
      class="bg-white rounded-lg p-6 border border-neutral-200 shadow max-w-sm w-full"
    >
      <h2 class="tracking-wide text-[#F54A00] text-2xl mb-4">Sign in</h2>

      <form
        v-if="!sentEmail"
        @submit.prevent="sendCode"
        class="flex flex-col gap-2"
      >
        <input
          v-model="email"
          type="email"
          placeholder="Enter your email"
          class="border border-neutral-300 rounded px-3 py-2 outline-none"
        />
        <button
          type="submit"
          class="bg-[#F54A00] text-white rounded px-3 py-2 hover:bg-[#d94300]"
        >
          Send Code
        </button>
      </form>

      <form
        v-else
        @submit.prevent="verifyCode"
        class="flex flex-col gap-2"
      >
        <p class="text-sm text-neutral-500">We sent a code to {{ sentEmail }}</p>
        <input
          v-model="code"
          type="text"
          placeholder="Enter code"
          class="border border-neutral-300 rounded px-3 py-2 outline-none"
        />
        <button
          type="submit"
          class="bg-[#F54A00] text-white rounded px-3 py-2 hover:bg-[#d94300]"
        >
          Verify Code
        </button>
        <button
          type="button"
          class="text-sm text-neutral-400 hover:text-neutral-600"
          @click="resetEmail"
        >
          Use a different email
        </button>
      </form>
    </div>
  </div>
</template>
