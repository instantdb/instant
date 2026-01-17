import { capitalize } from 'lodash';

import { InstantIssue } from './types';

const friendlyName = (s: string) => {
  return s.replaceAll(/[_-]/g, ' ');
};

const friendlyNameFromIn = (inArr: string[]) => {
  return friendlyName(inArr[inArr.length - 1]);
};

/* Standardize error messages from Instant */
export const messageFromInstantError = (
  e: InstantIssue,
): string | undefined => {
  const body = e.body;
  if (!body) return;
  switch (body.type) {
    case 'param-missing':
      return `${capitalize(friendlyNameFromIn(body.hint.in))} is missing.`;
    case 'param-malformed':
      return `${capitalize(friendlyNameFromIn(body.hint.in))} is malformed`;
    case 'record-not-found':
      return `We couldn't find this ${friendlyName(body.hint['record-type'])}`;
    case 'record-not-unique':
      return `This ${friendlyName(body.hint['record-type'])} already exists`;
    default:
      return body.message;
  }
};
