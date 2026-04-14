import { test, expect, describe } from 'vitest';
import { makeWhere, resolveFilters, SearchFilter } from '../explorer';
import { ExplorerNav } from '../../components/explorer';

describe('makeWhere', () => {
  test('returns empty object when no navWhere and no filters', () => {
    expect(makeWhere(null, null)).toEqual({});
    expect(makeWhere(undefined, undefined)).toEqual({});
    expect(makeWhere(null, [])).toEqual({});
  });

  test('builds where clause from navWhere only', () => {
    const result = makeWhere(['user.id', 'abc-123'], null);
    expect(result).toEqual({ 'user.id': 'abc-123' });
  });

  test('builds where clause from search filters only', () => {
    const filters: SearchFilter[] = [['email', '$ilike', '%test%']];
    const result = makeWhere(null, filters);
    expect(result).toEqual({
      or: [{ email: { $ilike: '%test%' } }],
    });
  });

  test('handles = filter op', () => {
    const filters: SearchFilter[] = [['handle', '=', 'joe']];
    const result = makeWhere(null, filters);
    expect(result).toEqual({
      or: [{ handle: 'joe' }],
    });
  });

  test('handles $isNull filter op', () => {
    const filters: SearchFilter[] = [['name', '$isNull', null]];
    const result = makeWhere(null, filters);
    expect(result).toEqual({
      or: [{ name: { $isNull: true } }],
    });
  });
});

describe('resolveFilters', () => {
  test('uses navFilters when present', () => {
    const navFilters: SearchFilter[] = [['name', '=', 'test']];
    const localFilters: SearchFilter[] = [['email', '$ilike', '%foo%']];
    expect(resolveFilters(undefined, navFilters, localFilters)).toEqual(
      navFilters,
    );
  });

  test('uses local search filters when no navWhere and no navFilters', () => {
    const localFilters: SearchFilter[] = [['email', '$ilike', '%foo%']];
    expect(resolveFilters(undefined, undefined, localFilters)).toEqual(
      localFilters,
    );
  });

  test('does not apply stale local filters when navigating via relationship link', () => {
    const navWhere: [string, any] = ['user.id', 'abc-123'];
    const staleFilters: SearchFilter[] = [['email', '$ilike', '%test%']];

    const result = resolveFilters(navWhere, undefined, staleFilters);
    expect(result).toEqual([]);
  });

  test('navFilters take precedence even when navWhere is set', () => {
    const navWhere: [string, any] = ['user.id', 'abc-123'];
    const navFilters: SearchFilter[] = [['status', '=', 'active']];
    const localFilters: SearchFilter[] = [['email', '$ilike', '%foo%']];

    expect(resolveFilters(navWhere, navFilters, localFilters)).toEqual(
      navFilters,
    );
  });
});

describe('explorer history preserves filters', () => {
  test('filters survive link navigation and back', () => {
    // Simulates the explorer state history stack (mirrors pushExplorerState/popExplorerState)
    let explorerState: ExplorerNav = { namespace: 'users' };
    const history: ExplorerNav[] = [];

    // Step 1: User types a search, onSearchChange syncs filters to explorer state
    const searchFilters: SearchFilter[] = [['email', '$ilike', '%test%']];
    explorerState = { ...explorerState, filters: searchFilters };

    expect(
      resolveFilters(explorerState.where, explorerState.filters, searchFilters),
    ).toEqual(searchFilters);

    // Step 2: User clicks relationship link — current state saved to history
    history.push(explorerState);
    explorerState = { namespace: 'user_info', where: ['user.id', 'abc-123'] };

    // Stale filters should not leak to the new table
    expect(
      resolveFilters(explorerState.where, explorerState.filters, searchFilters),
    ).toEqual([]);

    // Step 3: User hits back — old state restored from history
    explorerState = history.pop()!;

    // Filters are restored from the saved state
    expect(explorerState.filters).toEqual(searchFilters);
    expect(
      resolveFilters(explorerState.where, explorerState.filters, []),
    ).toEqual(searchFilters);
  });
});
