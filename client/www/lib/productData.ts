import { ComponentType, SVGProps } from 'react';
import {
  CircleStackIcon,
  LockClosedIcon,
  ArrowPathIcon,
  FolderIcon,
  CodeBracketIcon,
} from '@heroicons/react/24/outline';

export type Product = {
  id: string;
  name: string;
  tagline: string;
};

export const products: Product[] = [
  {
    id: 'database',
    name: 'Database',
    tagline:
      'Everything you need to build web and mobile apps with your favorite LLM.',
  },
  {
    id: 'auth',
    name: 'Auth',
    tagline: 'No split brain. Easy setup. Fine-grained access control.',
  },
  {
    id: 'sync',
    name: 'Sync Engine',
    tagline:
      'Every feature feels instant, is collaborative, and works offline.',
  },
  {
    id: 'storage',
    name: 'Storage',
    tagline: 'Digital content is just another table in your database.',
  },
  {
    id: 'admin-sdk',
    name: 'Admin SDK',
    tagline: 'Use Instant on your backend',
  },
];

export const productIcons: Record<
  string,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  database: CircleStackIcon,
  auth: LockClosedIcon,
  sync: ArrowPathIcon,
  storage: FolderIcon,
  'admin-sdk': CodeBracketIcon,
};
