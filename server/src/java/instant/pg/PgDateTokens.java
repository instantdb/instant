package instant.pg;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * PostgreSQL date/time token table — direct port of {@code datetktbl} from
 * src/backend/utils/adt/datetime.c. Holds month names, day-of-week names,
 * AM/PM, AD/BC, special values like {@code epoch} / {@code now} / {@code today},
 * and ISO time/date filler tokens.
 *
 * Token comparison is truncated to {@link #TOKMAXLEN} characters to mirror the
 * {@code strncmp(lowtoken, position->token, TOKMAXLEN)} call in
 * PostgreSQL's {@code datebsearch()}.
 */
final class PgDateTokens {

  private PgDateTokens() {}

  static final int TOKMAXLEN = 10;

  /** Mirrors the field-type codes in src/include/utils/datetime.h. */
  enum Type {
    RESERV,
    MONTH,
    YEAR,
    DAY,
    JULIAN,
    TZ,         // fixed-offset timezone abbreviation
    DTZ,        // fixed-offset timezone abbreviation, DST
    DYNTZ,      // dynamic-offset abbreviation (resolves to a real zone)
    IGNORE_DTF,
    AMPM,
    HOUR,
    MINUTE,
    SECOND,
    MILLISECOND,
    MICROSECOND,
    DOY,
    DOW,
    UNITS,
    ADBC,
    AGO,
    ABS_BEFORE,
    ABS_AFTER,
    ISODATE,
    ISOTIME,
    WEEK,
    DECADE,
    CENTURY,
    MILLENNIUM,
    DTZMOD,
    UNKNOWN_FIELD
  }

  /** "value" payload codes used by tokens of types RESERV / UNITS / DOW / etc. */
  static final class Val {
    static final int AM            = 0;
    static final int PM            = 1;
    static final int HR24          = 2;
    static final int AD            = 0;
    static final int BC            = 1;

    // DTK values (dtype results / unit names)
    static final int DTK_NUMBER    = 0;
    static final int DTK_STRING    = 1;
    static final int DTK_DATE      = 2;
    static final int DTK_TIME      = 3;
    static final int DTK_TZ        = 4;
    static final int DTK_AGO       = 5;
    static final int DTK_SPECIAL   = 6;
    static final int DTK_EARLY     = 9;
    static final int DTK_LATE      = 10;
    static final int DTK_EPOCH     = 11;
    static final int DTK_NOW       = 12;
    static final int DTK_YESTERDAY = 13;
    static final int DTK_TODAY     = 14;
    static final int DTK_TOMORROW  = 15;
    static final int DTK_ZULU      = 16;
    static final int DTK_SECOND    = 18;
    static final int DTK_MINUTE    = 19;
    static final int DTK_HOUR      = 20;
    static final int DTK_DAY       = 21;
    static final int DTK_WEEK      = 22;
    static final int DTK_MONTH     = 23;
    static final int DTK_YEAR      = 25;
    static final int DTK_JULIAN    = 31;
    static final int DTK_DOW       = 32;
    static final int DTK_DOY       = 33;
    static final int DTK_TZ_HOUR   = 34;
    static final int DTK_TZ_MINUTE = 35;
    static final int DTK_ISOYEAR   = 36;
    static final int DTK_ISODOW    = 37;
  }

  static final class Entry {
    final String token;
    final Type type;
    final int value;

    Entry(String token, Type type, int value) {
      this.token = token;
      this.type = type;
      this.value = value;
    }
  }

  private static final Map<String, Entry> TABLE = build();

  /**
   * Look up the lower-cased token, comparing only the first
   * {@value #TOKMAXLEN} characters.
   */
  static Entry lookup(String lowtoken) {
    if (lowtoken == null) return null;
    String key = lowtoken.length() > TOKMAXLEN ? lowtoken.substring(0, TOKMAXLEN) : lowtoken;
    return TABLE.get(key);
  }

  private static Map<String, Entry> build() {
    Map<String, Entry> m = new HashMap<>();
    add(m, "+infinity", Type.RESERV, Val.DTK_LATE);
    add(m, "-infinity", Type.RESERV, Val.DTK_EARLY);
    add(m, "ad",        Type.ADBC,   Val.AD);
    add(m, "allballs",  Type.RESERV, Val.DTK_ZULU);
    add(m, "am",        Type.AMPM,   Val.AM);
    add(m, "apr",       Type.MONTH,  4);
    add(m, "april",     Type.MONTH,  4);
    add(m, "at",        Type.IGNORE_DTF, 0);
    add(m, "aug",       Type.MONTH,  8);
    add(m, "august",    Type.MONTH,  8);
    add(m, "bc",        Type.ADBC,   Val.BC);
    add(m, "d",         Type.UNITS,  Val.DTK_DAY);
    add(m, "dec",       Type.MONTH,  12);
    add(m, "december",  Type.MONTH,  12);
    add(m, "dow",       Type.UNITS,  Val.DTK_DOW);
    add(m, "doy",       Type.UNITS,  Val.DTK_DOY);
    add(m, "dst",       Type.DTZMOD, 3600);   // SECS_PER_HOUR
    add(m, "epoch",     Type.RESERV, Val.DTK_EPOCH);
    add(m, "feb",       Type.MONTH,  2);
    add(m, "february",  Type.MONTH,  2);
    add(m, "fri",       Type.DOW,    5);
    add(m, "friday",    Type.DOW,    5);
    add(m, "h",         Type.UNITS,  Val.DTK_HOUR);
    add(m, "infinity",  Type.RESERV, Val.DTK_LATE);
    add(m, "isodow",    Type.UNITS,  Val.DTK_ISODOW);
    add(m, "isoyear",   Type.UNITS,  Val.DTK_ISOYEAR);
    add(m, "j",         Type.UNITS,  Val.DTK_JULIAN);
    add(m, "jan",       Type.MONTH,  1);
    add(m, "january",   Type.MONTH,  1);
    add(m, "jd",        Type.UNITS,  Val.DTK_JULIAN);
    add(m, "jul",       Type.MONTH,  7);
    add(m, "julian",    Type.UNITS,  Val.DTK_JULIAN);
    add(m, "july",      Type.MONTH,  7);
    add(m, "jun",       Type.MONTH,  6);
    add(m, "june",      Type.MONTH,  6);
    add(m, "m",         Type.UNITS,  Val.DTK_MONTH);
    add(m, "mar",       Type.MONTH,  3);
    add(m, "march",     Type.MONTH,  3);
    add(m, "may",       Type.MONTH,  5);
    add(m, "mm",        Type.UNITS,  Val.DTK_MINUTE);
    add(m, "mon",       Type.DOW,    1);
    add(m, "monday",    Type.DOW,    1);
    add(m, "nov",       Type.MONTH,  11);
    add(m, "november",  Type.MONTH,  11);
    add(m, "now",       Type.RESERV, Val.DTK_NOW);
    add(m, "oct",       Type.MONTH,  10);
    add(m, "october",   Type.MONTH,  10);
    add(m, "on",        Type.IGNORE_DTF, 0);
    add(m, "pm",        Type.AMPM,   Val.PM);
    add(m, "s",         Type.UNITS,  Val.DTK_SECOND);
    add(m, "sat",       Type.DOW,    6);
    add(m, "saturday",  Type.DOW,    6);
    add(m, "sep",       Type.MONTH,  9);
    add(m, "sept",      Type.MONTH,  9);
    add(m, "september", Type.MONTH,  9);
    add(m, "sun",       Type.DOW,    0);
    add(m, "sunday",    Type.DOW,    0);
    add(m, "t",         Type.ISOTIME,Val.DTK_TIME);
    add(m, "thu",       Type.DOW,    4);
    add(m, "thur",      Type.DOW,    4);
    add(m, "thurs",     Type.DOW,    4);
    add(m, "thursday",  Type.DOW,    4);
    add(m, "today",     Type.RESERV, Val.DTK_TODAY);
    add(m, "tomorrow",  Type.RESERV, Val.DTK_TOMORROW);
    add(m, "tue",       Type.DOW,    2);
    add(m, "tues",      Type.DOW,    2);
    add(m, "tuesday",   Type.DOW,    2);
    add(m, "wed",       Type.DOW,    3);
    add(m, "wednesday", Type.DOW,    3);
    add(m, "weds",      Type.DOW,    3);
    add(m, "y",         Type.UNITS,  Val.DTK_YEAR);
    add(m, "yesterday", Type.RESERV, Val.DTK_YESTERDAY);
    return m;
  }

  private static void add(Map<String, Entry> m, String token, Type type, int value) {
    String k = token.toLowerCase(Locale.ROOT);
    if (k.length() > TOKMAXLEN) k = k.substring(0, TOKMAXLEN);
    m.put(k, new Entry(k, type, value));
  }
}
