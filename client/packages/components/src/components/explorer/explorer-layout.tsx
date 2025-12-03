import React from 'react';
import { useExplorerProps } from '.';
import { SchemaNamespace } from '@lib/types';
// Holds the explorer table itself and also the sidebar to select / create namespaces

export const ExplorerLayout = ({
  namespaces,
}: {
  namespaces: SchemaNamespace[];
}) => {
  const props = useExplorerProps();
  return <div>expolorer layout</div>;
};
