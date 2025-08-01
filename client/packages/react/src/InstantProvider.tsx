import { createContext, ReactNode, useRef } from 'react';
import {
  InstantReactWebDatabase,
  InstantSchemaDef,
  Register,
} from './index.ts';

export type RegisteredSchema = Register extends { schema: infer Schema }
  ? Schema extends InstantSchemaDef<any, any, any>
    ? Schema
    : InstantSchemaDef<any, any, any>
  : InstantSchemaDef<any, any, any>;

type InstantContext = {
  db: InstantReactWebDatabase<RegisteredSchema>;
};

export const InstantContext = createContext<InstantContext>(null);

export const InstantProvider = (props: {
  children: ReactNode;
  db: InstantReactWebDatabase<RegisteredSchema>;
}) => {
  const db = useRef(props.db);

  if (db.current !== props.db) {
    db.current = props.db;
  }

  return (
    <InstantContext.Provider value={{ db: db.current }}>
      {props.children}
    </InstantContext.Provider>
  );
};
