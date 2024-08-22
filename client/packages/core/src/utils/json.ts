
/* 
  Stores maps in JSON as custom objects with key __type = 'm'
  used to identify them as maps.
  Stores values as an array of entries. If we tried to use an 
  object instead, all of our keys would be converted to strings.
 */
function jsonReplacer(_k, value) {
  if (value instanceof Map) {
    return {
      __type: "m",
      entries: [...value.entries()],
    };
  }
  return value;
}

function jsonReviver(_k, value) {
  if (value && typeof value === "object" && value.__type === "m") {
    return new Map(value.entries);
  }
  return value;
}

/* 
  Converts data that might contain Map values to JSON.
  Data should be converted back from json with fromJSONWithMaps
*/
export function toJSONWithMaps(x) {
  return JSON.stringify(x, jsonReplacer);
}

/* 
  Parses JSON that was formatted with toJSONWithMaps
*/
export function fromJSONWithMaps(s) {
  return JSON.parse(s, jsonReviver);
}
