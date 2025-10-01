export interface PersistedMutationStore {
  currentValue: Map<string, any>;
  isLoading(): boolean;
  version(): number;
  set(updater: (prev: Map<string, any>) => Map<string, any>): void;
}
