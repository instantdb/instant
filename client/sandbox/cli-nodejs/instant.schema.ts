// moo
// http://localhost:3000/dash?s=main&t=home&app=fd6db6f5-aad8-44df-aad9-e49ed8668967

import { i } from "@instantdb/core";

const INSTANT_APP_ID = "fd6db6f5-aad8-44df-aad9-e49ed8668967";

const graph = i.graph(
  INSTANT_APP_ID,
  {
    "authors": i.entity({
      "name": i.any(),
      "userId": i.any(),
    }),
    "posts": i.entity({
      "content": i.any(),
      "name": i.any(),
    }),
    "tags": i.entity({
      "label": i.any(),
    }),
  },
  {
    "authorsPosts": {
      "forward": {
        "on": "authors",
        "has": "many",
        "label": "posts"
      },
      "reverse": {
        "on": "posts",
        "has": "one",
        "label": "author"
      }
    },
    "postsTags": {
      "forward": {
        "on": "posts",
        "has": "many",
        "label": "tags"
      },
      "reverse": {
        "on": "tags",
        "has": "many",
        "label": "posts"
      }
    }
  }
);

export default graph;
