export function pick(obj, keys) {
  if (!keys) return obj;

  const ret = {};
  keys.forEach((key) => {
    ret[key] = obj[key];
  });
  return ret;
}
