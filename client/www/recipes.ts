import fs from 'fs';
import { capitalize } from 'lodash';

export type File = {
  code: string;
  name: string;
  fileName: string;
  pathName: string;
};

export function getFiles(): File[] {
  return fs.readdirSync('./pages/recipes').map((fileName) => {
    const pathName = fileName.replace(/\.tsx$/, '');
    const name = capitalize(pathName.slice(2).split('-').join(' '));
    const code = fs
      .readFileSync(`./pages/recipes/${fileName}`, 'utf-8')
      .replaceAll(`__getAppId()`, `"__YOUR_APP_ID__"`)
      .split('\n')
      .filter((l) => l.indexOf('// hide-line') === -1)
      .join('\n');

    return { fileName, pathName, name, code };
  });
}
