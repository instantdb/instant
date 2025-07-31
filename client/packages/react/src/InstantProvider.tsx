import { createContext, ReactNode, useRef } from 'react';
import { Register } from './index.ts';

type InstantContext = {
  db: Register['db'];
};

const InstantContext = createContext<InstantContext>(null);

export const InstantProvider = (props: {
  children: ReactNode;
  db: Register['db'];
}) => {
  const db = useRef(props.db);

  if (db.current !== props.db) {
    db.current = props.db;
  }

  return (
    <>
      <InstantContext.Provider value={{ db: db.current }}>
        {props.children}
      </InstantContext.Provider>
    </>
  );
};
