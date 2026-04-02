import { createContext, useContext } from 'react';

type ShadowRootContextType = {
  shadowRoot: ShadowRoot | null;
  container: HTMLDivElement | null;
  darkMode: boolean;
};

export const ShadowRootContext = createContext<ShadowRootContextType>({
  shadowRoot: null,
  container: null,
  darkMode: false,
});

export function useShadowRoot(): HTMLDivElement | null {
  return useContext(ShadowRootContext).container;
}

export function useShadowDarkMode(): boolean {
  return useContext(ShadowRootContext).darkMode;
}
