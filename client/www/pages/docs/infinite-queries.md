---
title: Infinite Queries
description: How to subscribe to large amounts of data incrementally
---

It is a common pattern to show users a long list of items that gets larger as they interact. Instant supports this pattern with the `useInfiniteQuery` hook.

The useInfiniteQuery hook is designed to work just like the useQuery hook. You make the same kind of queries and it returns the same kind of data. But now you get a canLoadNextPage variable, and a loadNextPage function to load more items.

## Example

This example demonstrates a typical social media feed where the newest posts are at the top.

```ts
import { init } from '@instantdb/react';
import { db } from "../db"
import { Post } from "../components/Post"

function HomePage() {
  const { data, canLoadNextPage, loadNextPage, isLoading, error } =
    db.useInfiniteQuery({
      posts: {
        $: {
          limit: 50, // Load 50 posts at a time
          order: {
            createdAt: 'desc',
          },
        },
      },
    });

  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <div>
      {data.posts.map((post) => (
        <Post key={post.id} post={post} />
      ))}
      {canLoadNextPage && (
        <button onClick={loadNextPage}>Load More</button>
      )}
    </div>
  );
}
```

Any new posts that get created will automatically appear at the top, and as the user scrolls, the `loadNextPage` can load older posts as needed.

## Reactivity

Just like `useQuery`, all data returned is fully reactive. Updating and deleting items will react immediately. New items added to the "start" of the query will show up automatically as well as items anywhere in the middle. Items that _would_ be ordered at the very end of the results will show up if the limit for that page has not yet been reached.

For example, with `{todos: {$: {limit: 20, order: createdAt: "asc"}}}` (showing oldest todos first)

If there are already 19 todos in the database, an additional todo getting created will show up in the result automatically, and the next todo after that will set "canLoadNextPage" to true, requiring the `loadNextPage` function to be called.
When the new page is added, any newly created todos will show up at the end automatically until 40 total todos are shown.

Changing any part of the query will result in a full reset of all data, returning back to a state with only one page loaded.

## Vanilla JS

The `@instantdb/core` library also supports making infinite queries with the same syntax as `db.subscribeQuery()`.

Example:

```ts
const { unsubscribe, loadNextPage } = db.subscribeInfiniteQuery(
  {
    posts: {
      $: {
        limit: 20, // Load 20 posts at a time
        order: {
          createdAt: 'desc',
        },
      },
    },
  },
  (resp) => {
    console.log('Posts: ', resp.data.posts);
    console.log('Can Load More ?', resp.canLoadNextPage);
  },
);
```
