import {
  convertTxSteps,
  MigrationTx,
  MigrationTxSpecific,
  MigrationTxTypes,
} from '@instantdb/platform';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import { promptOk } from './util/promptOk.js';

// Hack to prevent using @instantdb/core as a dependency for cli
type InstantDBAttr = Parameters<typeof convertTxSteps>[1][0];

const renderLinkUpdate = (
  tx: MigrationTxTypes['update-attr'],
  possiblePrevAttrs?: InstantDBAttr[],
): string => {
  if (tx.partialAttr['value-type'] !== 'ref') {
    throw new Error('Invalid value type for link update');
  }

  const oldAttr = possiblePrevAttrs
    ? possiblePrevAttrs.find((attr) => {
        return (
          attr['forward-identity'][1] === tx.identifier.namespace &&
          attr['forward-identity'][2] === tx.identifier.attrName
        );
      }) || null
    : null;

  let changeType: 'UPDATE' | 'RENAME' | 'RENAME REVERSE' = 'UPDATE';

  if (
    tx.partialAttr['forward-identity']?.attrName &&
    tx.identifier.attrName !== tx.partialAttr['forward-identity'].attrName
  ) {
    changeType = 'RENAME';
  }

  const details: string[] = [];
  let reverseLabel = '';
  if (oldAttr) {
    // Check for reverse rename
    if (
      tx.partialAttr['reverse-identity']?.attrName &&
      oldAttr['reverse-identity']?.[2] !==
        tx.partialAttr['reverse-identity'].attrName
    ) {
      changeType = 'RENAME REVERSE';
    }

    reverseLabel = ` <-> ${oldAttr['reverse-identity']![1]}.${oldAttr['reverse-identity']![2]}`;

    const prevOnDelete = oldAttr['on-delete'];
    const newOnDelete = tx.partialAttr['on-delete'];

    if (prevOnDelete != newOnDelete) {
      if (prevOnDelete) {
        const action = prevOnDelete.toUpperCase();
        details.push(
          `(REMOVE ${action} DELETE ON ${oldAttr['reverse-identity']![1]})`,
        );
      }
      if (newOnDelete) {
        const action = newOnDelete.toUpperCase();
        details.push(
          `(SET ON DELETE ${oldAttr['reverse-identity']![1]} ${action} DELETE ${oldAttr['forward-identity'][1]})`,
        );
      }
    }

    const prevOnDeleteReverse = oldAttr['on-delete-reverse'];
    const newOnDeleteReverse = tx.partialAttr['on-delete-reverse'];

    if (prevOnDeleteReverse != newOnDeleteReverse) {
      if (prevOnDeleteReverse) {
        const action = prevOnDeleteReverse.toUpperCase();
        details.push(
          `(REMOVE REVERSE ${action} DELETE ON ${oldAttr['reverse-identity']![1]})`,
        );
      }
      if (newOnDeleteReverse) {
        const action = newOnDeleteReverse.toUpperCase();
        details.push(
          `(SET ON DELETE ${oldAttr['forward-identity']![1]} ${action} DELETE ${oldAttr['reverse-identity']![1]})`,
        );
      }
    }
  }

  return `${chalk.bgYellow.black(` * ${changeType} ATTR `)} ${tx.identifier.namespace}.${tx.identifier.attrName}${reverseLabel} ${details.join(' ')}`;
};

export class CancelSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CancelSchemaError';
  }
}

const getRelationship = (
  cardinality: 'one' | 'many',
  unique: boolean,
): string[] => {
  if (cardinality === 'many' && !unique) return ['many', 'many'];
  if (cardinality === 'one' && unique) return ['one', 'one'];
  if (cardinality === 'many' && unique) return ['many', 'one'];
  if (cardinality === 'one' && !unique) return ['one', 'many'];
  throw new Error('Invalid relationship');
};

type AddOrDeleteAttr =
  | MigrationTxSpecific<'add-attr'>
  | MigrationTxSpecific<'delete-attr'>;

type SuperMigrationTx =
  | MigrationTx
  | { type: 'create-namespace'; namespace: string; innerSteps: MigrationTx[] }
  | { type: 'delete-namespace'; namespace: string; innerSteps: MigrationTx[] };

export const groupSteps = (steps: MigrationTx[]): SuperMigrationTx[] => {
  const { addOrDelSteps, otherSteps } = steps.reduce(
    (acc, step) => {
      if (step.type === 'add-attr' || step.type === 'delete-attr') {
        acc.addOrDelSteps.push(step);
      } else {
        acc.otherSteps.push(step);
      }
      return acc;
    },
    { addOrDelSteps: [] as AddOrDeleteAttr[], otherSteps: [] as MigrationTx[] },
  );
  // Group by namespace
  const groupedAddOrDel = addOrDelSteps.reduce(
    (acc, step) => {
      const namespace = step.identifier.namespace;
      if (!acc[namespace]) {
        acc[namespace] = [];
      }
      acc[namespace].push(step);
      return acc;
    },
    {} as Record<string, MigrationTx[]>,
  );

  const collapsed: SuperMigrationTx[] = Object.values(groupedAddOrDel).flatMap(
    (namedGroup) => {
      const isWholeEntityBeingDeleted = namedGroup.some((step) => {
        if (step.type === 'delete-attr' && step.identifier.attrName === 'id') {
          return true;
        }
      });

      if (isWholeEntityBeingDeleted) {
        return [
          {
            type: 'delete-namespace',
            namespace: namedGroup[0].identifier.namespace,
            innerSteps: namedGroup,
          } satisfies SuperMigrationTx as SuperMigrationTx,
        ];
      }

      const isWholeEntityBeingCreated = namedGroup.some((step) => {
        if (step.type === 'add-attr' && step.identifier.attrName === 'id') {
          return true;
        }
      });

      if (isWholeEntityBeingCreated) {
        return [
          {
            type: 'create-namespace',
            namespace: namedGroup[0].identifier.namespace,
            innerSteps: namedGroup,
          } satisfies SuperMigrationTx as SuperMigrationTx,
        ];
      }

      return namedGroup;
    },
  );

  return [...collapsed, ...otherSteps];
};

export const confirmImportantSteps = async (planSteps: SuperMigrationTx[]) => {
  for (const step of planSteps) {
    if (step.type === 'delete-namespace') {
      const ok = await promptOk({
        promptText: `Are you sure you want to delete namespace ${step.namespace}?`,
      });
      if (!ok) {
        throw new CancelSchemaError(`Deletion of namespace ${step.namespace}`);
      }
    }
  }
};

const createDotName = (step: MigrationTx) => {
  return `${step.identifier.namespace}.${step.identifier.attrName}`;
};

const isRename = (step: MigrationTxSpecific<'update-attr'>) => {
  return (
    step.partialAttr['forward-identity']?.attrName &&
    step.partialAttr['forward-identity']?.attrName !== step.identifier.attrName
  );
};

export const renderSchemaPlan = (
  planSteps: SuperMigrationTx[],
  prevAttrs?: InstantDBAttr[],
): string[] => {
  const result: string[] = [];

  const addLine = (line: string) => {
    result.push(line);
  };

  const addSecondaryLine = (line: string) => {
    addLine(`  ${chalk.italic(chalk.gray(stripAnsi(line)))}`);
  };

  for (const step of planSteps) {
    switch (step.type) {
      case 'create-namespace':
        addLine(
          `${chalk.bgGreen.black(' + CREATE NAMESPACE ')} ${step.namespace}`,
        );
        renderSchemaPlan(step.innerSteps, prevAttrs).forEach((outputLine) =>
          addSecondaryLine(outputLine),
        );
        break;
      case 'delete-namespace':
        addLine(`${chalk.bgRed(' - DELETE NAMESPACE ')} ${step.namespace}`);
        break;
      case 'add-attr':
        if (step['value-type'] === 'ref' && step['reverse-identity']) {
          addLine(
            `${chalk.bgGreen.black(' + CREATE LINK ')} ${createDotName(step)} <-> ${step['reverse-identity'].namespace}.${step['reverse-identity'].attrName}`,
          );
          addSecondaryLine(
            '  ' +
              getRelationship(step.cardinality, step['unique?'])
                .join(' <-> ')
                .toUpperCase(),
          );
        } else {
          addLine(
            `${chalk.bgGreen.black(' + CREATE ATTR ')} ${createDotName(step)}`,
          );
          if (step['checked-data-type']) {
            addSecondaryLine('   DATA TYPE: ' + step['checked-data-type']);
          }
          if (step['unique?'] && step.identifier.attrName !== 'id') {
            addSecondaryLine('   UNIQUE');
          }
          if (!step['required?']) {
            addSecondaryLine('   OPTIONAL');
          }
          if (step['index?']) {
            addSecondaryLine('   INDEXED');
          }
        }
        break;
      case 'delete-attr':
        const oldAttr = prevAttrs
          ? prevAttrs.find((attr) => {
              return (
                attr['forward-identity'][1] === step.identifier.namespace &&
                attr['forward-identity'][2] === step.identifier.attrName
              );
            }) || null
          : null;

        if (oldAttr?.['value-type'] === 'ref') {
          addLine(
            `${chalk.bgRed(' - DELETE LINK ')} ${step.identifier.namespace}.${step.identifier.attrName}`,
          );
          break;
        }

        addLine(`${chalk.bgRed(' - DELETE ATTR ')} ${createDotName(step)}`);
        break;
      case 'update-attr':
        if (step.partialAttr['value-type'] === 'ref') {
          addLine(renderLinkUpdate(step, prevAttrs));
        } else {
          if (isRename(step)) {
            addLine(
              `${chalk.bgYellow.black(' * RENAME ATTR ')} ${createDotName(step)} -> ${step.partialAttr['forward-identity']?.['namespace']}.${step.partialAttr['forward-identity']?.['attrName']}`,
            );
          } else {
            addLine(
              `${chalk.bgYellow.black(' * UPDATE ATTR ')} ${createDotName(step)}`,
            );
          }
        }
        break;
      case 'index':
        addLine(
          `${chalk.bgBlue.black(' + CREATE INDEX ')} ${createDotName(step)}`,
        );
        break;
      case 'remove-index':
        addLine(
          `${chalk.bgBlue.black(' - DELETE INDEX ')} ${createDotName(step)}`,
        );
        break;
      case 'required':
        addLine(
          `${chalk.bgBlue.black(' + MAKE REQUIRED ')} ${createDotName(step)}`,
        );
        break;
      case 'unique':
        addLine(
          `${chalk.bgBlue.black(' * MAKE UNIQUE ')} ${createDotName(step)}`,
        );
        break;
      case 'remove-required':
        addLine(
          `${chalk.bgBlue.black(' - MAKE OPTIONAL ')} ${createDotName(step)}`,
        );
        break;
      case 'remove-unique':
        addLine(
          `${chalk.bgBlue.black(' - REMOVE UNIQUE CONSTRAINT')} ${createDotName(step)}`,
        );
        break;
      case 'check-data-type':
        addLine(
          `${chalk.bgBlue.black(' + SET DATA TYPE ')} ${createDotName(step)} ${chalk.dim(step['checked-data-type'])}`,
        );
        break;
      case 'remove-data-type':
        addLine(
          `${chalk.bgBlue.black(' - REMOVE DATA TYPE CONSTRAINT ')} ${createDotName(step)}`,
        );
        break;

      default:
        const unknownStep: never = step;
    }
  }

  return result;
};
