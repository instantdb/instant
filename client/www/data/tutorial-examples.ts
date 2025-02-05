import fs from 'fs';
import { capitalize } from 'lodash';
import { join } from 'path';

export type File = {
  code: string;
  name: string;
  fileName: string;
  pathName: string;
};

export type FilesRecord = Record<string, File>;

function readDirFiles(dir: string) {
  return fs.readdirSync(dir).map((fileName) => {
    const filePath = join(dir, fileName);

    return {
      fileName,
      filePath,
      code: fs.readFileSync(filePath, 'utf-8'),
    };
  });
}

export function getFiles(): Record<string, File> {
  return Object.fromEntries(
    [
      ...readDirFiles('./pages/tutorial-examples'),
      ...readDirFiles('./data/tutorial-snippets'),
    ].map(({ fileName, code }) => {
      const pathName = fileName.replace(/\.tsx$/, '');
      const name = capitalize(pathName.slice(2).split('-').join(' '));
      const _code = code
        .split('\n')
        .filter(
          (l) =>
            l.indexOf('// hide-line') === -1 &&
            l.indexOf('// @ts-nocheck') === -1,
        )
        .join('\n');

      return [pathName, { fileName, pathName, name, code: _code }];
    }),
  );
}
