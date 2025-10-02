import { Project } from './cli.js';
import fs from 'fs-extra';
import path from 'path';
import { PKG_ROOT } from './consts.js';

export const addRuleFiles = ({
  projectDir,
  base,
  ruleFilesToAdd,
}: {
  projectDir: string;
  base: Project['base'];
  ruleFilesToAdd: Project['ruleFiles'];
}) => {
  if (ruleFilesToAdd === null) {
    return;
  }
  switch (ruleFilesToAdd) {
    case 'claude':
      fs.copyFileSync(
        path.join(PKG_ROOT, `template/rules/${base}/claude.md`),
        path.join(projectDir, 'CLAUDE.md'),
      );
      fs.copyFileSync(
        path.join(PKG_ROOT, `template/rules/${base}/claude-rules.md`),
        path.join(projectDir, 'instant-rules.md'),
      );
      break;
    case 'cursor':
      fs.ensureDirSync(path.join(projectDir, '.cursor/rules'));
      fs.copyFileSync(
        path.join(PKG_ROOT, `template/rules/${base}/cursor-rules.md`),
        path.join(projectDir, '.cursor/rules/instant.mdc'),
      );
      break;
    case 'windsurf':
      fs.ensureDirSync(path.join(projectDir, '.windsurf/rules'));
      fs.copyFileSync(
        path.join(PKG_ROOT, `template/rules/${base}/windsurf-rules.md`),
        path.join(projectDir, '.windsurf/rules/instant.md'),
      );
      break;
    case 'zed':
      fs.copyFileSync(
        path.join(PKG_ROOT, `template/rules/${base}/other-rules.md`),
        path.join(projectDir, 'AGENT.md'),
      );
      break;
    case 'codex':
      fs.copyFileSync(
        path.join(PKG_ROOT, `template/rules/${base}/other-rules.md`),
        path.join(projectDir, 'AGENTS.md'),
      );
  }
};
