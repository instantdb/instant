import { createDB } from "../src/datalog";
import query from "../src/instaql";

test("query returns all fields for movies", () => {
  const db = createDB([
    [100, "movies/id", 100],
    [100, "movies/title", "Moop"],
    [100, "movies/year", 1900],
    [101, "movies/id", 101],
    [101, "movies/title", "Woop"],
    [101, "movies/year", 2000],
    [102, "people/id", 102],
  ]);
  const { movies } = query({ movies: {} }, db);
  expect(movies).toEqual([
    { id: 100, title: "Moop", year: 1900 },
    { id: 101, title: "Woop", year: 2000 },
  ]);
});

test("return fields for a specific movies", () => {
  const db = createDB([
    ["Moop", "movies/id", "Moop"],
    ["Moop", "movies/title", "Moop"],
    ["Moop", "movies/year", 1900],
    ["Woop", "movies/id", "Woop"],
    ["Woop", "movies/title", "Woop"],
    ["Woop", "movies/year", 2000],
  ]);
  const { movies } = query({
    movies: {
      $: {
        where: { year: 1900 },
      },
    },
  }, db);
  expect(movies).toEqual([{ id: "Moop", title: "Moop", year: 1900 }]);
});

test("query returns all moviess and peoples and ignores references", () => {
  const db = createDB([
    [100, "movies/id", 100],
    [100, "movies/title", "Moop"],
    [100, "movies/year", 1900],
    [200, "movies/id", 200],
    [200, "movies/title", "Woop"],
    [200, "movies/year", 2000],
    ["Joe", "people/id", "Joe"],
    ["Joe", "people/name", "Joe"],
    ["Stopa", "people/id", "Stopa"],
    ["Stopa", "people/name", "Stopa"],
    [100, "$ref$movies$people", "Joe"],
    [100, "$ref$movies$people", "Stopa"],
    [200, "$ref$movies$people", "Stopa"],
  ]);
  const { movies, people } = query({ movies: {}, people: {} }, db);
  expect(movies).toEqual([
    { id: 100, title: "Moop", year: 1900 },
    { id: 200, title: "Woop", year: 2000 },
  ]);
  expect(people).toEqual([
    { id: "Joe", name: "Joe" },
    { id: "Stopa", name: "Stopa" },
  ]);
});


test("returns cast for movies", () => {
  const db = createDB([
    [100, "movies/id", 100],
    [100, "movies/title", "Moop"],
    [100, "movies/year", 1900],
    [200, "movies/id", 200],
    [200, "movies/title", "Woop"],
    [200, "movies/year", 2000],
    ["Joe", "people/id", "Joe"],
    ["Joe", "people/name", "Joe"],
    ["Stopa", "people/id", "Stopa"],
    ["Stopa", "people/name", "Stopa"],
    [100, "$ref$movies$people", "Joe"],
    [100, "$ref$movies$people", "Stopa"],
    [200, "$ref$movies$people", "Stopa"],
  ]);
  const { movies } = query({
    movies: {
      people: {},
    },
  }, db);
  expect(movies).toEqual([
    {
      id: 100,
      title: "Moop",
      year: 1900,
      people: [
        { id: "Joe", name: "Joe" },
        { id: "Stopa", name: "Stopa" },
      ],
    },
    {
      id: 200,
      title: "Woop",
      year: 2000,
      people: [{ id: "Stopa", name: "Stopa" }],
    },
  ]);
});

test("returns specific cast for movies", () => {
  const db = createDB([
    ["Moop", "movies/id", "Moop"],
    ["Moop", "movies/title", "Moop"],
    ["Moop", "movies/year", 1900],
    ["Woop", "movies/id", "Woop"],
    ["Woop", "movies/title", "Woop"],
    ["Woop", "movies/year", 2000],
    ["Joe", "people/id", "Joe"],
    ["Joe", "people/name", "Joe"],
    ["Stopa", "people/id", "Stopa"],
    ["Stopa", "people/name", "Stopa"],
    ["Moop", "$ref$movies$people", "Joe"],
    ["Moop", "$ref$movies$people", "Stopa"],
    ["Woop", "$ref$movies$people", "Stopa"],
  ]);
  const { movies } = query({
    movies: {
      people: { $: { where: { name: "Joe" } } },
    },
  }, db);
  expect(movies).toEqual([
    {
      id: "Moop",
      title: "Moop",
      year: 1900,
      people: [{ id: "Joe", name: "Joe" }],
    },
    { id: "Woop", title: "Woop", year: 2000, people: [] },
  ]);
});

test("nests deep", () => {
  const db = createDB([
    ["Moop", "movies/id", "Moop"],
    ["Moop", "$ref$movies$people", "Joe"],
    ["Joe", "people/id", "Joe"],
    ["Joe", "$ref$people$pet", "Tobi"],
    ["Tobi", "pet/id", "Tobi"],
  ]);
  const { movies } = query({
    movies: {
      people: { pet: {} },
    },
  }, db);
  expect(movies).toEqual([
    { id: "Moop", people: [{ id: "Joe", pet: [{ id: "Tobi" }] }] },
  ]);
});
