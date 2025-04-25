import chalk from 'chalk';

/**
 * Checks if the current CLI instance is running in a linked/development state
 * @param {string} version - The version string of the CLI
 * @returns {boolean} - Whether the CLI is running in linked/development mode
 */
export function isLinkedCLI(version) {
  // Check if we're using a dev version (this is a strong indicator of a linked version)
  if (version.includes('-dev')) {
    return true;
  }
  
  try {
    const moduleMain = require.resolve('instant-cli');
    return moduleMain.includes('node_modules/.pnpm/link:') || 
           moduleMain.includes('/node_global/') || 
           moduleMain.includes('node_modules/.npm/link');
  } catch (e) {
    // If we can't resolve the module through require.resolve, check if we're running from a development path
    const paths = process.argv[1]?.split('/') || [];
    return paths.includes('dev') || paths.includes('instant') && paths.includes('client');
  }
}

/**
 * Displays a warning message for development/linked CLI usage
 */
export function displayLinkedWarning() {
  const boxWidth = 63;
  const padding = '║ ';
  const message = 'DEVELOPMENT MODE: Using locally linked version of instant-cli';
  console.log(chalk.cyan.bold('╔' + '═'.repeat(boxWidth) + '╗'));
  console.log(chalk.cyan.bold(padding + message.padEnd(boxWidth - padding.length + 1) + '║'));
  console.log(chalk.cyan.bold('╚' + '═'.repeat(boxWidth) + '╝'));
} 