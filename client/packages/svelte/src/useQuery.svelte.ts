/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	coerceQuery,
	type Exactly,
	i,
	InstantClient,
	type InstaQLQueryParams,
	type LifecycleSubscriptionState,
	type Query
} from '@instantdb/core';
import { untrack } from 'svelte';

export const useQuery = <
	Q extends Schema extends i.InstantGraph<any, any>
		? InstaQLQueryParams<Schema>
		: // @ts-expect-error type taken directly from Instant react source code
			Exactly<Query, Q>,
	Schema,
	WithCardinalityInference extends boolean
>(
	// @ts-expect-error type taken directly from Instant react source code
	_core: InstantClient<Schema, any, WithCardinalityInference>,
	_query: null | Q
): { state: LifecycleSubscriptionState<Q, Schema, WithCardinalityInference> } => {
	const query = _query ? coerceQuery(_query) : null;

	let state = $state({
		isLoading: true,
		data: undefined,
		pageInfo: undefined,
		error: undefined
	}) as unknown as LifecycleSubscriptionState<Q, Schema, WithCardinalityInference>;

	$effect(() => {
		const unsubscribe = _core.subscribeQuery<Q>(query, (result) => {
			untrack(() => {
				state = {
					isLoading: !result.data && !result.error,
					data: result.data,
					pageInfo: result.pageInfo,
					error: result.error
				} as unknown as LifecycleSubscriptionState<Q, Schema, WithCardinalityInference>;
			});
		});
		return unsubscribe;
	});

	return {
		get state() {
			return state;
		}
	};
};
