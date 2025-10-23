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
    <div className="border-2 border-gray-300 m-2 p-2 mb-4">
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
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </form>
    </div>
  );
};
