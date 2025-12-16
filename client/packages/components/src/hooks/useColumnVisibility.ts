import { VisibilityState } from '@tanstack/react-table';
import { useEffect, useState } from 'react';
import { SchemaAttr } from '../types';

const getColumnVisibilty = (appId: string) => {
  const possible = localStorage.getItem(`columnVisibility_${appId}`);
  if (!possible) {
    return {};
  }
  try {
    return JSON.parse(possible);
  } catch (error) {
    console.error('Failed to parse column visibility', error);
    return {};
  }
};

export const useColumnVisibility = (props: {
  appId: string;
  namespaceId?: string;
  attrs: SchemaAttr[] | undefined;
}) => {
  const [visibility, setVisibility] = useState<VisibilityState>(
    getColumnVisibilty(props.appId),
  );

  useEffect(() => {
    localStorage.setItem(
      `columnVisibility_${props.appId}`,
      JSON.stringify(visibility),
    );
  }, [props.appId, visibility]);

  useEffect(() => {
    setVisibility(getColumnVisibilty(props.appId));
  }, [props.appId]);

  return { visibility, setVisibility, attrs: props.attrs } as const;
};
