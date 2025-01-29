import { getAllSlugs } from '../../../lib/emails';

export async function getStaticProps() {
  return {
    props: { slugs: getAllSlugs() },
  };
}

export default function Page({ slugs }: { slugs: String[] }) {
  return (
    <div className="p-2 space-y-2">
      <p className="font-bold">Slugs</p>
      <div className="flex-col space-y-2">
        {slugs.map((e) => (
          <div>
            <a href={`/intern/emails/${e}`}>{e}</a>
          </div>
        ))}
      </div>
    </div>
  );
}
