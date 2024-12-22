import { i, id, init, InstaQLEntity } from "@instantdb/admin";

const _schema = i.schema({ entities: { users: i.entity({ email: i.string() }) } });
type _AppSchema = typeof _schema; 
interface AppSchema extends _AppSchema {} 
const schema: AppSchema = _schema; 

const db = init({
  adminToken: "...",
  appId: "...",
  schema,
});

type Collection = keyof typeof schema.entities;

type Entity<T extends Collection> = InstaQLEntity<typeof schema, T, {}>;

export const newEntity = async <T extends Collection>(
  type: T,
  props: Omit<Entity<T>, "id">,
) => {
  const theId = id();
  await db.transact(db.tx[type][theId].update(props));
  return theId;
};

// seems good
const alice = await newEntity("users", { email: "alice@gmail.com" });

// Should be a typing error but is not
const bob = await newEntity("users", { blabla: "bob@gmail.com" });

// Should be a typing error but is not
const eve = await newEntity("users", { email: 123 });
