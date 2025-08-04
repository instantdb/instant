// Date parsing functions
function zonedDateTimeStrToInstant(s) {
  return new Date(s);
}

function localDateTimeStrToInstant(s) {
  // Parse as UTC since there's no timezone info
  return new Date(s + 'Z');
}

function localDateStrToInstant(s) {
  // Parse date and set to start of day in UTC
  return new Date(s + 'T00:00:00Z');
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

// Array of parsers
const dateParsers = [
  zenecaDateStrToInstant,
  dowMonDayYearStrToInstant,
  usDateTimeStrToInstant,
  rfc1123ToInstant,
  localDateStrToInstant,
  localDateTimeStrToInstant,
  zonedDateTimeStrToInstant,
  iso8601IncompleteOffsetToInstant,
  offioDateStrToInstant,
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
export function coerceToDate(x: unknown): Date {
  if (x instanceof Date) {
    return x;
  }
  if (typeof x === 'string') {
    const result = dateStrToInstant(x) || jsonStrToInstant(x);
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
