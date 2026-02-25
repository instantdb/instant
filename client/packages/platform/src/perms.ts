import { parse, type ParseResult, type File } from '@babel/parser';
import { astToJson } from './typescript-schema.ts';

export function generatePermsTypescriptFile(
  permsCode: null | Record<string, any>,
  instantModuleName: string,
) {
  const rulesTxt =
    permsCode && Object.keys(permsCode).length
      ? JSON.stringify(permsCode, null, 2)
      : `{
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
   *   bind: {"isOwner": "auth.id != null && auth.id == data.ownerId"},
   * },
   */
}
`.trim();

  return `// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from "${instantModuleName ?? '@instantdb/core'}";

const rules = ${rulesTxt} satisfies InstantRules;

export default rules;
`;
}

function astToPermsCode(ast: ParseResult<File>): Record<string, any> {
  for (const n of ast.program.body) {
    if (
      n.type !== 'VariableDeclaration' ||
      n.declarations.length !== 1 ||
      n.declarations[0].id.type !== 'Identifier' ||
      n.declarations[0].id.name !== 'rules'
    ) {
      continue;
    }

    const node = n.declarations[0];

    if (!node.init || node.init.type !== 'TSSatisfiesExpression') {
      throw new Error(`Could not extract rules`);
    }

    return astToJson(node.init.expression) as Record<string, any>;
  }

  throw new Error(
    'Could not extract rules, did not find the rules variable declaration.',
  );
}

export function permsTypescriptFileToCode(
  content: string,
  sourceFilename: string,
) {
  const ast = parse(content, {
    sourceFilename,
    sourceType: 'module',
    errorRecovery: false,
    plugins: ['typescript'],
  });
  if (ast.errors?.length) {
    throw new Error(`Could not parse perms file. ${ast.errors[0].reasonCode}.`);
  }

  return astToPermsCode(ast);
}
