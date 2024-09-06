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
): LifecycleSubscriptionState<Q, Schema, WithCardinalityInference> => {
	const query = _query ? coerceQuery(_query) : null;

	let isLoading =
		$state<LifecycleSubscriptionState<Q, Schema, WithCardinalityInference>['isLoading']>(true);
	let data =
		$state<LifecycleSubscriptionState<Q, Schema, WithCardinalityInference>['data']>(undefined);
	let pageInfo =
		$state<LifecycleSubscriptionState<Q, Schema, WithCardinalityInference>['pageInfo']>(
			undefined
		);
	let error =
		$state<LifecycleSubscriptionState<Q, Schema, WithCardinalityInference>['error']>(undefined);

	$effect(() => {
		const unsubscribe = _core.subscribeQuery<Q>(query, (result) => {
			isLoading = !result;
			data = result?.data;
			pageInfo = result?.pageInfo;
			error = result?.error;
		});

		return unsubscribe;
	});

	return {
		get isLoading() {
			return isLoading;
		},
		get data() {
			return data;
		},
		get pageInfo() {
			return pageInfo;
		},
		get error() {
			return error;
		}
	} as unknown as LifecycleSubscriptionState<Q, Schema, WithCardinalityInference>;
};
