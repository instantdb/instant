export default {
  "tags": {
    "bind": [
      "isOwner",
      "auth.id in data.ref('posts.authors.userId')"
    ],
    "allow": {
      "view": "true",
      "create": "isOwner",
      "delete": "isOwner",
      "update": "isOwner"
    }
  },
  "posts": {
    "bind": [
      "isAuthor",
      "auth.id in data.ref('authors.userId')"
    ],
    "allow": {
      "view": "true",
      "create": "isAuthor",
      "delete": "isAuthor",
      "update": "isAuthor"
    }
  },
  "authors": {
    "bind": [
      "isAuthor",
      "auth.id == data.userId"
    ],
    "allow": {
      "view": "true",
      "create": "isAuthor",
      "delete": "isAuthor",
      "update": "isAuthor"
    }
  }
};