/*
  * Datalog in < 100 lines of code!
  * To learn more about how this works, check out the blog post:
  * https://www.instantdb.com/essays/datalogjs
  */
function isVariable(x) {
  return typeof x === "string" && x.startsWith("?");
}

function matchVariable(variable, triplePart, context) {
  if (context.hasOwnProperty(variable)) {
    const bound = context[variable];
    return matchPart(bound, triplePart, context);
  }
  return { ...context, [variable]: triplePart };
}

function matchPart(patternPart, triplePart, context) {
  if (!context) return null;
  if (isVariable(patternPart)) {
    return matchVariable(patternPart, triplePart, context);
  }
  return patternPart === triplePart ? context : null;
}

function matchPattern(pattern, triple, context) {
  return pattern.reduce((context, patternPart, idx) => {
    const triplePart = triple[idx];
    return matchPart(patternPart, triplePart, context);
  }, context);
}

function querySingle(pattern, db, context) {
  return relevantTriples(pattern, db)
    .map((triple) => matchPattern(pattern, triple, context))
    .filter((x) => x);
}

function queryWhere(patterns, db) {
  return patterns.reduce(
    (contexts, pattern) => {
      return contexts.flatMap((context) => querySingle(pattern, db, context));
    },
    [{}]
  );
}

function actualize(context, find) {
  return find.map((findPart) => {
    return isVariable(findPart) ? context[findPart] : findPart;
  });
}

export function query({ find, where }, db) {
  const contexts = queryWhere(where, db);
  return contexts.map((context) => actualize(context, find));
}

function relevantTriples(pattern, db) {
  const [id, attribute, value] = pattern;
  if (!isVariable(id)) {
    return db.entityIndex[id];
  }
  if (!isVariable(attribute)) {
    return db.attrIndex[attribute];
  }
  if (!isVariable(value)) {
    return db.valueIndex[value];
  }
  return db.triples;
}

function indexBy(triples, idx) {
  return triples.reduce((index, triple) => {
    const k = triple[idx];
    index[k] = index[k] || [];
    index[k].push(triple);
    return index;
  }, {});
}

export function createDB(triples) {
  return {
    triples,
    entityIndex: indexBy(triples, 0),
    attrIndex: indexBy(triples, 1),
    valueIndex: indexBy(triples, 2),
  };
}
