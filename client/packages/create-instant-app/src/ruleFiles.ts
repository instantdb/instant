import { Project } from './cli.js';
import fs from 'fs-extra';
import path from 'path';
import { PKG_ROOT } from './consts.js';

const FILENAME: Record<NonNullable<Project['ruleFiles']>, string> = {
  claude: 'CLAUDE.md',
  gemini: 'GEMINI.md',
  cursor: 'AGENTS.md',
  codex: 'AGENTS.md',
  zed: 'AGENTS.md',
  windsurf: 'AGENTS.md',
};

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
  fs.copyFileSync(
    path.join(PKG_ROOT, 'template/rules/AGENTS.md'),
    path.join(projectDir, FILENAME[ruleFilesToAdd]),
  );
};
