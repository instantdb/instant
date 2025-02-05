export type User = { id: string; email: string; refresh_token: string };

export type AuthResult =
  | { user: User | undefined; error: undefined }
  | { user: undefined; error: { message: string } };

export type AuthState =
  | { isLoading: true; error: undefined; user: undefined }
  | { isLoading: false; error: { message: string }; user: undefined }
  | { isLoading: false; error: undefined; user: User | null };

export type ConnectionStatus =
  | 'connecting'
  | 'opened'
  | 'authenticated'
  | 'closed'
  | 'errored';
