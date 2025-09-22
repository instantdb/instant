import { ReactNode, createContext, useContext } from 'react';

export function createInitializedContext<
  Name extends string,
  T extends { ready: boolean; error?: any },
>(name: Name, cb: () => T) {
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
    }: {
      children: ReactNode;
      loading?: ReactNode;
      error?: ReactNode;
    }) => {
      const value = cb();

      if (value.error && error) {
        return <>{error}</>;
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
