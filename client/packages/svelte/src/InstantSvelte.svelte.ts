/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	_init_internal,
	type Auth,
	type AuthState,
	coerceQuery,
	type Config,
	type ConfigWithSchema,
	type Exactly,
	type i,
	InstantClient,
	type InstaQLQueryParams,
	type LifecycleSubscriptionState,
	type Query,
	type RoomSchemaShape,
	type Storage,
	type SubscriptionState,
	type TransactionChunk,
	txInit
} from '@instantdb/core';
import { useQuery } from './useQuery.svelte';

export abstract class InstantSvelte<
	Schema extends i.InstantGraph<any, any> | {} = {},
	RoomSchema extends RoomSchemaShape = {},
	WithCardinalityInference extends boolean = false
> {
	public tx =
		txInit<Schema extends i.InstantGraph<any, any> ? Schema : i.InstantGraph<any, any>>();

	public auth: Auth;
	public storage: Storage;
	public _core: InstantClient<Schema, RoomSchema, WithCardinalityInference>;

	static Storage?: any;
	static NetworkListener?: any;

	constructor(config: Config | ConfigWithSchema<any>) {
		this._core = _init_internal<Schema, RoomSchema, WithCardinalityInference>(
			config,
			// @ts-expect-error because TS can't resolve subclass statics
			this.constructor.Storage,
			// @ts-expect-error because TS can't resolve subclass statics
			this.constructor.NetworkListener
		);
		this.auth = this._core.auth;
		this.storage = this._core.storage;
	}

	getLocalId = (name: string) => {
		return this._core.getLocalId(name);
	};

	/**
	 * Use this to write data! You can create, update, delete, and link objects
	 *
	 * @see https://instantdb.com/docs/instaml
	 *
	 * @example
	 *   // Create a new object in the `goals` namespace
	 *   const goalId = id();
	 *   db.transact(tx.goals[goalId].update({title: "Get fit"}))
	 *
	 *   // Update the title
	 *   db.transact(tx.goals[goalId].update({title: "Get super fit"}))
	 *
	 *   // Delete it
	 *   db.transact(tx.goals[goalId].delete())
	 *
	 *   // Or create an association:
	 *   todoId = id();
	 *   db.transact([
	 *    tx.todos[todoId].update({ title: 'Go on a run' }),
	 *    tx.goals[goalId].link({todos: todoId}),
	 *  ])
	 */
	transact = (chunks: TransactionChunk<any, any> | TransactionChunk<any, any>[]) => {
		return this._core.transact(chunks);
	};

	/**
	 * Use this to query your data!
	 *
	 * @see https://instantdb.com/docs/instaql
	 *
	 * @example
	 *  // listen to all goals
	 *  db.useQuery({ goals: {} })
	 *
	 *  // goals where the title is "Get Fit"
	 *  db.useQuery({ goals: { $: { where: { title: "Get Fit" } } } })
	 *
	 *  // all goals, _alongside_ their todos
	 *  db.useQuery({ goals: { todos: {} } })
	 *
	 *  // skip if `user` is not logged in
	 *  db.useQuery(auth.user ? { goals: {} } : null)
	 */
	useQuery = <
		Q extends Schema extends i.InstantGraph<any, any>
			? InstaQLQueryParams<Schema>
			: // @ts-expect-error type taken directly from Instant react source code
				Exactly<Query, Q>
	>(
		_query: null | Q
	): LifecycleSubscriptionState<Q, Schema, WithCardinalityInference> => {
		return useQuery(this._core, _query);
	};

	/**
	 * Listen for the logged in state. This is useful
	 * for deciding when to show a login screen.
	 *
	 * @see https://instantdb.com/docs/auth
	 * @example
	 * 	<script>
	 * 		import { db } from '$lib/db';
	 *  	const authState = db.useAuth()
	 *  </script>
	 *
	 * {#if authState.isLoading}
	 * 	<div>Loading...</div>
	 * {/if}
	 * {#if authState.error}
	 * 	<div>Uh oh! {authState.error.message}</div>
	 * {/if}
	 * {#if authState.user}
	 * 	<Main user={authState.user} />
	 * {:else}
	 * 	<Login />
	 * {/if}
	 *
	 */
	useAuth = (): AuthState => {
		let isLoading = $state<AuthState['isLoading']>(true);
		let user = $state<AuthState['user']>(undefined);
		let error = $state<AuthState['error']>(undefined);

		$effect(() => {
			const unsubscribe = this._core.subscribeAuth((result) => {
				isLoading = false;
				user = result.user;
				error = result.error;
			});

			return unsubscribe;
		});

		return {
			get isLoading() {
				return isLoading;
			},
			get user() {
				return user;
			},
			get error() {
				return error;
			}
		} as unknown as AuthState;
	};

	query = async <
		Q extends Schema extends i.InstantGraph<any, any>
			? InstaQLQueryParams<Schema>
			: // @ts-expect-error type taken directly from Instant react source code
				Exactly<Query, Q>
	>(
		_query: null | Q
	): Promise<SubscriptionState<Q, Schema, WithCardinalityInference>> => {
		const query = _query ? coerceQuery(_query) : null;
		let unsubscribe: () => void;
		const result = await new Promise<SubscriptionState<Q, Schema, WithCardinalityInference>>(
			(resolve, reject) => {
				unsubscribe = this._core.subscribeQuery(query, (result) => {
					if (result.error) {
						reject(result.error);
					}
					if (result.data) {
						resolve(result as SubscriptionState<Q, Schema, WithCardinalityInference>);
					}
				});
			}
		).then((result) => {
			unsubscribe();
			return result;
		});
		return result;
	};
}
