import { MigrationTx } from '@instantdb/platform';
import chalk from 'chalk';

export const renderSchemaPlan = (planSteps: MigrationTx[]) => {
  const groupedSteps: (
    | MigrationTx
    | { type: 'create-namespace'; namespace: string; attrs: string[] }
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
    } else {
      groupedSteps.push(step);
      i++;
    }
  }

  for (const step of groupedSteps) {
    switch (step.type) {
      case 'create-namespace':
        console.log(
          `${chalk.bgGreen.black(' + CREATE NAMESPACE ')} ${step.namespace}${step.attrs.length > 0 ? ` (${step.attrs.join(', ')})` : ''}`,
        );
        break;
      case 'add-attr':
        console.log(
          `${chalk.bgGreen.black(' + CREATE ATTR ')} ${step.identifier.namespace}.${step.identifier.attrName}`,
        );
        break;
      case 'delete-attr':
        console.log(
          `${chalk.bgRed.black(' - DELETE ATTR ')} ${step.namespace}.${step.attrName}`,
        );
        break;
      case 'update-attr':
        if (
          step.partialAttr['forward-identity']?.attrName &&
          step.identifier.attrName !==
            step.partialAttr['forward-identity'].attrName
        ) {
          console.log(
            `${chalk.bgYellow.black(' * RENAME ATTR ')} ${step.identifier.namespace}.${step.identifier.attrName} -> ${step.identifier.namespace}.${step.partialAttr['forward-identity'].attrName}`,
          );
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
