import { BaseActor, Message } from './BaseActor.js';

export interface User {
  id: string;
  email?: string;
  refresh_token?: string;
  [key: string]: any;
}

export interface AuthState {
  user: User | null;
  error?: { message: string };
  isLoading: boolean;
}

/**
 * AuthActor manages authentication state.
 *
 * Receives:
 * - { type: 'auth:set-user', user: User | null }
 * - { type: 'auth:sign-in', ... }
 * - { type: 'auth:sign-out' }
 *
 * Publishes:
 * - { type: 'auth:changed', user, error, isLoading }
 * - { type: 'connection:send', eventId, message } -> for init
 */
export class AuthActor extends BaseActor<AuthState> {
  constructor(initialUser: User | null = null) {
    super('Auth', {
      user: initialUser,
      isLoading: false,
    });
  }

  receive(message: Message): void {
    switch (message.type) {
      case 'auth:set-user':
        this.setUser(message.user);
        break;

      case 'auth:get-user':
        this.publishAuthState();
        break;

      case 'auth:sign-out':
        this.setUser(null);
        break;
    }
  }

  private setUser(user: User | null): void {
    this.state = {
      ...this.state,
      user,
      error: undefined,
    };

    this.publishAuthState();
  }

  private publishAuthState(): void {
    this.publish({
      type: 'auth:changed',
      user: this.state.user,
      error: this.state.error,
      isLoading: this.state.isLoading,
    });
  }

  getUser(): User | null {
    return this.state.user;
  }

  isAuthenticated(): boolean {
    return this.state.user !== null;
  }
}
