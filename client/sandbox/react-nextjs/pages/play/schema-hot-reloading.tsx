import React, { useEffect, useState } from 'react';
import { i, init, id } from '@instantdb/react';
import config from '../../config';

const schema = i.schema({
  entities: {
    posts: i.entity({
      title: i.string(),
      // -> change this to trigger hot reloading
      // body: i.string().optional(),
    }),
  },
});

const db = init({
  ...config,
  schema, // feel free to comment this out too
});

function PostsQuery() {
  const { data, isLoading, error } = db.useQuery({ posts: {} });

  const addPost = async () => {
    const postId = id();
    await db.transact(
      db.tx.posts[postId].update({ title: `Post ${Date.now()}` }),
    );
  };
  const deletePosts = async () => {
    const { posts } = data || {};
    if (!posts) return;
    await db.transact(posts.map((post) => db.tx.posts[post.id].delete()));
  };
  return (
    <div className="space-y-4">
      <ul className="space-y-1">
        <li>
          <span className="font-semibold">isLoading:</span>{' '}
          {isLoading ? 'true' : 'false'}
        </li>
        <li>
          <span className="font-semibold">error:</span>{' '}
          {error ? error.message : 'none'}
        </li>
        <li className="font-semibold">posts:</li>
        {data?.posts.map((p) => (
          <li key={p.id} className="ml-4 list-disc">
            {JSON.stringify(p)}
          </li>
        ))}
      </ul>
      <div className="space-x-2">
        <button onClick={addPost} className="text-white bg-black p-2">
          Add post
        </button>
        <button onClick={deletePosts} className="text-white bg-black p-2">
          Delete posts
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [currSchema, setSchema] = useState(db._core._reactor.config.schema);

  useEffect(() => {
    const t = setInterval(
      () => setSchema(db._core._reactor.config.schema),
      1000,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <div className="font-sans p-6 space-y-8">
      <h1 className="text-2xl font-bold">InstantDB Hot-Reload Playground</h1>

      {/* Two-column layout */}
      <div className="md:grid md:grid-cols-2 gap-10 space-y-8 md:space-y-0">
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Test 1: Changing schema</h2>
          <pre className="bg-gray-100 rounded p-3 text-sm overflow-auto max-h-64">
            {JSON.stringify(currSchema, null, 2)}
          </pre>
          <p>
            Edit the schema object at the top of this file and save.
            Fast-Refresh should update the JSON above without a full reload.
          </p>
        </section>

        {/* ──────────  Query & mutation demo  ────────── */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Test 2: Live query</h2>
          <PostsQuery />
          <p>
            Click “Add post”, then tweak the schema again and add another post.
            The same&nbsp;
            <code>&lt;PostsQuery&gt;</code> instance keeps receiving updates.
          </p>
        </section>
      </div>
    </div>
  );
}
