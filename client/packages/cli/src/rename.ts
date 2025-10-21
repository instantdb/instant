/**
 * Build a function to resolve renames from cli rename flags
 * The diffSchemas function takes a fixed amount of arguments so we
 * return a function from a function here
 * exported for tests only
 * @param {*} opts  program arguments from commander
 * @returns
 */
export function buildAutoRenameSelector(opts) {
  return async function (created, promptData, extraInfo) {
    if (!opts.rename || !Array.isArray(opts.rename)) {
      return created;
    }

    // Parse rename options: format is "from:to"
    // note that it saves backwards since we will be testing against the base
    // case of a created attr
    const renameMap = new Map();
    for (const renameStr of opts.rename) {
      const [from, to] = renameStr.split(':');
      if (from && to) {
        renameMap.set(to.trim(), from.trim());
      }
    }

    let lookupNames: string[] = [];
    if (extraInfo?.type === 'attribute' && extraInfo?.entityName) {
      lookupNames = [`${extraInfo.entityName}.${created}`];
    } else if (extraInfo?.type === 'link') {
      // Extract both forward and reverse parts
      const parts = created.split('<->');
      lookupNames = [parts[0], parts[1]];
    } else {
      return created;
    }

    // Try to find a match in the rename map using the lookup names
    let fromAttr: string | null = null;
    for (const lookupName of lookupNames) {
      if (renameMap.has(lookupName)) {
        fromAttr = renameMap.get(lookupName);
        break;
      }
    }

    if (fromAttr) {
      let fromValue;
      if (extraInfo?.type === 'attribute') {
        fromValue = fromAttr.split('.').pop();
      } else {
        const matchingItem = promptData.find((item) => {
          const itemStr = typeof item === 'string' ? item : item.from;
          const itemParts = itemStr.split('<->');
          return itemParts[0] === fromAttr || itemParts[1] === fromAttr;
        });

        if (matchingItem) {
          fromValue =
            typeof matchingItem === 'string' ? matchingItem : matchingItem.from;
        } else {
          return created;
        }
      }

      const hasMatch = promptData.some((item) => {
        if (typeof item === 'string') {
          return item === fromValue;
        } else if (item.from) {
          return item.from === fromValue;
        }
        return false;
      });

      if (hasMatch) {
        return { from: fromValue, to: created };
      }
    }

    return created;
  };
}
