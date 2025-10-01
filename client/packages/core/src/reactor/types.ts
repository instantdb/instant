export interface ReactorConfig {
  appId: string;
  websocketURI?: string;
  apiURI?: string;
  devtool?: boolean;
  verbose?: boolean;
  queryCacheLimit?: number;
  useDateObjects?: boolean;
  disableValidation?: boolean;
  schema?: any;
  cardinalityInference?: boolean;
  __adminToken?: string;
  [key: string]: unknown;
}

export interface MutationErrorDetails {
  message: string;
  hint?: unknown;
}
