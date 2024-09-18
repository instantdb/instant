export function areObjectKeysEqual(a, b) {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  return (
    ak.length === bk.length && Object.keys(a).every((k) => b.hasOwnProperty(k))
  );
}

export function areObjectsShallowEqual(obj1, obj2) {
  return (
    Object.keys(obj1).length === Object.keys(obj2).length &&
    Object.keys(obj1).every(
      (key) => obj2.hasOwnProperty(key) && obj1[key] === obj2[key],
    )
  );
}

export function areObjectsDeepEqual(obj1, obj2) {
  if (
    typeof obj1 !== "object" ||
    typeof obj2 !== "object" ||
    obj1 === null ||
    obj2 === null
  ) {
    return obj1 === obj2;
  }

  if (!areObjectKeysEqual(obj1, obj2)) {
    return false;
  }

  return Object.keys(obj1).every((key) =>
    areObjectsDeepEqual(obj1[key], obj2[key]),
  );
}

export function immutableDeepMerge(target, source) {
  if (!isObject(target) || !isObject(source)) {
    return source;
  }

  const result = {};

  for (const key of Object.keys(target)) {
    if (source[key] === null) continue;

    result[key] = target[key];
  }

  for (const key of Object.keys(source)) {
    if (source[key] === null) continue;

    const areBothObjects = isObject(target[key]) && isObject(source[key]);

    result[key] = areBothObjects
      ? immutableDeepMerge(target[key], source[key])
      : source[key];
  }

  return result;
}

export function immutableDeepReplace(target, replaceValue, replacementValue) {
  if (!isObject(target)) {
    return target;
  }

  const result = {};

  for (const [key, value] of Object.entries(target)) {
    result[key] = isObject(value)
      ? immutableDeepReplace(value, replaceValue, replacementValue)
      : value === replaceValue
        ? replacementValue
        : value;
  }

  return result;
}

export function isObject(val) {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}
