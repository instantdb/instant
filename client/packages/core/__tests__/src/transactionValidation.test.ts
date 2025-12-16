import { i } from '../../src/schema';
import { validateTransactions } from '../../src/transactionValidation.ts';
import { lookup, tx as originalTx, TxChunk } from '../../src/instatx.ts';
import id from '../../src/utils/id.ts';
import { expect, test } from 'vitest';
import { InstantSchemaDef } from '../../src';

const testSchema = i.schema({
  entities: {
    users: i.entity({
      name: i.string(),
      email: i.string().indexed().unique(),
      bio: i.string().optional(),
      stuff: i.json<{ custom: string }>().optional(),
      junk: i.any().optional(),
    }),
    posts: i.entity({
      title: i.string(),
      body: i.string(),
    }),
    comments: i.entity({
      body: i.string(),
    }),
    unlinkedWithAnything: i.entity({
      animal: i.string(),
      count: i.string(),
    }),
  },
  links: {
    usersPosts: {
      forward: {
        on: 'users',
        has: 'many',
        label: 'posts',
      },
      reverse: {
        on: 'posts',
        has: 'one',
        label: 'author',
      },
    },
    postsComments: {
      forward: {
        on: 'posts',
        has: 'many',
        label: 'comments',
      },
      reverse: {
        on: 'comments',
        has: 'one',
        label: 'post',
      },
    },
    friendships: {
      forward: {
        on: 'users',
        has: 'many',
        label: 'friends',
      },
      reverse: {
        on: 'users',
        has: 'many',
        label: '_friends',
      },
    },
  },
});

const beValid = (
  chunk: any,
  schema: InstantSchemaDef<any, any, any> | null = testSchema,
) => {
  expect(() => validateTransactions(chunk, schema ?? undefined)).not.toThrow();
  if (schema) {
    expect(() => validateTransactions(chunk, undefined)).not.toThrow();
  }
};

const beWrong = (
  chunk: any,
  schema: InstantSchemaDef<any, any, any> | null = testSchema,
) => {
  expect(() => validateTransactions(chunk, schema ?? undefined)).toThrow();
};

const tx = originalTx as unknown as TxChunk<typeof testSchema>;

test('validates basic transaction chunk', () => {
  const userId = id();
  const validChunk = tx.users[userId].create({
    name: 'John',
    email: 'john@example.com',
  });

  beValid(validChunk);
});

test('validates transaction chunk arrays', () => {
  const userId = id();
  const postId = id();
  const chunks = [
    tx.users[userId].create({ name: 'John', email: 'john@example.com' }),
    tx.posts[postId].create({ title: 'Hello', body: 'World' }),
  ];

  beValid(chunks);
});

test('validates create operations', () => {
  const userId = id();

  // Valid create
  beValid(tx.users[userId].create({ name: 'John', email: 'john@example.com' }));

  // Valid create with optional field
  beValid(
    tx.users[userId].create({
      name: 'John',
      email: 'john@example.com',
      bio: 'Developer',
    }),
  );

  // Valid create with any type
  beValid(
    tx.users[userId].create({
      name: 'John',
      email: 'john@example.com',
      junk: { anything: 'goes' },
    }),
  );

  // Invalid create - wrong type
  // @ts-expect-error
  beWrong(tx.users[userId].create({ name: 123, email: 'john@example.com' }));

  // Valid create - creates unknown attributes
  beValid(
    tx.users[userId].create({
      name: 'John',
      email: 'john@example.com',
      // @ts-expect-error
      unknownField: 'value',
    }),
  );

  // Invalid create - non-object args
  beWrong({
    __ops: [['create', 'users', userId, 'not an object']],
    __etype: 'users',
  });
});

test('validates update operations', () => {
  const userId = id();

  // Valid update
  beValid(tx.users[userId].update({ name: 'Jane' }));

  // Valid update with multiple fields
  beValid(tx.users[userId].update({ name: 'Jane', bio: 'Updated bio' }));

  // Invalid update - wrong type
  // @ts-expect-error
  beWrong(tx.users[userId].update({ name: 123 }));

  // Invalid update - unknown attribute
  // @ts-expect-error
  beValid(tx.users[userId].update({ unknownField: 'value' }));
});

test('validates merge operations', () => {
  const userId = id();

  // Valid merge
  beValid(tx.users[userId].merge({ stuff: { custom: 'value' } }));

  // Invalid merge - wrong type
  beWrong(tx.users[userId].merge({ name: 123 }));
});

test('validates delete operations', () => {
  const userId = id();

  // Valid delete
  beValid(tx.users[userId].delete());
});

test('validates link operations', () => {
  const userId = id();
  const postId = id();

  // Valid link
  beValid(tx.users[userId].link({ posts: postId }));

  // Valid link with array
  beValid(tx.users[userId].link({ posts: [postId, id()] }));

  // Invalid link - unknown link
  // @ts-expect-error
  beWrong(tx.users[userId].link({ unknownLink: postId }));

  // Invalid link - non-object args
  beWrong({
    __ops: [['link', 'users', userId, 'not an object']],
    __etype: 'users',
  });
});

test('validates unlink operations', () => {
  const userId = id();
  const postId = id();

  // Valid unlink
  beValid(tx.users[userId].unlink({ posts: postId }));

  // Valid unlink with array
  beValid(tx.users[userId].unlink({ posts: [postId, id()] }));

  // Invalid unlink - unknown link
  // @ts-expect-error
  beWrong(tx.users[userId].unlink({ unknownLink: postId }));
});

test('validates entity existence', () => {
  const unknownId = id();

  // Invalid entity
  beWrong({
    __ops: [['create', 'unknownNamespace', unknownId, { field: 'value' }]],
    __etype: 'unknownNamespace',
  });

  // Valid without schema
  beValid(
    {
      __ops: [['create', 'unknownNamespace', unknownId, { field: 'value' }]],
      __etype: 'unknownNamespace',
    },
    null,
  );
});

test('validates attribute types', () => {
  const userId = id();

  // Valid string
  beValid(tx.users[userId].create({ name: 'John', email: 'john@example.com' }));

  // Invalid string - number
  // @ts-expect-error
  beWrong(tx.users[userId].create({ name: 123, email: 'john@example.com' }));

  // Invalid string - boolean
  // @ts-expect-error
  beWrong(tx.users[userId].create({ name: true, email: 'john@example.com' }));

  // Valid any type
  beValid(
    tx.users[userId].create({
      name: 'John',
      email: 'john@example.com',
      junk: 'this is the junk type',
    }),
  );
  beValid(
    tx.users[userId].create({
      name: 'John',
      email: 'john@example.com',
      junk: 123,
    }),
  );
  beValid(
    tx.users[userId].create({
      name: 'John',
      email: 'john@example.com',
      junk: { complex: 'object' },
    }),
  );
});

test('validates transaction chunk structure', () => {
  // Invalid chunk - not an object
  beWrong('not an object');
  beWrong(123);
  beWrong(null);

  // Invalid chunk - missing __ops
  beWrong({ __etype: 'users' });

  // Invalid chunk - __ops not an array
  beWrong({ __ops: 'not an array', __etype: 'users' });

  // Invalid operation - not an array
  beWrong({ __ops: ['not an array'], __etype: 'users' });
});

test('validates operation structure', () => {
  const userId = id();

  // Invalid entity name - not a string
  beWrong({ __ops: [['create', 123, userId, {}]], __etype: 'users' });
});

test('validates chained operations', () => {
  const userId = id();
  const postId = id();

  // Valid chained operations
  beValid(
    tx.users[userId]
      .create({ name: 'John', email: 'john@example.com' })
      .link({ posts: postId }),
  );

  // Valid complex chain
  beValid(
    tx.users[userId]
      .create({ name: 'John', email: 'john@example.com' })
      .link({ posts: postId })
      .update({ bio: 'Updated' }),
  );
});

test('validates multiple entity types', () => {
  const userId = id();
  const postId = id();
  const commentId = id();

  const chunks = [
    tx.users[userId].create({ name: 'John', email: 'john@example.com' }),
    tx.posts[postId].create({ title: 'Hello', body: 'World' }),
    tx.comments[commentId].create({ body: 'Nice post!' }),
    tx.posts[postId].link({ comments: commentId }),
    tx.users[userId].link({ posts: postId }),
  ];

  beValid(chunks);
});

test('validates link relationships', () => {
  const userId = id();
  const postId = id();
  const commentId = id();

  // Valid link between users and posts
  beValid(tx.users[userId].link({ posts: postId }));

  // Valid link between posts and comments
  beValid(tx.posts[postId].link({ comments: commentId }));

  // Valid self-referential link (friendships)
  beValid(tx.users[userId].link({ friends: id() }));

  // Invalid link - no relationship exists
  // @ts-expect-error
  beWrong(tx.users[userId].link({ unlinkedWithAnything: id() }));
});

test('validates without schema', () => {
  const userId = id();
  // Should not throw without schema
  beValid(
    originalTx.randomEntity[userId].create({ anyField: 'anyValue' }),
    null,
  );
  beValid(originalTx.randomEntity[userId].update({ anyField: 123 }), null);
  beValid(originalTx.randomEntity[userId].link({ anyLink: id() }), null);
});

test('validates UUID format for entity IDs', () => {
  // Valid UUID should pass
  const validUuid = id();
  beValid(
    tx.users[validUuid].create({ name: 'John', email: 'john@example.com' }),
  );

  beWrong(
    tx.users['not a valid uuid'].create({
      name: 'John',
      email: 'john@example.com',
    }),
  );

  // Test for links
  beValid(tx.users[validUuid].link({ posts: id() }));
  beWrong(tx.users[validUuid].link({ posts: 'not-a-uuid' }));
});

test('allows lookup values in square bracket', () => {
  beValid(
    tx.users[lookup('email', 'john@example.net')].update({ name: 'John' }),
  );
  beValid(tx.users[lookup('email', 'john@example.net')].link({ posts: id() }));
});

test('allows lookup values in link', () => {
  beValid(tx.users[id()].link({ posts: lookup('title', 'Hello') }));
  beWrong(tx.users[id()].link({ posts: 'non lookup or uuid' }));
});
