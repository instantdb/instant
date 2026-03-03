import { redirect } from 'next/navigation';
import { id } from '@instantdb/admin';

export default function Home() {
  redirect(`/chat/${id()}`);
}
