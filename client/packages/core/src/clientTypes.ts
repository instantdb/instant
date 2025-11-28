export type User = {
  id: string;
  refresh_token: string;
  email?: string | null | undefined;
  imageURL?: string | null | undefined;
  type?: 'user' | 'guest' | undefined;
  isGuest: boolean;
};

export type AuthResult =
  | { user: User | undefined; error: undefined }
  | { user: undefined; error: { message: string } };

export type AuthState =
  | { isLoading: true; error: undefined; user: undefined }
  | { isLoading: false; error: { message: string }; user: undefined }
  | { isLoading: false; error: undefined; user: User | null | undefined };

export type ConnectionStatus =
  | 'connecting'
  | 'opened'
  | 'authenticated'
  | 'closed'
  | 'errored';
