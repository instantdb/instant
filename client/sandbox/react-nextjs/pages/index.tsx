import { File, getAppRouterFiles, getPageRouterFiles } from '../lib/files';

export async function getStaticProps() {
  const pageRouterFiles = getPageRouterFiles();
  const appRouterFiles = getAppRouterFiles();
  return {
    props: {
      pageRouterFiles,
      appRouterFiles,
    },
  };
}

const Home = ({
  pageRouterFiles,
  appRouterFiles,
}: {
  pageRouterFiles: File[];
  appRouterFiles: File[];
}) => {
  return (
    <div className="mx-w-md mx-auto p-4">
      <div>
        <strong>Pages Router</strong>
      </div>
      {pageRouterFiles.map(({ pathName, name }) => {
        return (
          <div key={pathName}>
            <a key={pathName} href={pathName}>
              {name}
            </a>
          </div>
        );
      })}
      <div>
        <strong>App Router</strong>
        {appRouterFiles.map(({ pathName, name }) => {
          return (
            <div key={pathName}>
              <a key={pathName} href={pathName}>
                {name}
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Home;
