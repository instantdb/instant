import Link from 'next/link';

export default function () {
  return (
    <div>
      Hi i am a blank page
      <Link href="/play/ssr/with-fallback">Go to the page</Link>
    </div>
  );
}
