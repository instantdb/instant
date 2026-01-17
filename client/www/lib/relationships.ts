export type RelationshipKinds =
  | `many-many`
  | 'one-one'
  | 'one-many'
  | 'many-one';

export const relationshipConstraints: Record<
  RelationshipKinds,
  { cardinality: 'one' | 'many'; 'unique?': boolean }
> = {
  /**
   * users has_many tags
   * tags has_many users
   */
  'many-many': {
    cardinality: 'many',
    'unique?': false,
  },
  /**
   * users has_one profile
   * profiles has_one owner
   */
  'one-one': {
    cardinality: 'one',
    'unique?': true,
  },
  /**
   *  users has_many posts
   *  posts has_one author
   *  [?users :users/posts ?posts]
   *          <--------------->  unique!
   */
  'many-one': {
    cardinality: 'many',
    'unique?': true,
  },

  /**
   *  posts has_one owner
   *  users has_many owned_posts
   *  [?posts :posts/user ?users]
   *   <--------------->  unique!
   */
  'one-many': {
    cardinality: 'one',
    'unique?': false,
  },
};

export const relationshipConstraintsInverse: Record<string, RelationshipKinds> =
  Object.fromEntries(
    Object.entries(relationshipConstraints).map(([k, v]) => [
      `${v.cardinality}-${v['unique?']}`,
      k as RelationshipKinds,
    ]),
  );
