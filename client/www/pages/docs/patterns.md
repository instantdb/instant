---
title: Patterns
---

Below are some common patterns for working with InstantDB. We'll add more
patterns over time and if you have a pattern you'd like to share, please feel
free to submit a PR for this page.

## You can expose your app id to the client.

Similar to Firebase, the app id is a unique identifier for your application.
If you want to secure your data, you'll want to add
[permissions](/docs/permissions) for the app.

## Restrict creating new attributes.

When your ready to lock down your schema, you can restrict creating a new
attribute by adding this to your app's [permissions](/dash?t=perms)

```json
{
  "attrs": { "allow": { "create": "false" } }
}
```

This will prevent any new attributes from being created.

## Query all users and add additional attributes.

Right now we don't expose the auth table to the client or the dashboard. This
will change in the future. For now we recommend you manage you your own user
namespace. [Here's an example](https://github.com/instantdb/instant/blob/main/client/sandbox/react-nextjs/pages/patterns/manage-users.tsx)

## Specify attributes you want to query.

When you query a namespace, it will return all the attributes for an entity.
We don't currently support specifying which attributes you want to query. This
means if you have private data in an entity, or some larger data you want to
fetch sometimes, you'll want to split the entity into multiple namespaces.
[Here's an example](https://github.com/instantdb/instant/blob/main/client/sandbox/react-nextjs/pages/patterns/split-attributes.tsx)

