---
title: Modeling data
---

## Overview

In this section we’ll learn how to model data using the Instant Explorer. By the end of this document you’ll know how to:

- Create namespaces and attributes
- Add indexes, unique constraints, and relationship-types
- Lock down your schema for production

We’ll build a micro-blog to illustrate. Our aim is to create the following data model:

```javascript
users {
  id: UUID,
  email: string :is_unique,
  handle: string :is_unique :is_indexed,
  createdAt: number,
  :has_many posts
  :has_one pin
}

posts {
  id: UUID,
  text: string,
  createdAt: number,
  :has_many comments,
  :belongs_to author :through users,
  :has_one pin
}

comments {
  id: UUID,
  text: string,
  :belongs_to post,
  :belongs_to author :through users
}

pins {
  id: UUID,
  :has_one post,
  :has_one author :through users
}
```

## Namespaces, attributes, data, and links.

There are four core building blocks to modeling data with Instant.

**1) Namespaces**

Namespaces house entities like `users`, `posts`, `comments`, `pins`. They are equivalent to “tables” in relational databases or “collections” in NoSQL.

**2) Attributes**

Attributes are properties associated with namespaces like `id`, `email`, `posts` for `users`. Attributes come in two flavors, **data** and **links**. They are equivalent to a “column” in relational databases or a “field” in NoSQL.

**3) Data Attributes**

Data attributes are facts about an entity. In our data model above these would be `id`, `email` , `handle` and `createdAt` for `users`

**4) Link Attributes**

Links connect two namespaces together. When you create a link you define a “name” and a “reverse attribute name.” For example the link between users and posts

- Has a **name** of “posts” connecting **users** to their **posts**
- Has a **reverse name** of “author” connecting **posts** to their **users**

Links can also have one of four relationship types: `many-to-many`, `many-to-one`, `one-to-many`, and `one-to-one`

Our micro-blog example has the following relationship types:

- **Many-to-one** between users and posts
- **One-to-one** between users and pins
- **Many-to-one** between posts and comments
- **Many-to-one** between users and comments
- **One-to-one** between posts and pins

---

Now that we’re familiar with namespaces, attributes, data, and links. we can start modeling our data.

## Create Namespaces

This is the most straight forward. After creating a new app in the dashboard you can simply press `+ Create` in the dashboard to add new namespaces.

{% callout type="note" %}

Aside from creating namespace in the explorer, namespaces are also automatically created the first time they are referenced when you call `transact` with `update`

For example. `transact(tx.hello[id()].update(…)` will make a `hello` namespace if one did not exist already.

{% /callout %}

## Create Data Attributes

Now that we have our namespaces, we can start adding attributes.

Let’s start by adding **data attributes** to `users`. You’ll notice an `id` attribute has already been made for you. Let’s create the following:

{% callout type="info" %}
`email` with a **unique constraint** so no two users have the same email

`handle` with a **unique constraint** so no two users have the same handle, and also an **index** because our application will use `handle` for fetching posts when browsing user profiles.

`createdAt` which doesn’t need any constraints or index.
{% /callout %}

Use the explorer in the Dashboard to create these data attributes. Here's the flow
for creating `handle`.

- 1: Click "Edit Schema" in the `users` namespace.
- 2: Click "New Attribute"
- 3: Configure away!

{% screenshot src="https://paper-attachments.dropboxusercontent.com/s_C781CC40E9D454E2FED6451745CECEBF732B63934549185154BCB3DAD0C7B532_1710517344495_Screenshot+2024-03-15+at+11.42.19AM.png" /%}

{% callout type="note" %}

Similar to namespaces, data attributes are automatically created the first time they are referenced when you call `transact` with `update`

For example, `transact(tx.users[id()].update({newAttribute: "hello world!"})` will create `newAttribute` on `users` if `newAttribute` did not exist before.

{% /callout %}

## Create Link Attributes

Next up we’ll create our link attributes on `user`. Specifically we want to
model:

* `users` can have many `posts` , but `posts` can only have one `users` via the label `author`

* `users` can only have one `pins`, and `pins` can only have one `users` via the label `author`

Again we can use the dashboard to set these up. Creating the `posts` link attribute
looks like

{% screenshot src="https://paper-attachments.dropboxusercontent.com/s_C781CC40E9D454E2FED6451745CECEBF732B63934549185154BCB3DAD0C7B532_1710784920480_image.png" /%}

And creating the `pins` link attribute looks like

{% screenshot src="https://paper-attachments.dropboxusercontent.com/s_C781CC40E9D454E2FED6451745CECEBF732B63934549185154BCB3DAD0C7B532_1710518041250_image.png" /%}

When creating links, attributes will show up under both namespaces! If you inspect the `posts` and `pins` namespaces in the explorer you should see both have an `author` attribute that links to `users`

{% callout type="note" %}
A many-to-many link attribute is automatically created the first time two namespaces are referenced when you call `transact` and `link`

For example, `transact(tx.users[id].link({pets: petId})` will create an attribute `pets` on `users` and a `users` attribute on `pets`

{% /callout %}

## Update or Delete Attributes and Namespaces

You can always modify or delete attributes after creating them. In the previous step we created the link attribute `users.pins` but we can rename it to `users.pin` as shown below.

{% screenshot src="https://paper-attachments.dropboxusercontent.com/s_C781CC40E9D454E2FED6451745CECEBF732B63934549185154BCB3DAD0C7B532_1710518379429_image.png" /%}

Similarly you can delete whole namespaces when editing their schema.

{% callout type="warning" %}
Be aware that deleting namespaces and attributes are irreversible operations!
{% /callout %}

## Secure your schema with permissions

In the earlier sections we mentioned that new `namespaces` and `attributes` can be created on the fly when you call `transact`. This can be useful for development, but you may not want this in production. To prevent changes to your schema on the fly, simply add these permissions to your app.

```javascript
{
  "attrs": {
    "allow": {
      "create": "false",
      "delete": "false",
      "update": "false"
    }
  },
  ... // other permissions
}
```

For our micro-blog example, it would look like this in the dashboard:

{% screenshot src="https://paper-attachments.dropboxusercontent.com/s_C781CC40E9D454E2FED6451745CECEBF732B63934549185154BCB3DAD0C7B532_1710519419773_image.png" /%}

With these permissions set you’ll still be able to make changes in the explorer, but client-side transactions that try to modify your schema will fail. This means your schema is safe from unwanted changes!

**If you've made it this far, congratulations! You should now be able to fully customize and lock down your data model. Huzzah!**
