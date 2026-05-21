import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { capitalize } from 'lodash';
import { recipeFiles } from 'recipes';
import RecipePage from './recipe-page';

export async function generateStaticParams() {
  return recipeFiles.map((name) => ({ name }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const { name } = await params;
  if (!recipeFiles.includes(name)) return {};
  const title = capitalize(name.split('-').join(' '));
  return { title: `${title} · Instant Recipe` };
}

export default async function Page({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  if (!recipeFiles.includes(name)) notFound();
  return <RecipePage name={name} />;
}
