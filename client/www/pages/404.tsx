import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { NextPage } from 'next';

const Custom404: NextPage = () => {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;

    const path = router.asPath;

    // Special case for docs, might make senses for other paths too, but figured
    // would keep it simple for now
    const redirectPath = path.includes('/docs') ? '/docs' : '/';

    router.replace(redirectPath);
  }, [router.isReady]);

  return null;
};

export default Custom404;
