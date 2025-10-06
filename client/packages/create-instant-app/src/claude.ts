import { spawn } from 'child_process';
import { execa } from 'execa';

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
  const claudePath = await findClaudePath();
  if (!claudePath) {
    throw new Error('Claude not found in path');
  }
  await execa(claudePath, [prompt], {
    stdio: 'inherit',
    cwd: projectDir,
  });
};
