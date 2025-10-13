import {
  convertTxSteps,
  MigrationTx,
  MigrationTxSpecific,
  MigrationTxTypes,
} from '@instantdb/platform';
import chalk from 'chalk';
import { promptOk } from './index.js';

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

  let changeType: 'UPDATE' | 'RENAME' = 'UPDATE';

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
      changeType = 'RENAME';
    }

    reverseLabel = ` <-> ${oldAttr['reverse-identity']![1]}.${oldAttr['reverse-identity']![2]}`;
    if (!oldAttr['on-delete'] && tx.partialAttr['on-delete']) {
      details.push(`(SET CASCADE DELETE)`);
    }
    if (!oldAttr['on-delete-reverse'] && tx.partialAttr['on-delete-reverse']) {
      details.push(`(SET REVERSE CASCADE DELETE)`);
    }
    if (oldAttr['on-delete'] && !oldAttr['on-delete-reverse']) {
      details.push(`(REMOVE CASCADE DELETE)`);
    }
    if (oldAttr['on-delete-reverse'] && !oldAttr['on-delete-reverse']) {
      details.push(`(REMOVE REVERSE CASCADE DELETE)`);
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

type AddOrDeleteAttr =
  | MigrationTxSpecific<'add-attr'>
  | MigrationTxSpecific<'delete-attr'>;

type SuperMigrationTx =
  | MigrationTx
  | { type: 'create-namespace'; namespace: string; attrs: string[] }
  | { type: 'delete-namespace'; namespace: string; attrs: string[] };

const groupSteps = (steps: MigrationTx[]): SuperMigrationTx[] => {
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
            attrs: namedGroup.map((step) => step.identifier.attrName),
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
            attrs: namedGroup.map((step) => step.identifier.attrName),
          } satisfies SuperMigrationTx as SuperMigrationTx,
        ];
      }

      return namedGroup;
    },
  );

  return [...collapsed, ...otherSteps];
};

export const renderSchemaPlan = async (
  planSteps: MigrationTx[],
  prevAttrs?: InstantDBAttr[],
) => {
  const groupedSteps = groupSteps(planSteps);

  for (const step of groupedSteps) {
    switch (step.type) {
      case 'create-namespace':
        console.log(
          `${chalk.bgGreen.black(' + CREATE NAMESPACE ')} ${step.namespace}  ${step.attrs.length > 0 ? ` (${step.attrs.join(', ')})` : ''}`,
        );
        break;
      case 'delete-namespace':
        const ok = await promptOk(
          `Are you sure you want to delete namespace ${step.namespace}?`,
        );
        if (!ok) {
          throw new CancelSchemaError(
            `Deletion of namespace ${step.namespace}`,
          );
        }

        console.log(
          `${chalk.bgRed(' - DELETE NAMESPACE ')} ${step.namespace}${step.attrs.length > 0 ? ` (${step.attrs.join(', ')})` : ''}`,
        );
        break;
      case 'add-attr':
        if (step['value-type'] === 'ref' && step['reverse-identity']) {
          console.log(
            `${chalk.bgGreen.black(' + CREATE LINK ')} ${step.identifier.namespace}.${step.identifier.attrName} <-> ${step['reverse-identity'].namespace}.${step['reverse-identity'].attrName}`,
          );
        } else {
          console.log(
            `${chalk.bgGreen.black(' + CREATE ATTR ')} ${step.identifier.namespace}.${step.identifier.attrName}`,
          );
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
          console.log(
            `${chalk.bgRed(' - DELETE LINK ')} ${step.identifier.namespace}.${step.identifier.attrName}`,
          );
          break;
        }

        console.log(
          `${chalk.bgRed(' - DELETE ATTR ')} ${step.identifier.namespace}.${step.identifier.attrName}`,
        );
        break;
      case 'update-attr':
        if (step.partialAttr['value-type'] === 'ref') {
          console.log(renderLinkUpdate(step, prevAttrs));
        } else {
          console.log(
            `${chalk.bgYellow.black(' * UPDATE ATTR ')} ${step.identifier.namespace}.${step.identifier.attrName}`,
          );
        }
        break;
      case 'index':
        console.log(
          `${chalk.bgBlue.black(' + CREATE INDEX ')} ${step.identifier.namespace}.${step.identifier.attrName}`,
        );
        break;
      case 'remove-index':
        console.log(
          `${chalk.bgBlue.black(' - DELETE INDEX ')} ${step.identifier.namespace}.${step.identifier.attrName}`,
        );
        break;
      case 'required':
        console.log(
          `${chalk.bgBlue.black(' + MAKE REQUIRED ')} ${step.identifier.namespace}.${step.identifier.attrName}`,
        );
        break;
      case 'unique':
        console.log(
          `${chalk.bgBlue.black(' * MAKE UNIQUE ')} ${step.identifier.namespace}.${step.identifier.attrName}`,
        );
        break;
      case 'remove-required':
        console.log(
          `${chalk.bgBlue.black(' - MAKE OPTIONAL ')} ${step.identifier.namespace}.${step.identifier.attrName}`,
        );
        break;
      case 'remove-unique':
        console.log(
          `${chalk.bgBlue.black(' - REMOVE UNIQUE CONSTRAINT')} ${step.identifier.namespace}.${step.identifier.attrName}`,
        );
        break;
      case 'check-data-type':
        console.log(
          `${chalk.bgBlue.black(' + SET DATA TYPE ')} ${step.identifier.namespace}.${step.identifier.attrName} ${chalk.dim(step['checked-data-type'])}`,
        );
        break;
      case 'remove-data-type':
        console.log(
          `${chalk.bgBlue.black(' - REMOVE DATA TYPE CONSTRAINT ')} ${step.identifier.namespace}.${step.identifier.attrName}`,
        );
        break;

      default:
        const unknownStep: never = step;
    }
  }
};
