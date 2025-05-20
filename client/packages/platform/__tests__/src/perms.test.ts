import { test, expect } from 'vitest';

import { generatePermsTypescriptFile } from '../../src/perms';

test('generates perms file', () => {
  expect(
    generatePermsTypescriptFile(
      {
        $files: {
          allow: {
            view: 'isOwner',
            create: 'isOwner',
          },
          bind: ['isOwner', "data.path.startsWith(auth.id + '/')"],
        },
      },
      '@instantdb/core',
    ),
  ).toEqual(`// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from "@instantdb/core";

const rules = {
  "$files": {
    "allow": {
      "view": "isOwner",
      "create": "isOwner"
    },
    "bind": [
      "isOwner",
      "data.path.startsWith(auth.id + '/')"
    ]
  }
} satisfies InstantRules;

export default rules;
`);
});

test('generates empty perms file', () => {
  expect(generatePermsTypescriptFile(null, '@instantdb/core'))
    .toEqual(`// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from "@instantdb/core";

const rules = {
  /**
   * Welcome to Instant's permission system!
   * Right now your rules are empty. To start filling them in, check out the docs:
   * https://www.instantdb.com/docs/permissions
   *
   * Here's an example to give you a feel:
   * posts: {
   *   allow: {
   *     view: "true",
   *     create: "isOwner",
   *     update: "isOwner",
   *     delete: "isOwner",
   *   },
   *   bind: ["isOwner", "auth.id != null && auth.id == data.ownerId"],
   * },
   */
} satisfies InstantRules;

export default rules;
`);
});
