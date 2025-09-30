import { MigrationTx } from '@instantdb/platform';
import chalk from 'chalk';

export const renderSchemaPlan = (planSteps: MigrationTx[]) => {
  for (const step of planSteps) {
    switch (step.type) {
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
        console.log(
          `${chalk.bgYellow.black(' * UPDATE ATTR ')} ${step.identifier.namespace}.${step.identifier.attrName}`,
        );
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
          `${chalk.bgBlue.black(' + CREATE REQUIRED ')} ${step.namespace}.${step.attrName}`,
        );
        break;
      case 'unique':
        console.log(
          `${chalk.bgBlue.black(' + CREATE UNIQUE ')} ${step.namespace}.${step.attrName}`,
        );
        break;
      case 'remove-required':
        console.log(
          `${chalk.bgBlue.black(' - DELETE REQUIRED ')} ${step.namespace}.${step.attrName}`,
        );
        break;
      case 'remove-unique':
        console.log(
          `${chalk.bgBlue.black(' - DELETE UNIQUE ')} ${step.namespace}.${step.attrName}`,
        );
        break;
      case 'check-data-type':
        console.log(
          `${chalk.bgBlue.black(' + SET DATA TYPE ')} ${step.identity.namespace}.${step.identity.attrName} ${chalk.dim(step['checked-data-type'])}`,
        );
        break;
      case 'remove-data-type':
        console.log(
          `${chalk.bgBlue.black(' - DELETE DATA TYPE ')} ${step.namespace}.${step.attrName}`,
        );
        break;

      default:
        const unknownStep: never = step;
    }
  }
};
