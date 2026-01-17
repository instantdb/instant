import { Project } from './cli.js';
import fs from 'fs-extra';
import path from 'path';
import { PKG_ROOT } from './consts.js';

export const addRuleFiles = ({
  projectDir,
  ruleFilesToAdd,
}: {
  projectDir: string;
  ruleFilesToAdd: Project['ruleFiles'];
}) => {
  if (ruleFilesToAdd === null) {
    return;
  }
  switch (ruleFilesToAdd) {
    case 'cursor':
      fs.ensureDirSync(path.join(projectDir, '.cursor/rules'));
      fs.copyFileSync(
        path.join(PKG_ROOT, 'template/rules/cursor-rules.md'),
        path.join(projectDir, '.cursor/rules/instant.mdc'),
      );
      break;
    case 'claude':
      fs.copyFileSync(
        path.join(PKG_ROOT, 'template/rules/AGENTS.md'),
        path.join(projectDir, 'CLAUDE.md'),
      );
      break;
    case 'codex':
      fs.copyFileSync(
        path.join(PKG_ROOT, 'template/rules/AGENTS.md'),
        path.join(projectDir, 'AGENTS.md'),
      );
      break;
    case 'gemini':
      fs.copyFileSync(
        path.join(PKG_ROOT, 'template/rules/AGENTS.md'),
        path.join(projectDir, 'GEMINI.md'),
      );
      break;
    case 'zed':
      fs.copyFileSync(
        path.join(PKG_ROOT, 'template/rules/AGENTS.md'),
        path.join(projectDir, 'AGENTS.md'),
      );
      break;
    case 'windsurf':
      fs.ensureDirSync(path.join(projectDir, '.windsurf/rules'));
      fs.copyFileSync(
        path.join(PKG_ROOT, 'template/rules/windsurf-rules.md'),
        path.join(projectDir, '.windsurf/rules/instant.md'),
      );
      break;
  }
};
