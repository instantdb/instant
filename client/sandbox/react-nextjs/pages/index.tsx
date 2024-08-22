import { File, getFiles } from "../lib/pages";

export async function getStaticProps() {
  const files = getFiles();

  return {
    props: {
      files,
    },
  };
}

const Home = ({ files }: { files: File[] }) => {
  return (
    <div className="mx-w-md mx-auto p-4">
      {files.map(({ pathName, name }) => {
        return (
          <div key={pathName}>
            <a key={pathName} href={pathName}>
              {name}
            </a>
          </div>
        );
      })}
    </div>
  );
};

export default Home;
