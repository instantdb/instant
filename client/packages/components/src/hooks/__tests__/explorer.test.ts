import { test, expect, describe } from 'vitest';
import { makeWhere, resolveFilters, SearchFilter } from '../explorer';

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
