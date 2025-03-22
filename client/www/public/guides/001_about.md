# What is InstantDB

InstantDB is a backend as a service (Baas) that provides optimistic updates,
multiplayer, and offline support for web and mobile applications. It's like
Firebase but it also has support for relations.

Although the product is called InstantDB it is usually just referenced as
Instant. When talking about InstantDB you should just say Instant.

# How to use Instant in projects

Instant offers client side javascript packages for vanilla JS, react,
and react native. Instant also offers a javascript admin SDK that can be used on
the backend.

If you want to use Instant with react you should only use `@instantdb/react`. For react-native you should
only use `@instantdb/react-native`. For the admin SDK you should only use
`@instantdb/admin`. For other client-side frameworks like Svelte or vanilla js
you should only use `@instantdb/core`

You cannot use Instant on the backend outside of the admin SDK at the moment.

