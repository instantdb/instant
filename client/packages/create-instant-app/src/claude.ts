import { exec } from 'child_process';
import { log } from '@clack/prompts';
import chalk from 'chalk';

interface ClaudeMessage {
  type: 'assistant' | 'user' | 'system' | 'result';
  message?: {
    content: Array<{ type: string; text?: string; name?: string; input?: any }>;
  };
  result?: string;
  subtype?: string;
}

const printClaudeMessage = (
  content: NonNullable<ClaudeMessage['message']>['content'][0],
) => {
  if (content.type === 'text' && content.text) {
    log.info(content.text);
  } else if (content.type === 'tool_use') {
    const input = content.input || {};
    let output = '';
    // Format based on tool type
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
        output = `> ${shortCmd}`;
        break;

      case 'LS':
        const path = input.path || '.';
        const shortLs =
          path === '.' ? 'current directory' : path.split('/').slice(-1)[0];
        output = `> ls ${shortLs}`;
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

    log.message(chalk.dim(output));
  }
};

export const promptClaude = async (prompt: string, projectDir: string) => {
  return new Promise<void>((resolve, reject) => {
    const running = exec(
      `claude --dangerously-skip-permissions --output-format stream-json -p --verbose "${prompt}"`,
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
            } else if (parsed.type === 'result' && parsed.result) {
              // Show very short result indication
              if (
                parsed.result.includes('success') ||
                parsed.result.includes('completed')
              ) {
                console.log('✓ Success');
              } else if (
                parsed.result.includes('error') ||
                parsed.result.includes('failed')
              ) {
                console.log('✗ Error');
              } else {
                console.log('✓ Done');
              }
            } else if (parsed.type === 'result' && parsed.result) {
              const truncated =
                parsed.result.length > 100
                  ? parsed.result.substring(0, 100) + '...'
                  : parsed.result;
              console.log(`📋 ${truncated}`);
            }
          } catch (error) {
            // If JSON parsing fails, treat as regular text output
            // log.message(line);
          }
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
      if (code === 0) {
        log.success('Claude completed successfully');
        resolve();
      } else {
        log.error(`Claude failed with exit code ${code}`);
        reject(new Error(`Process exited with code ${code}`));
      }
    });

    running.on('error', (error) => {
      log.error(error.message);
      reject(error);
    });
  });
};
