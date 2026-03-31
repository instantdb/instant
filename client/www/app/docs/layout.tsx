import { connection } from 'next/server';

export default async function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  return <>{children}</>;
}
