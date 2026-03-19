import { createContext, useContext } from 'react';
import type { InstantDB } from './types';

const RecipeDBContext = createContext<InstantDB | null>(null);
export const RecipeDBProvider = RecipeDBContext.Provider;

export function useRecipeDB(): InstantDB {
  const db = useContext(RecipeDBContext);
  if (!db) throw new Error('useRecipeDB must be used within RecipeDBProvider');
  return db;
}
