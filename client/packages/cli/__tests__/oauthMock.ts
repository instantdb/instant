import { Effect } from 'effect';
import { optOrPrompt, validateRequired } from '../src/lib/ui.ts';
import { UI } from '../src/ui/index.ts';
import { BadArgsError } from '../src/errors.ts';

type AnyEffect = Effect.Effect<any, any, any>;

export const makeOAuthMock = (mocks: {
  getAppsAuth: () => AnyEffect;
  addOAuthProvider: (params: any) => AnyEffect;
  addOAuthClient: (params: any) => AnyEffect;
}) => {
  const findName = (prefix: string, used: Set<string>) => {
    if (!used.has(prefix)) return prefix;
    for (let i = 2; ; i++) {
      const c = `${prefix}${i}`;
      if (!used.has(c)) return c;
    }
  };

  const getOrCreateProvider = Effect.fn(function* (type: string) {
    const auth: any = yield* mocks.getAppsAuth();
    const provider = auth.oauth_service_providers?.find(
      (e: any) => e.provider_name === type,
    );
    if (provider) return { auth, provider };
    const created: any = yield* mocks.addOAuthProvider({ providerName: type });
    return { auth, provider: created.provider };
  });

  const getClientNameAndProvider = Effect.fn(function* (
    providerType: string,
    opts: Record<string, unknown>,
  ) {
    const { auth, provider } = yield* getOrCreateProvider(providerType);
    const used: Set<string> = new Set(
      (auth.oauth_clients ?? []).map((c: any) => c.client_name),
    );
    const suggested = findName(providerType, used);
    const clientName = yield* optOrPrompt(opts.name, {
      simpleName: '--name',
      required: true,
      skipIf: false,
      prompt: {
        prompt: 'Client Name:',
        defaultValue: suggested,
        placeholder: suggested,
        validate: validateRequired,
        modifyOutput: UI.modifiers.piped([
          UI.modifiers.topPadding,
          UI.modifiers.dimOnComplete,
        ]),
      },
    });
    if (used.has(clientName || '')) {
      return yield* BadArgsError.make({
        message: `The unique name '${clientName}' is already in use.`,
      });
    }
    return { provider, clientName };
  });

  return {
    ...mocks,
    findName,
    getOrCreateProvider,
    getClientNameAndProvider,
  };
};
