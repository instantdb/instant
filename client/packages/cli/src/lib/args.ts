/**
 * Args lets commands read CLI flags as a small pipeline:
 *
 * 1. Parse a value from opts
 * 2. Gate it: when is this flag available?
 * 3. Prompt for a missing value, when interactive
 * 4. Validate and finish as required or optional
 *
 * This keeps the "can this flag be used here?" logic next to the value it
 * controls. For example, a Google client secret is only meaningful when using
 * custom web credentials:
 *
 * const clientSecret = yield* Args.text(opts, 'client-secret').pipe(
 *   Args.availableWhen(usesCustomWebCredentials),
 *   Args.prompt(clientSecretPrompt({ providerUrl })),
 *   Args.required(),
 * );
 *
 * The key argument to text/bool/has is the exact opts lookup key. If the
 * user-facing flag name differs, pass simpleName for errors:
 *
 * Args.text(opts, 'customRedirectUri', { simpleName: '--custom-redirect-uri' })
 */
import { Effect } from 'effect';
import { pipeArguments, type Pipeable } from 'effect/Pipeable';
import { BadArgsError } from '../errors.ts';
import { GlobalOpts } from '../context/globalOpts.ts';
import { UI } from '../ui/index.ts';
import { runUIEffect } from './ui.ts';

type ActiveArg<A, E, R> = {
  readonly _tag: 'Active';
  readonly provided: boolean;
  readonly value: Effect.Effect<A | undefined, E, R>;
};

type InactiveArg = {
  readonly _tag: 'Inactive';
};

type ArgState<A, E, R, CanBeInactive extends boolean> =
  | ActiveArg<A, E, R>
  | (CanBeInactive extends true ? InactiveArg : never);

/**
 * A parsed CLI arg that can be composed with Args helpers.
 *
 * Commands usually create one with text() or bool(), then finish with
 * required() or optional().
 *
 * @example
 * const name = yield* Args.text(opts, 'name').pipe(
 *   Args.prompt({ prompt: 'Client Name:' }),
 *   Args.required(),
 * );
 */
export interface Arg<
  A,
  E = never,
  R = never,
  CanBeInactive extends boolean = false,
> extends Pipeable {
  readonly flag: string;
  readonly state: Effect.Effect<ArgState<A, E, R, CanBeInactive>, E, R>;
}

export type ArgOptions = {
  /**
   * Use when the opts key is not the user-facing flag name.
   *
   * @example
   * Args.text(opts, 'customRedirectUri', {
   *   simpleName: '--custom-redirect-uri',
   * })
   */
  simpleName?: string;
};

const makeArg = <A, E, R, CanBeInactive extends boolean>(
  flag: string,
  state: Effect.Effect<ArgState<A, E, R, CanBeInactive>, E, R>,
): Arg<A, E, R, CanBeInactive> => {
  const arg: Arg<A, E, R, CanBeInactive> = {
    flag,
    state,
    pipe() {
      return pipeArguments(this, arguments);
    },
  };
  return arg;
};

const active = <A, E, R>(
  value: Effect.Effect<A | undefined, E, R>,
  provided: boolean,
): ActiveArg<A, E, R> => ({ _tag: 'Active', provided, value });

const inactive: InactiveArg = { _tag: 'Inactive' };

const missingMessage = (flag: string) => `Missing required value for ${flag}`;

type MissingOptions = {
  message?: string;
};

type UnavailableOptions = {
  message?: string;
};

/**
 * @example
 * if (Args.has(opts, 'custom-redirect-uri')) {
 *   // The user explicitly passed --custom-redirect-uri.
 * }
 */
function has(opts: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(opts, key);
}

/**
 * @example
 * const configureWeb = Args.hasAny(opts, [
 *   'team-id',
 *   'key-id',
 *   'private-key-file',
 * ]);
 */
function hasAny(opts: Record<string, unknown>, keys: string[]) {
  return keys.some((key) => has(opts, key));
}

/**
 * Returns true only for boolean true or the string "true".
 *
 * @example
 * const useDevCredentials = Args.isTrue(opts, 'dev-credentials');
 */
function isTrue(opts: Record<string, unknown>, key: string) {
  const value = opts[key];
  return value === true || value === 'true';
}

/**
 * Starts a string arg pipeline. Strings are trimmed, numbers are stringified,
 * empty values become missing values, and other types produce BadArgsError.
 *
 * @example
 * const clientId = yield* Args.text(opts, 'client-id').pipe(
 *   Args.prompt(clientIdPrompt({ providerUrl })),
 *   Args.required(),
 * );
 */
function text(
  opts: Record<string, unknown>,
  key: string,
  options?: ArgOptions,
): Arg<string, BadArgsError> {
  const flag = options?.simpleName ?? `--${key}`;
  const provided = Object.prototype.hasOwnProperty.call(opts, key);

  return makeArg(
    flag,
    Effect.succeed(active(readTextValue(opts[key], flag), provided)),
  );
}

function readTextValue(value: unknown, flag: string) {
  return Effect.gen(function* readTextValue() {
    if (value === undefined || value === null) return undefined;

    if (typeof value === 'string' || typeof value === 'number') {
      const trimmed = String(value).trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }

    return yield* BadArgsError.make({
      message: `Invalid value for ${flag}`,
    });
  });
}

/**
 * Starts a boolean arg pipeline. Accepts booleans and the strings "true" or
 * "false"; other supplied values produce BadArgsError.
 *
 * @example
 * const configureWeb = yield* Args.bool(opts, 'configure-web').pipe(
 *   Args.confirm({ promptText: 'Configure web redirect flow?' }),
 *   Args.required(),
 * );
 */
function bool(
  opts: Record<string, unknown>,
  key: string,
  options?: ArgOptions,
): Arg<boolean, BadArgsError> {
  const flag = options?.simpleName ?? `--${key}`;
  const provided = Object.prototype.hasOwnProperty.call(opts, key);

  return makeArg(
    flag,
    Effect.succeed(active(readBooleanValue(opts[key], flag), provided)),
  );
}

function readBooleanValue(value: unknown, flag: string) {
  return Effect.gen(function* readBooleanValue() {
    if (value === undefined || value === null) return undefined;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;

    return yield* BadArgsError.make({
      message: `Invalid value for ${flag}`,
    });
  });
}

function uiErrorToBadArgs(e: { message: string }) {
  return BadArgsError.make({ message: `UI error: ${e.message}` });
}

function mapActive<A, B, E, R, E2, R2, CanBeInactive extends boolean>(
  wrapper: Arg<A, E, R, CanBeInactive>,
  mapValue: (
    value: Effect.Effect<A | undefined, E, R>,
  ) => Effect.Effect<B | undefined, E | E2, R | R2>,
): Arg<B, E | E2, R | R2, CanBeInactive> {
  return makeArg(
    wrapper.flag,
    Effect.gen(function* mapArgState() {
      const state = yield* wrapper.state;
      if (state._tag === 'Inactive') return inactive;
      return active(mapValue(state.value), state.provided);
    }) as Effect.Effect<
      ArgState<B, E | E2, R | R2, CanBeInactive>,
      E | E2,
      R | R2
    >,
  );
}

/**
 * Gates an arg behind a mode or earlier choice.
 *
 * If the condition is false and the user supplied the flag, this returns an
 * error.
 *
 * @example
 * const clientSecret = yield* Args.text(opts, 'client-secret').pipe(
 *   Args.availableWhen(appType === 'web'),
 *   Args.prompt(clientSecretPrompt({ providerUrl })),
 *   Args.required(),
 * );
 */
function availableWhen(condition: boolean, options?: UnavailableOptions) {
  return function availableWhenArg<A, E, R, CanBeInactive extends boolean>(
    arg: Arg<A, E, R, CanBeInactive>,
  ) {
    return makeArg<A, E | BadArgsError, R, true>(
      arg.flag,
      Effect.gen(function* gateArgAvailability() {
        const state = yield* arg.state;
        if (condition || state._tag === 'Inactive') return state;
        if (state.provided) {
          return yield* BadArgsError.make({
            message:
              options?.message ??
              `${arg.flag} is not compatible with other options`,
          });
        }
        return inactive;
      }),
    );
  };
}

/**
 * Prompts for a missing text value.
 *
 * With --yes, the prompt is skipped. If inputProps.defaultValue is set, that
 * value is used. Otherwise the value stays missing.
 *
 * @example
 * const clientName = yield* Args.text(opts, 'name').pipe(
 *   Args.prompt({
 *     prompt: 'Client Name:',
 *     defaultValue: suggestedClientName,
 *   }),
 *   Args.required(),
 * );
 */
function prompt(inputProps: UI.TextInputProps) {
  return function promptArg<E, R, CanBeInactive extends boolean>(
    arg: Arg<string, E, R, CanBeInactive>,
  ): Arg<string, E | BadArgsError, R | GlobalOpts, CanBeInactive> {
    return mapActive(arg, (valueEffect) =>
      Effect.gen(function* promptWhenMissing() {
        const value = yield* valueEffect;
        if (value !== undefined) return value;

        const { yes } = yield* GlobalOpts;
        const result = yes
          ? inputProps.defaultValue
          : yield* runUIEffect(new UI.TextInput(inputProps)).pipe(
              Effect.catchTag('UIError', uiErrorToBadArgs),
            );
        if (result === undefined) return undefined;

        const trimmed = result.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      }),
    );
  };
}

/**
 * Prompts for a missing boolean value.
 *
 * With --yes, the prompt is skipped and confirmationProps.defaultValue is used.
 *
 * @example
 * const configureWeb = yield* Args.bool(opts, 'configure-web').pipe(
 *   Args.confirm({
 *     promptText: 'Configure web redirect flow?',
 *     defaultValue: false,
 *   }),
 *   Args.required(),
 * );
 */
function confirm(confirmationProps: UI.ConfirmationProps) {
  return function confirmArg<E, R, CanBeInactive extends boolean>(
    arg: Arg<boolean, E, R, CanBeInactive>,
  ): Arg<boolean, E | BadArgsError, R | GlobalOpts, CanBeInactive> {
    return mapActive(arg, (valueEffect) =>
      Effect.gen(function* confirmWhenMissing() {
        const value = yield* valueEffect;
        if (value !== undefined) return value;

        const { yes } = yield* GlobalOpts;
        if (yes) return confirmationProps.defaultValue;

        return yield* runUIEffect(new UI.Confirmation(confirmationProps)).pipe(
          Effect.catchTag('UIError', uiErrorToBadArgs),
        );
      }),
    );
  };
}

/**
 * Validates a present value. Return an error message to fail, or undefined to
 * accept the value. Missing and inactive args pass through unchanged.
 *
 * @example
 * const projectId = yield* Args.text(opts, 'project-id').pipe(
 *   Args.prompt(firebaseProjectIdPrompt({})),
 *   Args.validate(validateFirebaseProjectId),
 *   Args.required(),
 * );
 */
function validate<A>(validator: (value: A) => string | undefined) {
  return function validateArg<E, R, CanBeInactive extends boolean>(
    arg: Arg<A, E, R, CanBeInactive>,
  ): Arg<A, E | BadArgsError, R, CanBeInactive> {
    return mapActive(arg, (valueEffect) =>
      Effect.gen(function* validateValue() {
        const value = yield* valueEffect;
        if (value === undefined) return undefined;

        const message = validator(value);
        if (!message) return value;

        return yield* BadArgsError.make({ message });
      }),
    );
  };
}

/**
 * Finishes a pipeline with a required value.
 *
 * Missing active args produce BadArgsError. Inactive args return undefined, so
 * callers can skip downstream work for unavailable flags.
 *
 * @example
 * const clientId = yield* Args.text(opts, 'client-id').pipe(
 *   Args.prompt(clientIdPrompt({ providerUrl })),
 *   Args.required(),
 * );
 */
function required(options?: MissingOptions) {
  return function requiredArg<A, E, R, CanBeInactive extends boolean>(
    arg: Arg<A, E, R, CanBeInactive>,
  ): Effect.Effect<
    CanBeInactive extends true ? A | undefined : A,
    E | BadArgsError,
    R
  > {
    return Effect.gen(function* requireValue() {
      const state = yield* arg.state;
      if (state._tag === 'Inactive') return undefined;

      const value = yield* state.value;
      if (value !== undefined) return value;

      return yield* BadArgsError.make({
        message: options?.message ?? missingMessage(arg.flag),
      });
    }) as Effect.Effect<
      CanBeInactive extends true ? A | undefined : A,
      E | BadArgsError,
      R
    >;
  };
}

/**
 * Finishes a pipeline with an optional value.
 *
 * Missing and inactive args return undefined.
 *
 * @example
 * const customRedirectUri = yield* Args.text(opts, 'custom-redirect-uri').pipe(
 *   Args.prompt(optionalRedirectPrompt),
 *   Args.optional(),
 * );
 */
function optional() {
  return function optionalArg<A, E, R, CanBeInactive extends boolean>(
    arg: Arg<A, E, R, CanBeInactive>,
  ) {
    return Effect.gen(function* optionalValue() {
      const state = yield* arg.state;
      if (state._tag === 'Inactive') return undefined;

      return yield* state.value;
    });
  };
}

export const Args = {
  text,
  bool,
  has,
  hasAny,
  isTrue,
  availableWhen,
  prompt,
  confirm,
  validate,
  required,
  optional,
};
