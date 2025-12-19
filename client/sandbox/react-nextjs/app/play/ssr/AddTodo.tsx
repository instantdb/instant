'use client';

import { id } from '@instantdb/core';
import { db } from './db';
import { useState } from 'react';

export const AddTodo = () => {
  const [name, setName] = useState('');

  const add = () => {
    db.transact(
      db.tx.todos[id()].create({
        createdAt: new Date(),
        done: false,
        text: name,
      }),
    );
    setName('');
  };

  return (
    <div className="m-2 mb-4 border-2 border-gray-300 p-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a new todo..."
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="rounded-md bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          Add
        </button>
      </form>
    </div>
  );
};
