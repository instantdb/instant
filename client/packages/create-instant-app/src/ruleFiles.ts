import { CliResults } from './cli.js';
import fs from 'fs-extra';
import path from 'path';
import { PKG_ROOT } from './consts.js';

export const addRuleFiles = ({
  projectDir,
  ruleFilesToAdd,
}: {
  projectDir: string;
  ruleFilesToAdd: CliResults['ruleFiles'];
}) => {
  ruleFilesToAdd.forEach((tool) => {
    switch (tool) {
      case 'claude':
        fs.copyFileSync(
          path.join(PKG_ROOT, 'template/rules/claude.md'),
          path.join(projectDir, 'CLAUDE.md'),
        );
        fs.copyFileSync(
          path.join(PKG_ROOT, 'template/rules/claude-rules.md'),
          path.join(projectDir, 'instant-rules.md'),
        );
        break;
      case 'cursor':
        fs.ensureDirSync(path.join(projectDir, '.cursor/rules'));
        fs.copyFileSync(
          path.join(PKG_ROOT, 'template/rules/cursor-rules.md'),
          path.join(projectDir, '.cursor/rules/instant.mdc'),
        );
        break;
      case 'windsurf':
        fs.ensureDirSync(path.join(projectDir, '.windsurf/rules'));
        fs.copyFileSync(
          path.join(PKG_ROOT, 'template/rules/windsurf-rules.md'),
          path.join(projectDir, '.windsurf/rules/instant.md'),
        );
        break;
      case 'zed':
        fs.copyFileSync(
          path.join(PKG_ROOT, 'template/rules/other-rules.md'),
          path.join(projectDir, 'AGENT.md'),
        );
        break;
      case 'codex':
        fs.copyFileSync(
          path.join(PKG_ROOT, 'template/rules/other-rules.md'),
          path.join(projectDir, 'AGENTS.md'),
        );
    }
  });
};
