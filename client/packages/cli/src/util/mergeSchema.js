import * as acorn from 'acorn';
import tsPlugin from 'acorn-typescript';

const node = acorn.Parser.extend(tsPlugin({ dts: false }));

// --- Import Handling Helpers ---

function collectImports(ast) {
  const imports = new Map(); // localName -> { source, importedName, type, importKind }

  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      const source = node.source.value;
      const declImportKind = node.importKind;

      for (const specifier of node.specifiers) {
        let kind = 'value';
        if (declImportKind === 'type' || specifier.importKind === 'type') {
          kind = 'type';
        }

        if (specifier.type === 'ImportSpecifier') {
          imports.set(specifier.local.name, {
            source,
            importedName: specifier.imported.name,
            type: 'named',
            importKind: kind,
          });
        } else if (specifier.type === 'ImportDefaultSpecifier') {
          imports.set(specifier.local.name, {
            source,
            type: 'default',
            importKind: kind,
          });
        } else if (specifier.type === 'ImportNamespaceSpecifier') {
          imports.set(specifier.local.name, {
            source,
            type: 'namespace',
            importKind: kind,
          });
        }
      }
    }
  }
  return imports;
}

function collectExistingImports(ast) {
  const existing = new Map(); // source -> Set<localName>

  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      const source = node.source.value;
      if (!existing.has(source)) existing.set(source, new Set());

      for (const specifier of node.specifiers) {
        existing.get(source).add(specifier.local.name);
      }
    }
  }
  return existing;
}

function findIdentifiers(node, set = new Set()) {
  if (!node) return set;

  // If it's a Type Reference, grab the name
  if (node.type === 'TSTypeReference') {
    if (node.typeName.type === 'Identifier') {
      set.add(node.typeName.name);
    } else if (node.typeName.type === 'TSQualifiedName') {
      // For A.B, we need A
      let left = node.typeName.left;
      while (left.type === 'TSQualifiedName') {
        left = left.left;
      }
      if (left.type === 'Identifier') {
        set.add(left.name);
      }
    }
  }

  // Recursive walk
  for (const key in node) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    if (typeof node[key] === 'object' && node[key] !== null) {
      if (Array.isArray(node[key])) {
        node[key].forEach((child) => findIdentifiers(child, set));
      } else {
        findIdentifiers(node[key], set);
      }
    }
  }
  return set;
}

// --- Schema Traversal Helpers ---

function getPropName(prop) {
  if (prop.key.type === 'Identifier') return prop.key.name;
  if (prop.key.type === 'Literal') return prop.key.value;
  return null;
}

function analyzeChain(node) {
  let curr = node;
  let typeParams = null;
  let baseCall = null;

  while (curr.type === 'CallExpression') {
    if (curr.typeParameters) {
      typeParams = curr.typeParameters;
    }

    if (
      curr.callee.type === 'MemberExpression' &&
      curr.callee.object.type === 'Identifier' &&
      curr.callee.object.name === 'i'
    ) {
      baseCall = curr;
    }

    if (curr.callee.type === 'MemberExpression') {
      curr = curr.callee.object;
    } else {
      break;
    }
  }
  return { typeParams, baseCall };
}

function traverseSchema(node, path, callback) {
  if (node.type === 'ObjectExpression') {
    for (const prop of node.properties) {
      const name = getPropName(prop);
      if (!name) continue;
      const newPath = path ? `${path}.${name}` : name;

      if (prop.value.type === 'ObjectExpression') {
        traverseSchema(prop.value, newPath, callback);
      } else if (prop.value.type === 'CallExpression') {
        let isEntity = false;
        if (
          prop.value.callee.type === 'MemberExpression' &&
          prop.value.callee.property.name === 'entity' &&
          prop.value.callee.object.type === 'Identifier' &&
          prop.value.callee.object.name === 'i'
        ) {
          isEntity = true;
        }

        if (isEntity) {
          callback(prop.value, newPath);
          if (prop.value.arguments.length > 0) {
            traverseSchema(prop.value.arguments[0], newPath, callback);
          }
        } else {
          callback(prop.value, newPath);
        }
      }
    }
  }
}

function findSchemaObject(ast) {
  let schemaObj = null;
  function walk(node) {
    if (!node) return;
    if (schemaObj) return;
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      node.callee.object.name === 'i' &&
      node.callee.property.name === 'schema' &&
      node.arguments.length > 0
    ) {
      schemaObj = node.arguments[0];
      return;
    }
    for (const key in node) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      if (node[key] && typeof node[key] === 'object') {
        if (Array.isArray(node[key])) {
          node[key].forEach(walk);
        } else {
          walk(node[key]);
        }
      }
    }
  }
  walk(ast);
  return schemaObj;
}

export function mergeSchema(oldFile, newFile) {
  const oldParsed = node.parse(oldFile, {
    sourceType: 'module',
    ecmaVersion: 'latest',
    locations: true,
  });

  const newParsed = node.parse(newFile, {
    sourceType: 'module',
    ecmaVersion: 'latest',
    locations: true,
  });

  const schemaMap = new Map(); // Path -> { src, ast }

  // 1. Extract from old file
  const oldSchemaObj = findSchemaObject(oldParsed);
  if (oldSchemaObj) {
    traverseSchema(oldSchemaObj, '', (node, path) => {
      const { typeParams } = analyzeChain(node);
      if (typeParams) {
        const src = oldFile.slice(typeParams.start, typeParams.end);
        schemaMap.set(path, { src, ast: typeParams });
      }
    });
  }

  // 2. Collect Imports
  const oldImports = collectImports(oldParsed);
  const newExistingImports = collectExistingImports(newParsed);
  const neededIdentifiers = new Set();

  // 3. Apply to new file & Collect needed identifiers
  const edits = [];
  const newSchemaObj = findSchemaObject(newParsed);

  if (newSchemaObj) {
    traverseSchema(newSchemaObj, '', (node, path) => {
      const { typeParams, baseCall } = analyzeChain(node);
      const stored = schemaMap.get(path);

      if (stored) {
        // Collect identifiers from the type params we are about to inject
        findIdentifiers(stored.ast, neededIdentifiers);

        if (typeParams) {
          edits.push({
            start: typeParams.start,
            end: typeParams.end,
            text: stored.src,
          });
        } else if (baseCall) {
          edits.push({
            start: baseCall.callee.end,
            end: baseCall.callee.end,
            text: stored.src,
          });
        }
      }
    });
  }

  // 4. Generate Import Statements
  const importsToAdd = new Map(); // source -> { named: Map<string, {str, isType}>, default: {str, isType}, namespace: {str, isType} }

  for (const id of neededIdentifiers) {
    const importInfo = oldImports.get(id);
    if (importInfo) {
      // Check if already imported in new file
      const existing = newExistingImports.get(importInfo.source);
      if (existing && existing.has(id)) {
        continue; // Already imported
      }

      if (!importsToAdd.has(importInfo.source)) {
        importsToAdd.set(importInfo.source, {
          named: new Map(),
          default: null,
          namespace: null,
        });
      }
      const group = importsToAdd.get(importInfo.source);
      const isType = importInfo.importKind === 'type';

      if (importInfo.type === 'named') {
        let importStr = id;
        if (importInfo.importedName !== id) {
          importStr = `${importInfo.importedName} as ${id}`;
        }
        group.named.set(importStr, { str: importStr, isType });
      } else if (importInfo.type === 'default') {
        group.default = { str: id, isType };
      } else if (importInfo.type === 'namespace') {
        group.namespace = { str: id, isType };
      }
    }
  }

  const importBlocks = [];

  for (const [source, info] of importsToAdd) {
    // Check if source exists in new file to merge?
    // For simplicity, we append new import lines.
    // But we can try to be smart.

    // If we have named imports
    if (info.named.size > 0) {
      const namedImports = Array.from(info.named.values());
      const allTypes = namedImports.every((x) => x.isType);

      if (allTypes) {
        const names = namedImports.map((x) => x.str).join(', ');
        importBlocks.push(`import type { ${names} } from '${source}';`);
      } else {
        const names = namedImports
          .map((x) => (x.isType ? `type ${x.str}` : x.str))
          .join(', ');
        importBlocks.push(`import { ${names} } from '${source}';`);
      }
    }
    if (info.default) {
      if (info.default.isType) {
        importBlocks.push(`import type ${info.default.str} from '${source}';`);
      } else {
        importBlocks.push(`import ${info.default.str} from '${source}';`);
      }
    }
    if (info.namespace) {
      if (info.namespace.isType) {
        importBlocks.push(`import type * as ${info.namespace.str} from '${source}';`);
      } else {
        importBlocks.push(`import * as ${info.namespace.str} from '${source}';`);
      }
    }
  }

  // 5. Apply edits
  edits.sort((a, b) => b.start - a.start);

  let output = newFile;
  for (const edit of edits) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }

  // Prepend imports
  if (importBlocks.length > 0) {
    // Check for leading comments (e.g. // Docs: ...)
    // We want to insert imports AFTER the leading comments but BEFORE the first code/import

    // Simple heuristic: match consecutive lines at start that begin with //
    const commentMatch = output.match(/^(\s*\/\/.*(\r?\n|$))+/);

    if (commentMatch) {
      const commentEnd = commentMatch[0].length;
      output =
        output.slice(0, commentEnd) + '\n' + importBlock + output.slice(commentEnd);
    } else {
      output = importBlocks.join('\n') + '\n' + output;
    }
  }

  return output;
}
