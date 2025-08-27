import { spawn } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import * as p from '@clack/prompts';
import type { ContentBlock, ToolUseBlock } from '@anthropic-ai/sdk/resources';
import { HIDE_CURSOR, wrappedWindowOutput } from './utils/logger.js';
import { query } from '@anthropic-ai/claude-code';

let currentSpinner: ReturnType<typeof ora> | null = null;

const getSpinnerText = (content: ToolUseBlock) => {
  const input = content.input || ({} as any);
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

const printClaudeMessage = (content: ContentBlock) => {
  if (content.type === 'text' && content.text) {
    // Stop any existing spinner before showing text
    if (currentSpinner) {
      currentSpinner.stop();
      process.stdout.write(HIDE_CURSOR);
      currentSpinner = null;
    }

    wrappedWindowOutput(content.text, p.log.info, true);
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
      // we are sending control characters to hide the cursor manually
      hideCursor: false,
      prefixText: chalk.gray('│ '),
    }).start();
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
  process.stdout.write(HIDE_CURSOR);
  for await (const message of query({
    options: {
      cwd: projectDir,
      appendSystemPrompt:
        'Do not use the instant mcp server to create a new app, a fresh app id has already been placed in the .env file. Do not attempt to start a dev server.',
      permissionMode: 'bypassPermissions', // todo: make more strict
      env: process.env,
    },
    prompt: prompt,
  })) {
    if (message.type === 'system') {
    } else if (message.type === 'assistant') {
      message.message.content.forEach((content) => {
        printClaudeMessage(content);
      });
    } else if (message.type === 'result') {
    }
  }
};
