function _extractTriplesHelper(idNodes, acc = []) {
  idNodes.forEach((idNode) => {
    const { data } = idNode;
    const { 'datalog-result': datalogResult } = data;
    const { 'join-rows': joinRows } = datalogResult;
    for (const rows of joinRows) {
      for (const triple of rows) {
        acc.push(triple);
      }
    }
    _extractTriplesHelper(idNode['child-nodes'], acc);
  });
}

/**
 * Marshall instaql-result into list of triples. Instaql-result may have
 * multiple datalog-results, each datalog-result may have multiple join-rows
 * and each join-row may have triples.The union of these triples may have
 * duplicates, so we dedup them.
 */
export function extractTriples(idNodes) {
  const triples = [];
  _extractTriplesHelper(idNodes, triples);
  return triples;
}
