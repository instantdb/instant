import fs from 'fs';

export type File = {
  fileName: string;
  pathName: string;
  name: string;
};

export function getPageRouterFiles(): File[] {
  return fs.readdirSync('./pages/play').map((fileName) => {
    const name = fileName.replace(/\.tsx$/, '').replace(/\.jsx$/, '');
    const pathName = '/play/' + name;

    return { fileName, pathName, name };
  });
}

export function getAppRouterFiles(): File[] {
  return fs.readdirSync('./app/play').map((fileName) => {
    const name = fileName.replace(/\.tsx$/, '').replace(/\.jsx$/, '');
    const pathName = '/play/' + name;

    return { fileName, pathName, name };
  });
}
