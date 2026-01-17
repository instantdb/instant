import { pgTimezoneMatch, pgTimezoneAbbrevs } from './pgtime.ts';

// Date parsing functions
function zonedDateTimeStrToInstant(s) {
  return new Date(s);
}

function localDateTimeStrToInstant(s) {
  // Parse as UTC since there's no timezone info
  return new Date(s + 'Z');
}

const localDateStrRe = /^(\d+)[\./-](\d+)[\./-](\d+)$/;

function localDateStrToInstant(s) {
  const match = s.match(localDateStrRe);
  if (!match) {
    return null;
  }

  const [_, part1, part2, part3] = match;

  if (part1 <= 0 || part2 <= 0 || part3 <= 0) {
    return null;
  }

  if (part1 > 999) {
    return new Date(Date.UTC(part1, part2 - 1, part3, 0, 0, 0, 0));
  }
  return new Date(Date.UTC(part3, part1 - 1, part2, 0, 0, 0, 0));
}

// Custom date formatters
function offioDateStrToInstant(s) {
  // Format: "yyyy-MM-dd HH:mm:ss"
  // Treat as UTC
  const [datePart, timePart] = s.split(' ');
  return new Date(datePart + 'T' + timePart + 'Z');
}

function zenecaDateStrToInstant(s) {
  // Format: "yyyy-MM-dd HH:mm:ss.n"
  // Treat as UTC
  const [datePart, timeWithNanos] = s.split(' ');
  // JavaScript Date can handle fractional seconds
  return new Date(datePart + 'T' + timeWithNanos + 'Z');
}

function rfc1123ToInstant(s) {
  // RFC 1123 format is natively supported by Date constructor
  return new Date(s);
}

function dowMonDayYearStrToInstant(s) {
  // Format: "EEE MMM dd yyyy" (e.g., "Wed Jan 15 2025")

  //Only parse if the string is in the correct format
  const regex = /^(\w{3}) (\w{3}) (\d{2}) (\d{4})$/;
  const match = s.match(regex);

  if (!match) {
    throw new Error(`Unable to parse \`${s}\` as a date.`);
  }

  const date = new Date(s + ' UTC'); // Force UTC parsing
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
}

function iso8601IncompleteOffsetToInstant(s) {
  // Format: "2025-01-02T00:00:00-08" (missing minutes in timezone offset)
  // Convert to proper ISO 8601 format by adding ":00" to the timezone offset
  const regex = /^(.+T.+)([+-])(\d{2})$/;
  const match = s.match(regex);

  if (match) {
    const [, dateTimePart, sign, hours] = match;
    const correctedString = `${dateTimePart}${sign}${hours}:00`;
    return new Date(correctedString);
  }

  return null;
}

function iso8601SingleDigitToInstant(s) {
  // Format: "2025-11-2T00:00:00.000Z" or "2025-1-2T00:00:00Z" (single-digit month/day)
  // Also handles space separator: "2025-1-2 00:00:00"
  // Normalize to proper ISO 8601 format with two-digit month and day
  const regex = /^(\d+)-(\d{1,2})-(\d{1,2})([ T])(.+)$/;
  const match = s.match(regex);

  if (match) {
    const [, year, month, day, separator, rest] = match;
    const paddedMonth = month.padStart(2, '0');
    const paddedDay = day.padStart(2, '0');
    const correctedString = `${year}-${paddedMonth}-${paddedDay}T${rest}`;
    return new Date(correctedString);
  }

  return null;
}

function usDateTimeStrToInstant(s) {
  // Format: "M/d/yyyy, h:mm:ss a" (e.g., "8/4/2025, 11:02:31 PM")
  const [datePart, timePart] = s.split(', ');
  const [month, day, year] = datePart.split('/').map(Number);

  // Parse time with AM/PM
  const timeMatch = timePart.match(/(\d{1,2}):(\d{2}):(\d{2}) (AM|PM)/);
  if (!timeMatch) {
    throw new Error(`Unable to parse time from: ${s}`);
  }

  let [, hours, minutes, seconds, ampm] = timeMatch;
  hours = Number(hours);
  minutes = Number(minutes);
  seconds = Number(seconds);

  // Convert 12-hour to 24-hour format
  if (ampm === 'PM' && hours !== 12) {
    hours += 12;
  } else if (ampm === 'AM' && hours === 12) {
    hours = 0;
  }

  // Create date in UTC
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
}

// https://www.postgresql.org/docs/17/datatype-datetime.html#DATATYPE-DATETIME-SPECIAL-VALUES
function specialStrToInstant(s: string) {
  switch (s) {
    case 'epoch':
      return new Date(0);
    // These are not implemented yet because we need some way for the
    // client and server to aggree on the values
    case 'infinity':
    case '-infinity':
    case 'today':
    case 'tomorrow':
    case 'yesterday':
      return null;
  }
}

function pgTimezoneStrToInstant(s: string) {
  const match = s.match(pgTimezoneMatch);
  if (!match) {
    return null;
  }
  const [tz] = match;

  const offset = pgTimezoneAbbrevs[tz];

  const baseDate = new Date(s.replace(pgTimezoneMatch, 'Z'));

  return new Date(baseDate.getTime() - offset * 1000);
}

// Array of parsers
const dateParsers = [
  localDateStrToInstant,
  zenecaDateStrToInstant,
  dowMonDayYearStrToInstant,
  usDateTimeStrToInstant,
  rfc1123ToInstant,
  localDateTimeStrToInstant,
  iso8601IncompleteOffsetToInstant,
  offioDateStrToInstant,
  zonedDateTimeStrToInstant,
  specialStrToInstant,
  pgTimezoneStrToInstant,
  iso8601SingleDigitToInstant,
];

// Try to parse with a specific parser
function tryParseDateString(parser, s: string) {
  try {
    const result = parser(s);
    // Check if result is valid date
    if (result instanceof Date && !isNaN(result.getTime())) {
      return result;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Try all parsers until one succeeds
function dateStrToInstant(s) {
  for (const parser of dateParsers) {
    const instant = tryParseDateString(parser, s);
    if (instant) {
      return instant;
    }
  }
  return null;
}

// Parse JSON string and then try date parsing
function jsonStrToInstant(maybeJson: string) {
  try {
    const s = JSON.parse(maybeJson);
    if (typeof s === 'string') {
      return dateStrToInstant(s);
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Main parse function that handles strings and numbers
export function coerceToDate(x: unknown): Date | null | undefined {
  if (x === undefined) {
    return undefined;
  }
  if (x === null) {
    return null;
  }

  if (x instanceof Date) {
    return x;
  }
  if (typeof x === 'string') {
    const result =
      dateStrToInstant(x) || jsonStrToInstant(x) || dateStrToInstant(x.trim());
    if (!result) {
      throw new Error(`Unable to parse \`${x}\` as a date.`);
    }
    return result;
  } else if (typeof x === 'number') {
    return new Date(x);
  }
  throw new Error(
    `Invalid date value \`${x}\`. Expected a date, number, or string, got type ${typeof x}.`,
  );
}
