import { VisibilityState } from '@tanstack/react-table';
import { useState } from 'react';
import { SchemaAttr } from '../types';

export const useColumnVisibility = (props: {
  appId: string;
  namespaceId?: string;
  attrs: SchemaAttr[] | undefined;
}) => {
  const [visibility, setVisibility] = useState<VisibilityState>({});

  return [visibility, setVisibility] as const;
};
