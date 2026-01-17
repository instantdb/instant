import { i, init } from '@instantdb/react';

type BusinessEmail = string & { readonly __brand: unique symbol };

const schema = i.schema({
  entities: {
    leads: i.entity({
      email: i.string<BusinessEmail>(),
    }),
  },
});

const db = init({
  appId: 'my-app-id',
  schema,
});

const r = db.useQuery({
  leads: {},
});

const x = r.data?.leads[0];
x;
