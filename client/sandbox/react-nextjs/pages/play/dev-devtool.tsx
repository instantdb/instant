import { init } from '@instantdb/react';
import config from '../../config';

let appId = config.appId;

if (typeof window !== 'undefined') {
  (window as any).DEV_DEVTOOL = true;

  const appIdParam = new URLSearchParams(location.search).get('app_id');
  if (appIdParam) {
    appId = appIdParam;
  }
}

const db = init({ ...config, appId });

export default function () {
  return (
    <div>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="p-4">
          Lorem ipsum dolor, sit amet consectetur adipisicing elit. Mollitia
          animi distinctio ex, facere sed error! Laudantium quis voluptatibus
          itaque ipsam! Mollitia iusto asperiores eligendi, esse cumque dolore
          sapiente vero perspiciatis.
        </div>
      ))}
    </div>
  );
}
