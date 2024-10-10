### Instant Take-home: Implement a barebones instaql parser!

Although we think datalog is pretty neat, we know it's not something most
developers are familiar with. At Instant we want to meet developers where
they are at, so we provide a graphql-like interface to our datalog engine!

So instead of doing a datalog query like so:

```
query({
  find: ["?movies", "?attr", "?value"],
  where: [["?movies", "movie/id", "?movies"], ["?movies", "?attr", "?value"]]
})
```
Developers can do an instaql query instead:

```
query({
  movies: {}
})
```

With instaql, you can also specify filters

```
query({
  movies: { $: { where: { "year": 2000 } } }
})
```

And even fetch relations!

```
query({
  movies: { 
    people: {}
  }
})
```

Your task is to get all the tests passing in `__tests__/instaql.test.js`. Your solution
should leverage the datalog engine implemented for you in `src/datalog.js`

If you've never heard of datalog before, don't worry! You can learn the basics
at http://www.learndatalogtoday.org/

The datalog engine in this take home is <100 lines of code and we've written up a blog post to walk you through it
https://www.instantdb.com/essays/datalogjs

You can also check out the tests in `__tests__/datalog.test.js` to see how the
datalog engine works.

## Quick Start
You can get the the test suite running with the following steps

```
git clone ...
cd instant-take-home
npm i
npm run test:watch
```

And with that you're off to the races!


## Submission
This challenge shouldn't take more than 1-2 hours. When you're ready shoot over
an email to hello@instantdb.com with

1) A link to a repo with your solution
2) A few notes about your approach 

If we like your solution, we'll invite you to a final onsite interview where
we'll explore expanding on your solution and dive into some other fun problems
:)

Good luck! 🚀
