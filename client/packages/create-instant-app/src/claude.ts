import { exec, spawn } from 'child_process';
import { log } from '@clack/prompts';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import ora from 'ora';
import * as p from '@clack/prompts';
import { wrappedWindowOutput } from './utils/logger.js';

interface ClaudeMessage {
  type: 'assistant' | 'user' | 'system' | 'result';
  message?: {
    content: Array<{ type: string; text?: string; name?: string; input?: any }>;
  };
  result?: string;
  subtype?: string;
}

let currentSpinner: ReturnType<typeof ora> | null = null;

const getSpinnerText = (
  content: NonNullable<ClaudeMessage['message']>['content'][0],
) => {
  const input = content.input || {};
  let output = '';

  switch (content.name) {
    case 'Read':
      const filePath = input.filePath || input.file_path || '';
      const shortPath = filePath.split('/').slice(-2).join('/');
      output = `Reading ${shortPath}`;
      break;

    case 'Write':
      const writeFile = input.filePath || input.file_path || '';
      const shortWrite = writeFile.split('/').slice(-2).join('/');
      output = `Creating ${shortWrite}`;
      break;

    case 'Edit':
      const editFile = input.filePath || input.file_path || '';
      const shortEdit = editFile.split('/').slice(-2).join('/');
      output = `Editing ${shortEdit}`;
      break;

    case 'Bash':
      const cmd = input.command || '';
      const shortCmd = cmd.length > 50 ? cmd.substring(0, 50) + '...' : cmd;
      output = `Running ${shortCmd}`;
      break;

    case 'LS':
      const path = input.path || '.';
      const shortLs =
        path === '.' ? 'current directory' : path.split('/').slice(-1)[0];
      output = `Listing files in ${shortLs}`;
      break;

    case 'TodoWrite':
      const todos = input.todos || [];
      const activeTodo =
        todos.find((t: any) => t.status === 'in_progress') || todos[0];
      if (activeTodo) {
        output = `Todo: ${activeTodo.content || 'updating todos'}`;
      } else {
        output = `Updating todo list`;
      }
      break;

    case 'Glob':
      output = `Searching for ${input.pattern || 'files'}`;
      break;

    case 'Grep':
      const pattern = input.pattern || '';
      const shortPattern =
        pattern.length > 30 ? pattern.substring(0, 30) + '...' : pattern;
      output = `Searching for "${shortPattern}"`;
      break;

    default:
      // For any other tools, show a compact version
      const inputStr = Object.entries(input)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join(', ');
      const shortInput =
        inputStr.length > 50 ? inputStr.substring(0, 50) + '...' : inputStr;
      output = `${content.name}(${shortInput})`;
  }

  return output;
};

const printClaudeMessage = (
  content: NonNullable<ClaudeMessage['message']>['content'][0],
) => {
  if (content.type === 'text' && content.text) {
    // Stop any existing spinner before showing text
    if (currentSpinner) {
      currentSpinner.stop();
      currentSpinner = null;
    }

    wrappedWindowOutput(content.text, p.log.info, true);
    // p.log.info(content.text);
    // console.log(chalk.gray('│'));
  } else if (content.type === 'tool_use') {
    // Stop any existing spinner
    if (currentSpinner) {
      currentSpinner.stop();
      currentSpinner = null;
    }

    // Start new spinner for this tool use
    const spinnerText = getSpinnerText(content);
    currentSpinner = ora({
      text: spinnerText,
      prefixText: chalk.gray('│ '),
    }).start();
  } else if (content.type === 'tool_result') {
    // Stop spinner when tool result is received
    if (currentSpinner) {
      currentSpinner.stop();
      currentSpinner = null;
    }
  }
};

export async function findClaudePath(): Promise<string | null> {
  return new Promise((resolve) => {
    // Use the user's shell to resolve the command
    const shell = process.env.SHELL || '/bin/bash';
    const child = spawn(shell, ['-i', '-c', 'which claude'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        const result = output.trim();
        if (result.includes('aliased to ')) {
          resolve(result.split('aliased to ')[1] || null);
        } else {
          resolve(result);
        }
      } else {
        resolve(null);
      }
    });
  });
}

export const promptClaude = async (prompt: string, projectDir: string) => {
  // Check if instant mcp installed and prompt to install it

  const claudePath = await findClaudePath();

  if (!claudePath) {
    throw new Error("Could not find Claude's path on your machine");
  }

  fs.appendFile(
    path.join(projectDir, 'claude.md'),
    'Do not use the instant mcp server to create a new app, a fresh app id has already been placed in the .env file. Do not attempt to start a dev server.',
  );

  return new Promise<void>((resolve, reject) => {
    const running = exec(
      `${claudePath} --dangerously-skip-permissions --output-format stream-json -p --verbose "${prompt}"`,
      {
        cwd: projectDir,
      },
    );

    if (!running || !running.stdout || !running.stderr) {
      reject(new Error('Failed to start claude process or get streams'));
      return;
    }

    let buffer = '';

    running.on('spawn', () => {
      // Claude code listens for stdin if not connected to a tty
      running.stdin?.end();
    });

    running.stdout.on('data', (data) => {
      process.stdout.write('\x1B[?25l');
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      lines.forEach((line: string) => {
        if (line.trim()) {
          try {
            const parsed: ClaudeMessage = JSON.parse(line);

            // Handle different message types with compact formatting
            if (parsed.type === 'assistant' && parsed.message?.content) {
              parsed.message.content.forEach((content) => {
                printClaudeMessage(content);
              });
            }
          } catch (error) {}
        }
      });
    });

    running.stderr?.on('data', (data) => {
      const error = data.toString();
      error.split('\n').forEach((line: string) => {
        if (line.trim()) {
          log.error(line);
        }
      });
    });

    running.on('close', (code) => {
      // Stop any remaining spinner
      if (currentSpinner) {
        currentSpinner.stop();
        currentSpinner = null;
      }

      if (code === 0) {
        log.success('Claude completed successfully');
        resolve();
      } else {
        log.error(`Claude failed with exit code ${code}`);
        reject(new Error(`Process exited with code ${code}`));
      }
    });

    running.on('error', (error) => {
      // Stop any remaining spinner
      if (currentSpinner) {
        currentSpinner.stop();
        currentSpinner = null;
      }

      log.error(error.message);
      reject(error);
    });
  });
};
