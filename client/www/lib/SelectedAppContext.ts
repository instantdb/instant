import { createContext } from "react";

export const SelectedAppContext = createContext<{
  id: string;
  title: string;
} | null>(null);
