import { ReactNode, createContext, useContext } from 'react';

export function createInitializedContext<
  Name extends string,
  T extends { ready: boolean; error?: any },
  InitArgs = undefined,
>(name: Name, cb: (args: InitArgs | undefined) => T) {
  const ctx = createContext<T | undefined>(undefined);

  return {
    use: () => {
      const context = useContext(ctx);
      if (!context) throw new Error(`No ${name} context!`);
      return context;
    },
    provider: ({
      children,
      loading,
      error,
      init,
    }: {
      children: ReactNode;
      loading?: ReactNode;
      error?: (error: any) => ReactNode;
      init?: InitArgs;
    }) => {
      const value = cb(init);

      if (value.error && error) {
        return <>{error(value.error)}</>;
      }

      if (!value.ready && loading) {
        return <>{loading}</>;
      }

      if (!value.ready) {
        return null;
      }

      return <ctx.Provider value={value}>{children}</ctx.Provider>;
    },
  };
}
