// 1. patternMatch
import { getTriples } from "./store.js";

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

function matchExact(patternPart, triplePart, context) {
  return patternPart === triplePart ? context : null;
}

function matchWithArgMap(patternPart, triplePart, context) {
  const { in: inList } = patternPart;
  if (inList && inList.includes(triplePart)) {
    return context;
  }
  return null;
}

function matcherForPatternPart(patternPart) {
  switch (typeof patternPart) {
    case "string":
      return patternPart.startsWith("?") ? matchVariable : matchExact;
    case "object":
      return matchWithArgMap;
    default:
      return matchExact;
  }
}

function matchPart(patternPart, triplePart, context) {
  if (!context) return null;
  const matcher = matcherForPatternPart(patternPart);
  return matcher(patternPart, triplePart, context);
}

export function matchPattern(pattern, triple, context) {
  return pattern.reduce((context, patternPart, idx) => {
    const triplePart = triple[idx];
    return matchPart(patternPart, triplePart, context);
  }, context);
}

// 2. querySingle

export function querySingle(store, pattern, context) {
  return relevantTriples(store, pattern, context)
    .map((triple) => matchPattern(pattern, triple, context))
    .filter((x) => x);
}

// 3. queryWhere

function queryPattern(store, pattern, contexts) {
  if (pattern.or) {
    return pattern.or.patterns.flatMap((patterns) => {
      return queryWhere(store, patterns, contexts);
    });
  }
  if (pattern.and) {
    return pattern.and.patterns.reduce((contexts, patterns) => {
      return queryWhere(store, patterns, contexts);
    }, contexts);
  }
  return contexts.flatMap((context) => querySingle(store, pattern, context));
}

export function queryWhere(store, patterns, contexts = [{}]) {
  return patterns.reduce((contexts, pattern) => {
    return queryPattern(store, pattern, contexts);
  }, contexts);
}

// 4. query

function actualize(context, find) {
  if (Array.isArray(find)) {
    return find.map((findPart) => actualize(context, findPart));
  }
  return isVariable(find) ? context[find] : find;
}

export function query(store, { find, where }) {
  const contexts = queryWhere(store, where);
  return contexts.map((context) => actualize(context, find));
}

// 5. Index

function relevantTriples(store, pattern, context) {
  return getTriples(store, actualize(context, pattern));
}
