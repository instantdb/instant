import fs from "fs";

export type File = {
  fileName: string;
  pathName: string;
  name: string;
};

export function getFiles(): File[] {
  return fs.readdirSync("./pages/play").map((fileName) => {
    const name = fileName.replace(/\.tsx$/, "").replace(/\.jsx$/, "");
    const pathName = "/play/" + name;

    return { fileName, pathName, name };
  });
}
