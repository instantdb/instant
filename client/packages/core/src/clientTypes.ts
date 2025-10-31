import { Expand } from './queryTypes.ts';
import { InstantSchemaDef, ResolveAttrs } from './schemaTypes.ts';

export type User = {
  id: string;
  refresh_token: string;
  email?: string | null | undefined;
  imageURL?: string | null | undefined;
  type?: 'user' | 'guest' | undefined;
  isGuest: boolean;
};

export type UserWithSchema<
  S extends InstantSchemaDef<any, any, any>,
  UseDates extends boolean,
> = Expand<ResolveAttrs<S['entities'], '$users', UseDates> & User>;

export type AuthResult<
  S extends InstantSchemaDef<any, any, any>,
  UseDates extends boolean,
> =
  | { user: UserWithSchema<S, UseDates> | undefined; error: undefined }
  | { user: undefined; error: { message: string } };

export type AuthState<
  S extends InstantSchemaDef<any, any, any>,
  UseDates extends boolean = false,
> =
  | { isLoading: true; error: undefined; user: undefined }
  | { isLoading: false; error: { message: string }; user: undefined }
  | {
      isLoading: false;
      error: undefined;
      user: UserWithSchema<S, UseDates> | null;
    };

export type ConnectionStatus =
  | 'connecting'
  | 'opened'
  | 'authenticated'
  | 'closed'
  | 'errored';
