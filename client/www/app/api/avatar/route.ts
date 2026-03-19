// Handy endpoint to generate cute avatar images based on random strings.
// Right now we use them in the recipes page.
import { toFacehashHandler } from 'facehash/next';

export const { GET } = toFacehashHandler();
