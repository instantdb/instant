import fs from 'fs';

type BugFile = {
  fileName: string;
  pathName: string;
  name: string;
};

export async function getStaticProps() {
  const bugFiles = fs
    .readdirSync('./pages/bugs')
    .filter((fileName) => fileName !== 'index.tsx' && fileName.endsWith('.tsx'))
    .map((fileName) => {
      const name = fileName.replace(/\.tsx$/, '');
      const pathName = '/bugs/' + name;
      return { fileName, pathName, name };
    });

  return {
    props: {
      bugFiles,
    },
  };
}

const BugsIndex = ({ bugFiles }: { bugFiles: BugFile[] }) => {
  return (
    <div className="max-w-md p-4">
      <h1 className="mb-4 text-xl font-bold">Bug Repros</h1>
      {bugFiles.map(({ pathName, name }) => (
        <div key={pathName}>
          <a href={pathName} className="text-blue-600 hover:underline">
            {name}
          </a>
        </div>
      ))}
    </div>
  );
};

export default BugsIndex;
