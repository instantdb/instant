import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { StyleMe } from '@lib/components/StyleMe';
import type { HasDefault, WithDefaults, WithOptional } from '@lib/types';
import { config } from '@lib/config';
import { ExplorerLayout } from './explorer-layout';
import { useSchemaQuery } from '@lib/hooks/explorer';
import { useStableDB } from '@lib/hooks/useStableDB';
import ErrorBoundary from '@lib/components/error-boundary';

interface ExplorerProps {
  appId: string;
  adminToken: string;
  apiURI: HasDefault<string>;
  websocketURI: HasDefault<string>;
  darkMode: HasDefault<boolean>;

  className?: string;

  // state management
  // When undefined: uncontrolled mode (component manages its own state)
  // When null: controlled mode with no selection
  // When ExplorerNav: controlled mode with a selection
  explorerState: HasDefault<ExplorerNav | null | undefined>;
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
    pop: () => void;
    items: ExplorerNav[];
  };
}>({ props: null, history: { push: () => {}, pop: () => {}, items: [] } });

export const useExplorerProps = (): WithDefaults<ExplorerProps> => {
  const ctx = useContext(ExplorerPropsContext);
  if (!ctx.props) {
    throw new Error(
      'useExplorerProps must be used within an Explorer component',
    );
  }
  return ctx.props;
};

export const useExplorerState = () => {
  const ctx = useContext(ExplorerPropsContext);
  if (!ctx.props || !ctx.props.explorerState) {
    throw new Error(
      'useExplorerProps must be used within an Explorer component',
    );
  }
  return { explorerState: ctx.props.explorerState, history: ctx.history };
};

const isControlled = (props: WithOptional<ExplorerProps>): boolean => {
  // Component is controlled if explorerState prop is explicitly provided
  // (even if null - that means "no selection" in controlled mode)
  return (
    props.explorerState !== undefined || props.setExplorerState !== undefined
  );
};

const fillPropsWithDefaults = (
  input: WithOptional<ExplorerProps>,
  _explorerState: ExplorerNav | null,
  setExplorerState: React.Dispatch<React.SetStateAction<ExplorerNav | null>>,
): WithDefaults<ExplorerProps> => {
  const controlled = isControlled(input);
  return {
    ...input,
    apiURI: input.apiURI || config.apiURI,
    websocketURI: input.websocketURI || config.websocketURI,
    darkMode: input.darkMode === undefined ? false : input.darkMode,
    // In controlled mode, use the provided state (even if null)
    // In uncontrolled mode, use the internal state
    explorerState: controlled ? (input.explorerState ?? null) : _explorerState,
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

  if (!props.adminToken) {
    throw new Error('adminToken is required for explorer');
  }
  if (!props.appId) {
    throw new Error('appId is required for explorer');
  }

  // inside the component avoid setting explorer state directly
  // if change could be useful for history
  const { explorerState, setExplorerState } = props;

  const [explorerStateHistory, setExplorerStateHistory] = useState<
    ExplorerNav[]
  >([]);

  const pushExplorerState = useCallback(
    (filter: React.SetStateAction<ExplorerNav>, replace: boolean = false) => {
      setExplorerStateHistory((prev) => {
        if (!replace && explorerState) {
          return [...prev, explorerState];
        }
        return prev;
      });
      setExplorerState(filter as any);
    },
    [explorerState, setExplorerState],
  );

  const popExplorerState = useCallback(() => {
    setExplorerStateHistory((prev) => {
      if (prev.length > 0) {
        const [last, ...rest] = prev;
        setExplorerState(last);
        return rest;
      }
      return prev;
    });
  }, [setExplorerState]);

  const db = useStableDB({
    appId: props.appId,
    apiURI: props.apiURI,
    websocketURI: props.websocketURI,
    adminToken: props.adminToken,
  });

  // Track if this is the first render to avoid resetting on mount
  const isFirstRender = useRef(true);
  const prevAppId = useRef(props.appId);

  // Reset explorer history when appId changes (but not on initial mount)
  // Only reset internal state in uncontrolled mode - in controlled mode,
  // the parent component manages state resets
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (prevAppId.current !== props.appId) {
      prevAppId.current = props.appId;
      // Always reset history when app changes
      setExplorerStateHistory([]);
      // Only reset state in uncontrolled mode
      if (!isControlled(_props)) {
        _setExplorerState(null);
      }
    }
  }, [props.appId, _props]);

  const schemaData = useSchemaQuery(db);

  const contextValue = useMemo(
    () => ({
      props,
      history: {
        push: pushExplorerState,
        pop: popExplorerState,
        items: explorerStateHistory,
      },
    }),
    [props, pushExplorerState, popExplorerState, explorerStateHistory],
  );

  const Wrapper = props.useShadowDOM ? StyleMe : React.Fragment;

  return (
    <ExplorerPropsContext.Provider value={contextValue}>
      <Wrapper>
        <ErrorBoundary>
          <ExplorerLayout db={db} namespaces={schemaData.namespaces || []} />
        </ErrorBoundary>
      </Wrapper>
    </ExplorerPropsContext.Provider>
  );
};
