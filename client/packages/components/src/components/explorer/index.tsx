import React, { createContext, useContext } from 'react';
import { StyleMe } from '@lib/components/StyleMe';
import type { HasDefault, WithDefaults, WithOptional } from '@lib/types';
import { config } from '@lib/config';

interface ExplorerProps {
  appId: string;
  adminToken: string;
  apiURI: HasDefault<string>;
  websocketURI: HasDefault<string>;
  darkMode: HasDefault<boolean>;
}

const ExplorerPropsContext = createContext<WithDefaults<ExplorerProps> | null>(
  null,
);

export const useExplorerProps = (): WithDefaults<ExplorerProps> => {
  const props = useContext(ExplorerPropsContext);
  if (!props) {
    throw new Error(
      'useExplorerProps must be used within an Explorer component',
    );
  }

  return props;
};

const fillDefaults = (
  input: WithOptional<ExplorerProps>,
): WithDefaults<ExplorerProps> => {
  return {
    ...input,
    apiURI: input.apiURI || config.apiURI,
    websocketURI: input.websocketURI || config.websocketURI,
    darkMode: input.darkMode || false,
  };
};

export type SearchFilterOp =
  | '='
  | '$ilike'
  | '$like'
  | '$gt'
  | '$lt'
  | '$isNull';
export type SearchFilter = [string, SearchFilterOp, any];
export interface ExplorerNav {
  namespace?: string;
  where?: [string, any];
  sortAttr?: string;
  sortAsc?: boolean;
  filters?: SearchFilter[];
  limit?: number;
  page?: number;
}

export type PushNavStack = (nav: ExplorerNav) => void;

export const Explorer = (props: WithOptional<ExplorerProps>) => {
  const filledProps: WithDefaults<ExplorerProps> = fillDefaults(props);
  return (
    <StyleMe>
      <ExplorerPropsContext.Provider value={filledProps}>
        <div className="tw-preflight bg-red-400 p-2">
          {filledProps.adminToken} {filledProps.appId}
          <p>This is the explorer</p>
        </div>
      </ExplorerPropsContext.Provider>
    </StyleMe>
  );
};
