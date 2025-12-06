import React, { createContext, useContext, useState } from 'react';
import { StyleMe } from '@lib/components/StyleMe';
import type { HasDefault, WithDefaults, WithOptional } from '@lib/types';
import { config } from '@lib/config';
import { ExplorerLayout } from './explorer-layout';
import { useSchemaQuery } from '@lib/hooks/explorer';
import { useStableDB } from '@lib/hooks/useStableDB';

interface ExplorerProps {
  appId: string;
  adminToken: string;
  apiURI: HasDefault<string>;
  websocketURI: HasDefault<string>;
  darkMode: HasDefault<boolean>;

  // state management
  explorerState: HasDefault<ExplorerNav | null>;
  setExplorerState: HasDefault<
    React.Dispatch<React.SetStateAction<ExplorerNav | null>>
  >;
  useShadowDOM: HasDefault<boolean>;
}

const ExplorerPropsContext = createContext<{
  props: WithDefaults<ExplorerProps> | null;
  history: {
    push: (
      filter: React.SetStateAction<ExplorerNav>,
      replace?: boolean,
    ) => void;
  };
}>({ props: null, history: { push: () => {} } });

export const useExplorerProps = (): WithDefaults<ExplorerProps> => {
  const ctx = useContext(ExplorerPropsContext);
  if (!ctx.props) {
    throw new Error(
      'useExplorerProps must be used within an Explorer component',
    );
  }
  return ctx.props;
};

// TODO rewrite this to return history stuff
export const useExplorerState = () => {
  const ctx = useContext(ExplorerPropsContext);
  if (!ctx.props || !ctx.props.explorerState) {
    throw new Error(
      'useExplorerProps must be used within an Explorer component',
    );
  }
  return { explorerState: ctx.props.explorerState, history: ctx.history };
};

const fillPropsWithDefaults = (
  input: WithOptional<ExplorerProps>,
  _explorerState: ExplorerNav | null,
  setExplorerState: React.Dispatch<React.SetStateAction<ExplorerNav | null>>,
): WithDefaults<ExplorerProps> => {
  return {
    ...input,
    apiURI: input.apiURI || config.apiURI,
    websocketURI: input.websocketURI || config.websocketURI,
    darkMode: input.darkMode || false,
    explorerState: input.explorerState || _explorerState,
    setExplorerState: input.setExplorerState || setExplorerState,
    useShadowDOM: input.useShadowDOM || false,
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
  namespace: string;
  where?: [string, any];
  sortAttr?: string;
  sortAsc?: boolean;
  filters?: SearchFilter[];
  limit?: number;
  page?: number;
}

export const Explorer = (_props: WithOptional<ExplorerProps>) => {
  // backup useState if explorer is uncontrolled component
  const [_explorerState, _setExplorerState] = useState<ExplorerNav | null>(
    null,
  );

  const props: WithDefaults<ExplorerProps> = fillPropsWithDefaults(
    _props,
    _explorerState,
    _setExplorerState,
  );

  // inside the component avoid setting explorer state directly
  // if change could be useful for history
  const { explorerState, setExplorerState } = props;

  const [explorerStateHistory, setExplorerStateHistory] = useState<
    ExplorerNav[]
  >(explorerState ? [explorerState] : []);

  const pushExplorerState = (
    filter: React.SetStateAction<ExplorerNav>,
    replace: boolean = false,
  ) => {
    if (!replace && explorerState !== null) {
      setExplorerStateHistory([...explorerStateHistory, explorerState]);
    }
    setExplorerState(filter as any);
  };

  const db = useStableDB({
    appId: props.appId,
    apiURI: props.apiURI,
    websocketURI: props.websocketURI,
    adminToken: props.adminToken,
  });

  const schemaData = useSchemaQuery(db);

  let Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <>{children}</>
  );

  if (props.useShadowDOM) {
    Wrapper = ({ children }) => <StyleMe>{children}</StyleMe>;
  }

  if (schemaData.namespaces === null) {
    return null;
  }

  return (
    <Wrapper>
      <ExplorerPropsContext.Provider
        value={{
          props,
          history: {
            push: pushExplorerState,
          },
        }}
      >
        <ExplorerLayout db={db} namespaces={schemaData.namespaces} />
      </ExplorerPropsContext.Provider>
    </Wrapper>
  );
};
