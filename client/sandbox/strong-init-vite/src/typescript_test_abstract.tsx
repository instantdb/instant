import { i, id, init, UpdateParams } from '@instantdb/admin';

const _schema = i.schema({
  entities: { users: i.entity({ email: i.string() }) },
});
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

const db = init({
  adminToken: '...',
  appId: '...',
  schema,
});

type Collection = keyof AppSchema['entities'];

type EntityUpdate<T extends Collection> = UpdateParams<typeof schema, T>;

export const newEntity = async <T extends Collection>(
  type: T,
  props: EntityUpdate<T>,
) => {
  const theId = id();
  await db.transact(db.tx[type][theId].update(props));
  return theId;
};

// seems good
const existing_attr_works = await newEntity('users', {
  email: 'alice@gmail.com',
});

// @ts-expect-error
const non_existing_attr_errors = await newEntity('users', {
  blabla: 'bob@gmail.com',
});

// @ts-expect-error
const wrong_type_errors = await newEntity('users', { email: 123 });

// to silence ts warnings
existing_attr_works;
non_existing_attr_errors;
wrong_type_errors;
