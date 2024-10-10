/*
 * Test cases based on http://www.learndatalogtoday.org/
 */
import facts from "../src/facts";
import { query as _query, createDB } from "../src/datalog";

const store = createDB(facts);
const query = (q) => _query(q, store).sort();

test("Find the entity ids of moviess made in 1987", () => {
  const act = query({
    find: ["?e"],
    where: [["?e", "movies/year", 1987]],
  });
  const exp = [[202], [203], [204]].sort();
  expect(act).toEqual(exp);
});

test("Find movies titles made in 1985", () => {
  const act = query({
    find: ["?title"],
    where: [
      ["?e", "movies/year", 1985],
      ["?e", "movies/title", "?title"],
    ],
  });
  const exp = [
    ["Commando"],
    ["Mad Max Beyond Thunderdome"],
    ["Rambo: First Blood Part II"],
  ].sort();
  expect(act).toEqual(exp);
});

test("Find movies titles and their year with Arnold", () => {
  const act = query({
    find: ["?title", "?year"],
    where: [
      ["?m", "movies/title", "?title"],
      ["?m", "movies/year", "?year"],
      ["?m", "movies/cast", "?p"],
      ["?p", "people/name", "Arnold Schwarzenegger"],
    ],
  });
  const exp = [
    ["Commando", 1985],
    ["Predator", 1987],
    ["Terminator 2: Judgment Day", 1991],
    ["Terminator 3: Rise of the Machines", 2003],
    ["The Terminator", 1984],
  ].sort();
  expect(act).toEqual(exp);
});

test("Find all info about the entity with id 200", () => {
  const act = query({
    find: ["?attr", "?value"],
    where: [[200, "?attr", "?value"]],
  });
  const exp = [
    ["movies/title", "The Terminator"],
    ["movies/year", 1984],
    ["movies/director", 100],
    ["movies/cast", 101],
    ["movies/cast", 102],
    ["movies/cast", 103],
    ["movies/sequel", 207],
  ].sort();
  expect(act).toEqual(exp);
});
