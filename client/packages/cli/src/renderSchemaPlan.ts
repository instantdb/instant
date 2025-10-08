import {
  convertTxSteps,
  Identifier,
  MigrationTx,
  MigrationTxTypes,
} from '@instantdb/platform';
import chalk from 'chalk';

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

  return `${chalk.bgYellow.black(' * UPDATE ATTR ')} ${tx.identifier.namespace}.${tx.identifier.attrName}${reverseLabel}
    ${details.join(' ')}`;
};

export const renderSchemaPlan = (
  planSteps: MigrationTx[],
  prevAttrs?: InstantDBAttr[],
) => {
  const groupedSteps: (
    | MigrationTx
    | { type: 'create-namespace'; namespace: string; attrs: string[] }
    | { type: 'delete-namespace'; namespace: string; attrs: string[] }
  )[] = [];

  let i = 0;
  while (i < planSteps.length) {
    const step = planSteps[i];

    if (step.type === 'add-attr') {
      const namespace = step.identifier.namespace;
      const namespaceAttrs: string[] = [];
      let hasIdAttr = false;
      let j = i;

      while (j < planSteps.length) {
        const currentStep = planSteps[j];
        if (currentStep.type !== 'add-attr') break;
        if (currentStep.identifier.namespace !== namespace) break;

        namespaceAttrs.push(currentStep.identifier.attrName);
        if (currentStep.identifier.attrName === 'id') {
          hasIdAttr = true;
        }
        j++;
      }

      if (hasIdAttr && namespaceAttrs.length > 1) {
        groupedSteps.push({
          type: 'create-namespace',
          namespace,
          attrs: namespaceAttrs.filter((name) => name !== 'id'),
        });
        i = j;
      } else {
        groupedSteps.push(step);
        i++;
      }
    } else if (step.type === 'delete-attr') {
      const namespace = step.namespace;
      const namespaceAttrs: string[] = [];
      let hasIdAttr = false;
      let j = i;

      while (j < planSteps.length) {
        const currentStep = planSteps[j];
        if (currentStep.type !== 'delete-attr') break;
        if (currentStep.namespace !== namespace) break;

        namespaceAttrs.push(currentStep.attrName);
        if (currentStep.attrName === 'id') {
          hasIdAttr = true;
        }
        j++;
      }

      if (hasIdAttr && namespaceAttrs.length > 1) {
        groupedSteps.push({
          type: 'delete-namespace',
          namespace,
          attrs: namespaceAttrs.filter((name) => name !== 'id'),
        });
        i = j;
      } else {
        groupedSteps.push(step);
        i++;
      }
    } else {
      groupedSteps.push(step);
      i++;
    }
  }

  for (const step of groupedSteps) {
    switch (step.type) {
      case 'create-namespace':
        console.log(
          `${chalk.bgGreen.black(' + CREATE NAMESPACE ')} ${step.namespace}\n    ${step.attrs.length > 0 ? ` (${step.attrs.join(', ')})` : ''}`,
        );
        break;
      case 'delete-namespace':
        console.log(
          `${chalk.bgRed(' - DELETE NAMESPACE ')} ${step.namespace}${step.attrs.length > 0 ? ` (${step.attrs.join(', ')})` : ''}`,
        );
        break;
      case 'add-attr':
        if (step['value-type'] === 'ref' && step['reverse-identity']) {
          console.log(
            `${chalk.bgGreen.black(' + CREATE LINK ')} ${step.identifier.namespace}.${step.identifier.attrName} -> ${step['reverse-identity'].namespace}.${step['reverse-identity'].attrName}`,
          );
        } else {
          console.log(
            `${chalk.bgGreen.black(' + CREATE ATTR ')} ${step.identifier.namespace}.${step.identifier.attrName}`,
          );
        }
        break;
      case 'delete-attr':
        console.log(
          `${chalk.bgRed(' - DELETE ATTR ')} ${step.namespace}.${step.attrName}`,
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
          `${chalk.bgBlue.black(' + CREATE INDEX ')} ${step.namespace}.${step.attrName}`,
        );
        break;
      case 'remove-index':
        console.log(
          `${chalk.bgBlue.black(' - DELETE INDEX ')} ${step.namespace}.${step.attrName}`,
        );
        break;
      case 'required':
        console.log(
          `${chalk.bgBlue.black(' + MAKE REQUIRED ')} ${step.namespace}.${step.attrName}`,
        );
        break;
      case 'unique':
        console.log(
          `${chalk.bgBlue.black(' * MAKE UNIQUE ')} ${step.namespace}.${step.attrName}`,
        );
        break;
      case 'remove-required':
        console.log(
          `${chalk.bgBlue.black(' - MAKE OPTIONAL ')} ${step.namespace}.${step.attrName}`,
        );
        break;
      case 'remove-unique':
        console.log(
          `${chalk.bgBlue.black(' - REMOVE UNIQUE CONSTRAINT')} ${step.namespace}.${step.attrName}`,
        );
        break;
      case 'check-data-type':
        console.log(
          `${chalk.bgBlue.black(' + SET DATA TYPE ')} ${step.identity.namespace}.${step.identity.attrName} ${chalk.dim(step['checked-data-type'])}`,
        );
        break;
      case 'remove-data-type':
        console.log(
          `${chalk.bgBlue.black(' - REMOVE DATA TYPE CONSTRAINT ')} ${step.namespace}.${step.attrName}`,
        );
        break;

      default:
        const unknownStep: never = step;
    }
  }
};
