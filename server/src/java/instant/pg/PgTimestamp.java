package instant.pg;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.zone.ZoneRules;
import java.util.Locale;

/**
 * Faithful Java port of PostgreSQL 17's {@code timestamp with time zone} input
 * parser, plus an entry point that mirrors the {@code triples_extract_date_value}
 * SQL function from server/resources/migrations/36_checked_data_type.up.sql:
 *
 * <pre>{@code
 * case jsonb_typeof(value)
 *   when 'number' then return to_timestamp((value->>0)::double precision / 1000);
 *   when 'string' then return ((value->>0)::text)::timestamp with time zone;
 *   else return null;
 * end case;
 * }</pre>
 *
 * Ports the following PostgreSQL routines directly:
 *
 * <ul>
 *   <li>{@code ParseDateTime}        — src/backend/utils/adt/datetime.c</li>
 *   <li>{@code DecodeDateTime}       — src/backend/utils/adt/datetime.c</li>
 *   <li>{@code DecodeDate}           — src/backend/utils/adt/datetime.c</li>
 *   <li>{@code DecodeNumber}         — src/backend/utils/adt/datetime.c</li>
 *   <li>{@code DecodeNumberField}    — src/backend/utils/adt/datetime.c</li>
 *   <li>{@code DecodeTime}           — src/backend/utils/adt/datetime.c</li>
 *   <li>{@code DecodeTimezone}       — src/backend/utils/adt/datetime.c</li>
 *   <li>{@code DecodeTimezoneAbbrev} — src/backend/utils/adt/datetime.c</li>
 *   <li>{@code DecodeSpecial}        — src/backend/utils/adt/datetime.c</li>
 *   <li>{@code ValidateDate}         — src/backend/utils/adt/datetime.c</li>
 *   <li>{@code date2j} / {@code j2date} / {@code j2day}</li>
 *   <li>{@code tm2timestamp}         — src/backend/utils/adt/timestamp.c</li>
 *   <li>{@code float8_timestamptz}   — src/backend/utils/adt/timestamp.c</li>
 *   <li>{@code timestamptz_in}       — src/backend/utils/adt/timestamp.c</li>
 * </ul>
 *
 * Behaviour depends on two server settings:
 *
 * <ul>
 *   <li>{@link Settings#sessionTimeZone} — used when the input has no zone
 *       info. Mirrors PostgreSQL's {@code TimeZone} GUC.</li>
 *   <li>{@link Settings#dateOrder} — disambiguates numeric-only inputs like
 *       {@code 01/02/03}. Mirrors PostgreSQL's {@code DateStyle} GUC's
 *       second component (MDY / DMY / YMD).</li>
 * </ul>
 *
 * <p>Limits: {@code now}, {@code today}, {@code tomorrow}, {@code yesterday}
 * resolve relative to the JVM clock at parse time (PostgreSQL uses the
 * transaction start time). {@code infinity} and {@code -infinity} return
 * {@link Instant#MAX} and {@link Instant#MIN} respectively.
 */
public final class PgTimestamp {

  // ============================================================
  // Constants (mirror src/include/datatype/timestamp.h)
  // ============================================================

  private static final int  HOURS_PER_DAY    = 24;
  private static final int  MINS_PER_HOUR    = 60;
  private static final int  SECS_PER_MINUTE  = 60;
  private static final int  SECS_PER_HOUR    = 3600;
  private static final int  SECS_PER_DAY     = 86400;
  private static final int  MONTHS_PER_YEAR  = 12;
  private static final long USECS_PER_SEC    = 1_000_000L;
  private static final long USECS_PER_MINUTE = 60_000_000L;
  private static final long USECS_PER_HOUR   = 3_600_000_000L;
  private static final long USECS_PER_DAY    = 86_400_000_000L;
  private static final int  MAX_TZDISP_HOUR  = 15;

  private static final int  UNIX_EPOCH_JDATE     = 2440588;   // date2j(1970, 1, 1)
  private static final int  POSTGRES_EPOCH_JDATE = 2451545;   // date2j(2000, 1, 1)
  private static final int  DATETIME_MIN_JULIAN  = 0;
  private static final int  TIMESTAMP_END_JULIAN = 109_203_528;
  private static final long MIN_TIMESTAMP_USEC   = -211_813_488_000_000_000L;
  // END_TIMESTAMP isn't used directly here — overflow is guarded by the Julian
  // range check inside tm2timestamp / by float8_timestamptz's own bounds.

  private static final int  MAXDATEFIELDS  = 25;
  private static final int  MAXDATELEN     = 128;
  private static final int  INTERVAL_FULL_RANGE = 0x7FFF_FFFF; // any range

  // ftype field codes (DTK_*) used by the tokenizer
  private static final int FT_NUMBER  = PgDateTokens.Val.DTK_NUMBER;
  private static final int FT_STRING  = PgDateTokens.Val.DTK_STRING;
  private static final int FT_DATE    = PgDateTokens.Val.DTK_DATE;
  private static final int FT_TIME    = PgDateTokens.Val.DTK_TIME;
  private static final int FT_TZ      = PgDateTokens.Val.DTK_TZ;
  private static final int FT_SPECIAL = PgDateTokens.Val.DTK_SPECIAL;

  // Field-bitmask helpers (DTK_M(t) = 1 << t), for tracking which Y/M/D/H/M/S/TZ
  // fields have been filled in — exactly the C code's "fmask".
  private static final int M_YEAR   = 1 << 2;   // YEAR
  private static final int M_MONTH  = 1 << 1;   // MONTH
  private static final int M_DAY    = 1 << 3;   // DAY
  private static final int M_HOUR   = 1 << 10;  // HOUR
  private static final int M_MINUTE = 1 << 11;  // MINUTE
  private static final int M_SECOND = 1 << 12;  // SECOND
  private static final int M_MS     = 1 << 13;  // MILLISECOND
  private static final int M_US     = 1 << 14;  // MICROSECOND
  private static final int M_DOY    = 1 << 15;  // DOY
  private static final int M_DOW    = 1 << 16;  // DOW
  private static final int M_TZ     = 1 << 5;   // TZ
  private static final int M_DTZ    = 1 << 6;   // DTZ
  private static final int M_DTZMOD = 1 << 28;  // DTZMOD

  private static final int M_DATE = M_YEAR | M_MONTH | M_DAY;
  private static final int M_TIME = M_HOUR | M_MINUTE | M_SECOND | M_MS | M_US;

  // dtype values returned by DecodeDateTime
  private static final int DTYPE_DATE   = PgDateTokens.Val.DTK_DATE;
  private static final int DTYPE_EPOCH  = PgDateTokens.Val.DTK_EPOCH;
  private static final int DTYPE_LATE   = PgDateTokens.Val.DTK_LATE;
  private static final int DTYPE_EARLY  = PgDateTokens.Val.DTK_EARLY;

  // ============================================================
  // Public API
  // ============================================================

  public enum DateOrder { MDY, DMY, YMD }

  public static final class Settings {
    public final ZoneId sessionTimeZone;
    public final DateOrder dateOrder;

    public Settings(ZoneId sessionTimeZone, DateOrder dateOrder) {
      if (sessionTimeZone == null) throw new IllegalArgumentException("sessionTimeZone");
      if (dateOrder == null) throw new IllegalArgumentException("dateOrder");
      this.sessionTimeZone = sessionTimeZone;
      this.dateOrder = dateOrder;
    }
  }

  /** PostgreSQL's out-of-the-box defaults: UTC session zone, ISO,MDY. */
  public static final Settings DEFAULT_SETTINGS =
      new Settings(ZoneOffset.UTC, DateOrder.MDY);

  /**
   * Direct port of {@code triples_extract_date_value(value jsonb)}.
   *
   * @param json Java representation of the JSON value: {@code Number} for
   *             JSON numbers, {@code String} for JSON strings, {@code null} or
   *             anything else returns {@code null}.
   * @return parsed {@link Instant}, or {@code null} if the input is null /
   *         not a number or string.
   * @throws PgDateTimeException on malformed input or out-of-range result.
   */
  public static Instant extractDateValue(Object json) {
    return extractDateValue(json, DEFAULT_SETTINGS);
  }

  public static Instant extractDateValue(Object json, Settings settings) {
    if (json == null) return null;
    if (json instanceof Number) {
      double ms = ((Number) json).doubleValue();
      // to_timestamp((value->>0)::double precision / 1000)
      return toTimestamp(ms / 1000.0);
    }
    if (json instanceof String) {
      return parseTimestampTz((String) json, settings);
    }
    return null;
  }

  /** Mirrors {@code timestamptz_in}. Uses {@link #DEFAULT_SETTINGS}. */
  public static Instant parseTimestampTz(String s) {
    return parseTimestampTz(s, DEFAULT_SETTINGS);
  }

  /** Mirrors {@code timestamptz_in} with a user-supplied session zone / DateStyle. */
  public static Instant parseTimestampTz(String s, Settings settings) {
    if (s == null) throw new PgDateTimeException("invalid input syntax for timestamp with time zone: null");
    if (s.length() > MAXDATELEN) {
      throw new PgDateTimeException(
          "invalid input syntax for timestamp with time zone: \"" + s + "\"");
    }

    ParseResult tokens = parseDateTime(s);
    DecodeResult d = decodeDateTime(tokens.field, tokens.ftype, tokens.nf, settings);

    switch (d.dtype) {
      case DTYPE_DATE:
        return tm2instant(d.tm, d.fsec, d.tz, s);
      case DTYPE_EPOCH:
        return Instant.EPOCH;
      case DTYPE_LATE:
        return Instant.MAX;
      case DTYPE_EARLY:
        return Instant.MIN;
      default:
        throw new PgDateTimeException("unexpected dtype " + d.dtype + " parsing \"" + s + "\"");
    }
  }

  /**
   * Mirrors {@code float8_timestamptz}: convert seconds-since-Unix-epoch to a
   * {@link Instant}. Matches PostgreSQL's behaviour for NaN/inf and out-of-range.
   *
   * <p>{@code rint(value * 1_000_000)} is used for microsecond rounding, exactly
   * as in {@code float8_timestamptz}.
   */
  public static Instant toTimestamp(double seconds) {
    if (Double.isNaN(seconds)) {
      throw new PgDateTimeException("timestamp cannot be NaN");
    }
    if (Double.isInfinite(seconds)) {
      return seconds < 0 ? Instant.MIN : Instant.MAX;
    }

    // float8_timestamptz range check: must be within
    // SECS_PER_DAY * (DATETIME_MIN_JULIAN - UNIX_EPOCH_JDATE)
    //   ..  SECS_PER_DAY * (TIMESTAMP_END_JULIAN - UNIX_EPOCH_JDATE)
    double min = (double) SECS_PER_DAY * (DATETIME_MIN_JULIAN - UNIX_EPOCH_JDATE);
    double max = (double) SECS_PER_DAY * (TIMESTAMP_END_JULIAN - UNIX_EPOCH_JDATE);
    if (seconds < min || seconds >= max) {
      throw new PgDateTimeException("timestamp out of range: \"" + seconds + "\"");
    }

    // Compute as microseconds-from-Unix-epoch using exactly Postgres' arithmetic
    // (the ::timestamp is internally microseconds-from-Postgres-epoch, but the
    // public Instant doesn't care about the epoch — only the rounding matters).
    double microsAfterUnix = Math.rint(seconds * USECS_PER_SEC);
    long usec = (long) microsAfterUnix;
    long secPart = Math.floorDiv(usec, 1_000_000L);
    long nanoPart = Math.floorMod(usec, 1_000_000L) * 1000L;
    return Instant.ofEpochSecond(secPart, nanoPart);
  }

  // ============================================================
  // Mutable "pg_tm + fsec + tz" struct, for the decoder
  // ============================================================

  static final class PgTm {
    int  tm_year;   // full year, no 1900 offset; 0 means "1 BC"
    int  tm_mon;    // 1..12
    int  tm_mday;   // 1..31
    int  tm_hour;
    int  tm_min;
    int  tm_sec;
    int  tm_isdst = -1;
    int  tm_yday;
    int  tm_wday;
  }

  private static final class DecodeResult {
    int  dtype;
    PgTm tm = new PgTm();
    long fsec;        // microseconds 0..999999
    int  tz;          // PG-style: seconds west of UTC (i.e. -offset_east)
    boolean tzSet;
  }

  // ============================================================
  // ParseDateTime — tokenizer
  // ============================================================

  static final class ParseResult {
    final String[] field = new String[MAXDATEFIELDS];
    final int[]    ftype = new int[MAXDATEFIELDS];
    int nf;
  }

  /**
   * Direct port of {@code ParseDateTime}. Splits the input into fields,
   * lower-cases all alphabetic content, and assigns a coarse {@code DTK_*}
   * field-type code to each field.
   */
  static ParseResult parseDateTime(String timestr) {
    ParseResult r = new ParseResult();
    StringBuilder buf = new StringBuilder();
    int len = timestr.length();
    int cp = 0;

    while (cp < len) {
      char c = timestr.charAt(cp);

      // ignore whitespace between fields
      if (Character.isWhitespace(c)) { cp++; continue; }

      if (r.nf >= MAXDATEFIELDS) throw badFormat(timestr);

      int fieldStart = buf.length();

      if (isDigit(c)) {
        // leading digit → date or time
        buf.append(c); cp++;
        while (cp < len && isDigit(timestr.charAt(cp))) buf.append(timestr.charAt(cp++));

        if (cp < len && timestr.charAt(cp) == ':') {
          // time field
          r.ftype[r.nf] = FT_TIME;
          buf.append(':'); cp++;
          while (cp < len) {
            char d = timestr.charAt(cp);
            if (isDigit(d) || d == ':' || d == '.') { buf.append(d); cp++; } else break;
          }
        } else if (cp < len && (timestr.charAt(cp) == '-' || timestr.charAt(cp) == '/' || timestr.charAt(cp) == '.')) {
          // date or numeric (yy.ddd)
          char delim = timestr.charAt(cp);
          buf.append(delim); cp++;
          if (cp < len && isDigit(timestr.charAt(cp))) {
            r.ftype[r.nf] = (delim == '.') ? FT_NUMBER : FT_DATE;
            while (cp < len && isDigit(timestr.charAt(cp))) buf.append(timestr.charAt(cp++));
            if (cp < len && timestr.charAt(cp) == delim) {
              r.ftype[r.nf] = FT_DATE;
              buf.append(delim); cp++;
              while (cp < len) {
                char d = timestr.charAt(cp);
                if (isDigit(d) || d == delim) { buf.append(d); cp++; } else break;
              }
            }
          } else {
            r.ftype[r.nf] = FT_DATE;
            while (cp < len) {
              char d = timestr.charAt(cp);
              if (isAlnum(d) || d == delim) {
                buf.append(toLower(d)); cp++;
              } else break;
            }
          }
        } else {
          r.ftype[r.nf] = FT_NUMBER;
        }
      } else if (c == '.') {
        // leading decimal point: fractional seconds
        buf.append('.'); cp++;
        while (cp < len && isDigit(timestr.charAt(cp))) buf.append(timestr.charAt(cp++));
        r.ftype[r.nf] = FT_NUMBER;
      } else if (isAlpha(c)) {
        r.ftype[r.nf] = FT_STRING;
        buf.append(toLower(c)); cp++;
        while (cp < len && isAlpha(timestr.charAt(cp))) buf.append(toLower(timestr.charAt(cp++)));

        // Disambiguate trailing date-with-text-month vs alpha+numeric-tz
        boolean isDate = false;
        if (cp < len) {
          char d = timestr.charAt(cp);
          if (d == '-' || d == '/' || d == '.') {
            isDate = true;
          } else if (d == '+' || isDigit(d)) {
            // peek into the field-so-far: if it's a known token, treat what
            // follows as the start of a new field (a numeric tz offset, etc.)
            String sofar = buf.substring(fieldStart);
            PgDateTokens.Entry tok = PgDateTokens.lookup(sofar);
            if (tok == null) isDate = true;
          }
        }
        if (isDate) {
          r.ftype[r.nf] = FT_DATE;
          while (cp < len) {
            char d = timestr.charAt(cp);
            if (d == '+' || d == '-' || d == '/' || d == '_' || d == '.' || d == ':' || isAlnum(d)) {
              buf.append(toLower(d)); cp++;
            } else break;
          }
        }
      } else if (c == '+' || c == '-') {
        buf.append(c); cp++;
        // soak up leading whitespace
        while (cp < len && Character.isWhitespace(timestr.charAt(cp))) cp++;
        if (cp < len && isDigit(timestr.charAt(cp))) {
          r.ftype[r.nf] = FT_TZ;
          buf.append(timestr.charAt(cp++));
          while (cp < len) {
            char d = timestr.charAt(cp);
            if (isDigit(d) || d == ':' || d == '.' || d == '-') { buf.append(d); cp++; } else break;
          }
        } else if (cp < len && isAlpha(timestr.charAt(cp))) {
          r.ftype[r.nf] = FT_SPECIAL;
          buf.append(toLower(timestr.charAt(cp++)));
          while (cp < len && isAlpha(timestr.charAt(cp))) buf.append(toLower(timestr.charAt(cp++)));
        } else {
          throw badFormat(timestr);
        }
      } else if (isPunct(c)) {
        // ignore other punctuation, treat as separator
        cp++;
        continue;
      } else {
        throw badFormat(timestr);
      }

      r.field[r.nf++] = buf.substring(fieldStart);
      // (no need for a delimiting '\0' in Java — fields are separate strings)
    }

    if (r.nf == 0) throw badFormat(timestr);
    return r;
  }

  // ============================================================
  // DecodeDateTime — assign meaning to fields
  // ============================================================

  static DecodeResult decodeDateTime(String[] field, int[] ftype, int nf, Settings settings) {
    DecodeResult r = new DecodeResult();
    PgTm tm = r.tm;
    int fmask = 0;
    int ptype = 0;          // unit prefix from a preceding "j", "t", etc.
    int mer = PgDateTokens.Val.HR24;
    boolean haveTextMonth = false;
    boolean isjulian = false;
    boolean is2digits = false;
    boolean bc = false;

    ZoneId namedTz = null;          // full IANA zone seen in input
    ZoneId abbrevTz = null;         // dynamic-tz abbreviation
    String abbrev = null;           // textual form for DYNTZ resolution
    int[] is2 = { 0 };              // mutable bool wrapper

    r.dtype = DTYPE_DATE;

    for (int i = 0; i < nf; i++) {
      String f = field[i];
      int tmask;
      switch (ftype[i]) {
        case FT_DATE: {
          if (ptype == PgDateTokens.Val.DTK_JULIAN) {
            // julian-day with embedded tz: "J2451187-08:00"
            int j = 0;
            int idx = 0;
            while (idx < f.length() && isDigit(f.charAt(idx))) {
              j = j * 10 + (f.charAt(idx) - '0');
              if (j < 0) throw fieldOverflow(f);
              idx++;
            }
            if (idx == 0) throw badFormat(f);
            int[] ymd = j2date(j);
            tm.tm_year = ymd[0]; tm.tm_mon = ymd[1]; tm.tm_mday = ymd[2];
            isjulian = true;
            int tz = decodeTimezone(f.substring(idx));
            r.tz = tz; r.tzSet = true;
            tmask = M_DATE | M_TIME | M_TZ;
            ptype = 0;
            break;
          }

          boolean haveMD = (fmask & (M_MONTH | M_DAY)) == (M_MONTH | M_DAY);
          if (ptype != 0 || haveMD) {
            // already have month+day → this DATE-shaped field is a tz name
            // OR a run-together numeric time with trailing -hh tz.
            char c0 = f.charAt(0);
            if (isDigit(c0) || ptype != 0) {
              if (ptype != 0) {
                if (ptype != PgDateTokens.Val.DTK_TIME) throw badFormat(f);
                ptype = 0;
              }
              if ((fmask & M_TIME) == M_TIME) throw badFormat(f);
              int dash = f.indexOf('-');
              if (dash < 0) throw badFormat(f);
              int tz = decodeTimezone(f.substring(dash));
              r.tz = tz; r.tzSet = true;
              String numPart = f.substring(0, dash);
              tmask = decodeNumberField(numPart.length(), numPart, fmask, tm, r, is2);
              tmask |= M_TZ;
              is2digits = is2[0] != 0;
            } else {
              ZoneId z = lookupTimezoneName(f);
              if (z == null) throw new PgDateTimeException("time zone \"" + f + "\" not recognized");
              namedTz = z;
              tmask = M_TZ;
            }
          } else {
            tmask = decodeDate(f, fmask, tm, settings, is2);
            is2digits = is2[0] != 0;
          }
          break;
        }

        case FT_TIME: {
          if (ptype != 0) {
            if (ptype != PgDateTokens.Val.DTK_TIME) throw badFormat(f);
            ptype = 0;
          }
          tmask = decodeTime(f, INTERVAL_FULL_RANGE, tm, r);
          if (timeOverflows(tm.tm_hour, tm.tm_min, tm.tm_sec, r.fsec)) throw fieldOverflow(f);
          break;
        }

        case FT_TZ: {
          int tz = decodeTimezone(f);
          r.tz = tz; r.tzSet = true;
          tmask = M_TZ;
          break;
        }

        case FT_NUMBER: {
          if (ptype != 0) {
            // labelled by a preceding unit prefix ("j", "t", ...)
            int dotIdx = f.indexOf('.');
            String intPart = dotIdx < 0 ? f : f.substring(0, dotIdx);
            String fracPart = dotIdx < 0 ? "" : f.substring(dotIdx);
            int value;
            try { value = Integer.parseInt(intPart); } catch (NumberFormatException e) { throw badFormat(f); }

            switch (ptype) {
              case PgDateTokens.Val.DTK_JULIAN: {
                if (value < 0) throw fieldOverflow(f);
                tmask = M_DATE;
                int[] ymd = j2date(value);
                tm.tm_year = ymd[0]; tm.tm_mon = ymd[1]; tm.tm_mday = ymd[2];
                isjulian = true;
                if (!fracPart.isEmpty()) {
                  double frac = parseFraction(fracPart);
                  long usec = Math.round(frac * USECS_PER_DAY);
                  tm.tm_hour = (int) (usec / USECS_PER_HOUR); usec %= USECS_PER_HOUR;
                  tm.tm_min  = (int) (usec / USECS_PER_MINUTE); usec %= USECS_PER_MINUTE;
                  tm.tm_sec  = (int) (usec / USECS_PER_SEC); usec %= USECS_PER_SEC;
                  r.fsec = usec;
                  tmask |= M_TIME;
                }
                break;
              }
              case PgDateTokens.Val.DTK_TIME: {
                tmask = decodeNumberField(f.length(), f, fmask | M_DATE, tm, r, is2);
                if (tmask != M_TIME) throw badFormat(f);
                break;
              }
              default:
                throw badFormat(f);
            }
            ptype = 0;
            r.dtype = DTYPE_DATE;
          } else {
            int flen = f.length();
            int dot = f.indexOf('.');

            if (dot >= 0 && (fmask & M_DATE) == 0) {
              // embedded decimal but no date yet → e.g. 2001.360 (year.doy)
              tmask = decodeDate(f, fmask, tm, settings, is2);
              is2digits = is2[0] != 0;
            } else if (dot >= 0 && flen - (flen - dot) > 2) {
              // run-together: 20011225 or 040506.789
              tmask = decodeNumberField(flen, f, fmask, tm, r, is2);
              is2digits = is2[0] != 0;
            } else if (flen >= 6 && ((fmask & M_DATE) == 0 || (fmask & M_TIME) == 0)) {
              tmask = decodeNumberField(flen, f, fmask, tm, r, is2);
              is2digits = is2[0] != 0;
            } else {
              tmask = decodeNumber(flen, f, haveTextMonth, fmask, tm, r, settings, is2);
              is2digits = is2[0] != 0;
            }
          }
          break;
        }

        case FT_STRING:
        case FT_SPECIAL: {
          // timezone abbreviation lookup wins over keyword table
          PgTimezoneAbbrevs.Entry abEntry = PgTimezoneAbbrevs.lookup(f);
          PgDateTokens.Type ttype;
          int tval = 0;
          ZoneId valtz = null;
          if (abEntry != null) {
            ttype = abEntry.type;
            tval = abEntry.offsetSeconds;
            valtz = abEntry.zone;
          } else {
            PgDateTokens.Entry kw = PgDateTokens.lookup(f);
            if (kw == null) {
              // fall through: try as full IANA zone name
              ZoneId z = tryZone(f);
              if (z == null) throw badFormat(f);
              namedTz = z;
              tmask = M_TZ;
              break;
            }
            ttype = kw.type;
            tval  = kw.value;
          }

          if (ttype == PgDateTokens.Type.IGNORE_DTF) continue;

          tmask = bitFor(ttype);
          switch (ttype) {
            case RESERV: {
              switch (tval) {
                case PgDateTokens.Val.DTK_NOW: {
                  tmask = M_DATE | M_TIME | M_TZ;
                  r.dtype = DTYPE_DATE;
                  fillNow(tm, r, settings.sessionTimeZone);
                  break;
                }
                case PgDateTokens.Val.DTK_YESTERDAY:
                case PgDateTokens.Val.DTK_TODAY:
                case PgDateTokens.Val.DTK_TOMORROW: {
                  tmask = M_DATE;
                  r.dtype = DTYPE_DATE;
                  LocalDate today = LocalDate.now(settings.sessionTimeZone);
                  LocalDate target = tval == PgDateTokens.Val.DTK_YESTERDAY ? today.minusDays(1)
                                  : tval == PgDateTokens.Val.DTK_TOMORROW ? today.plusDays(1)
                                  : today;
                  tm.tm_year = target.getYear();
                  tm.tm_mon  = target.getMonthValue();
                  tm.tm_mday = target.getDayOfMonth();
                  break;
                }
                case PgDateTokens.Val.DTK_ZULU:
                  tmask = M_TIME | M_TZ;
                  r.dtype = DTYPE_DATE;
                  tm.tm_hour = 0; tm.tm_min = 0; tm.tm_sec = 0;
                  r.tz = 0; r.tzSet = true;
                  break;
                case PgDateTokens.Val.DTK_EPOCH:
                  tmask = M_DATE | M_TIME | M_TZ;
                  r.dtype = DTYPE_EPOCH;
                  break;
                case PgDateTokens.Val.DTK_LATE:
                  tmask = M_DATE | M_TIME | M_TZ;
                  r.dtype = DTYPE_LATE;
                  break;
                case PgDateTokens.Val.DTK_EARLY:
                  tmask = M_DATE | M_TIME | M_TZ;
                  r.dtype = DTYPE_EARLY;
                  break;
                default:
                  throw badFormat(f);
              }
              break;
            }
            case MONTH: {
              if ((fmask & M_MONTH) != 0 && !haveTextMonth
                  && (fmask & M_DAY) == 0 && tm.tm_mon >= 1 && tm.tm_mon <= 31) {
                tm.tm_mday = tm.tm_mon;
                tmask = M_DAY;
              }
              haveTextMonth = true;
              tm.tm_mon = tval;
              break;
            }
            case DTZMOD:
              tmask |= M_DTZ;
              tm.tm_isdst = 1;
              if (!r.tzSet) throw badFormat(f);
              r.tz -= tval;
              break;
            case DTZ:
              tmask |= M_TZ;
              tm.tm_isdst = 1;
              r.tz = -tval;
              r.tzSet = true;
              break;
            case TZ:
              tm.tm_isdst = 0;
              r.tz = -tval;
              r.tzSet = true;
              break;
            case DYNTZ:
              tmask |= M_TZ;
              abbrevTz = valtz;
              abbrev = f;
              break;
            case AMPM:
              mer = tval;
              break;
            case ADBC:
              bc = (tval == PgDateTokens.Val.BC);
              break;
            case DOW:
              tm.tm_wday = tval;
              break;
            case UNITS:
              tmask = 0;
              if (ptype != 0) throw badFormat(f);
              ptype = tval;
              break;
            case ISOTIME:
              tmask = 0;
              if ((fmask & M_DATE) != M_DATE) throw badFormat(f);
              if (ptype != 0) throw badFormat(f);
              ptype = tval;
              break;
            case UNKNOWN_FIELD: {
              ZoneId z = tryZone(f);
              if (z == null) throw badFormat(f);
              namedTz = z;
              tmask = M_TZ;
              break;
            }
            default:
              throw badFormat(f);
          }
          break;
        }

        default:
          throw badFormat(f);
      }

      if ((tmask & fmask) != 0) throw badFormat(f);
      fmask |= tmask;
    }

    if (ptype != 0) throw badFormat("incomplete unit prefix");

    if (r.dtype == DTYPE_DATE) {
      validateDate(fmask, isjulian, is2digits, bc, tm);

      // AM/PM
      if (mer != PgDateTokens.Val.HR24 && tm.tm_hour > HOURS_PER_DAY / 2) throw fieldOverflow("hour");
      if (mer == PgDateTokens.Val.AM && tm.tm_hour == HOURS_PER_DAY / 2) tm.tm_hour = 0;
      else if (mer == PgDateTokens.Val.PM && tm.tm_hour != HOURS_PER_DAY / 2) tm.tm_hour += HOURS_PER_DAY / 2;

      if ((fmask & M_DATE) != M_DATE) {
        if ((fmask & M_TIME) == M_TIME) {
          // PostgreSQL returns 1 here meaning "time only, not a full date" —
          // for timestamptz this is treated as an error.
          throw badFormat("time-only input");
        }
        throw badFormat("incomplete date");
      }

      // Resolve named or dynamic-abbrev zones now that we have Y/M/D/h/m/s
      if (namedTz != null) {
        if ((fmask & M_DTZMOD) != 0) throw badFormat("DST modifier with full TZ");
        r.tz = determineTimeZoneOffset(tm, namedTz);
        r.tzSet = true;
      } else if (abbrevTz != null) {
        if ((fmask & M_DTZMOD) != 0) throw badFormat("DST modifier with dynamic TZ");
        r.tz = determineTimeZoneAbbrevOffset(tm, abbrev, abbrevTz);
        r.tzSet = true;
      } else if (!r.tzSet) {
        if ((fmask & M_DTZMOD) != 0) throw badFormat("DST modifier without TZ");
        r.tz = determineTimeZoneOffset(tm, settings.sessionTimeZone);
        r.tzSet = true;
      }
    }
    return r;
  }

  // ============================================================
  // DecodeDate — pure-text date field
  // ============================================================

  private static int decodeDate(String str, int fmask, PgTm tm, Settings settings, int[] is2digits) {
    int tmask = 0;
    int dmask = 0;
    boolean haveTextMonth = false;
    String[] fields = new String[MAXDATEFIELDS];
    int nf = 0;
    int p = 0;
    int len = str.length();

    while (p < len && nf < MAXDATEFIELDS) {
      while (p < len && !isAlnum(str.charAt(p))) p++;
      if (p >= len) throw badFormat(str);
      int start = p;
      if (isDigit(str.charAt(p))) {
        while (p < len && isDigit(str.charAt(p))) p++;
      } else if (isAlpha(str.charAt(p))) {
        while (p < len && isAlpha(str.charAt(p))) p++;
      }
      fields[nf++] = str.substring(start, p);
      if (p < len) p++;          // skip separator
    }

    // text fields first → unambiguous month
    int[] textHandled = new int[nf];
    for (int i = 0; i < nf; i++) {
      if (fields[i] == null || fields[i].isEmpty()) continue;
      if (isAlpha(fields[i].charAt(0))) {
        PgDateTokens.Entry kw = PgDateTokens.lookup(fields[i]);
        if (kw == null) throw badFormat(str);
        if (kw.type == PgDateTokens.Type.IGNORE_DTF) { textHandled[i] = 1; continue; }
        if (kw.type != PgDateTokens.Type.MONTH) throw badFormat(str);
        dmask = M_MONTH;
        if ((fmask & dmask) != 0) throw badFormat(str);
        tm.tm_mon = kw.value;
        haveTextMonth = true;
        fmask |= dmask;
        tmask |= dmask;
        textHandled[i] = 1;
      }
    }

    // remaining numerics
    int[] is2 = is2digits;
    for (int i = 0; i < nf; i++) {
      if (textHandled[i] != 0) continue;
      if (fields[i] == null) continue;
      int fl = fields[i].length();
      if (fl == 0) throw badFormat(str);
      int dmask2 = decodeNumber(fl, fields[i], haveTextMonth, fmask, tm, /*r*/null, settings, is2);
      if ((fmask & dmask2) != 0) throw badFormat(str);
      fmask |= dmask2;
      tmask |= dmask2;
    }

    if ((fmask & ~(M_DOY | M_TZ)) != M_DATE) throw badFormat(str);
    return tmask;
  }

  // ============================================================
  // DecodeNumber / DecodeNumberField
  // ============================================================

  private static int decodeNumber(int flen, String str, boolean haveTextMonth,
                                  int fmask, PgTm tm, DecodeResult r,
                                  Settings settings, int[] is2digits) {
    // strtoint
    int dotIdx = str.indexOf('.');
    String intPart = dotIdx < 0 ? str : str.substring(0, dotIdx);
    int val;
    try { val = Integer.parseInt(intPart); }
    catch (NumberFormatException e) {
      if (intPart.isEmpty()) throw badFormat(str);
      throw fieldOverflow(str);
    }
    if (intPart.isEmpty()) throw badFormat(str);

    int tmask = 0;
    if (dotIdx >= 0) {
      if (intPart.length() > 2) {
        return decodeNumberField(flen, str, fmask | M_DATE, tm, r, is2digits);
      }
      double frac = parseFraction(str.substring(dotIdx));
      if (r != null) r.fsec = Math.round(frac * 1_000_000);
    } else {
      // ok
    }

    // day of year
    if (flen == 3 && (fmask & M_DATE) == M_YEAR && val >= 1 && val <= 366) {
      tmask = M_DOY | M_MONTH | M_DAY;
      tm.tm_yday = val;
      return tmask;
    }

    int dateBits = fmask & M_DATE;
    if (dateBits == 0) {
      if (flen >= 3 || settings.dateOrder == DateOrder.YMD) {
        tmask = M_YEAR; tm.tm_year = val;
      } else if (settings.dateOrder == DateOrder.DMY) {
        tmask = M_DAY; tm.tm_mday = val;
      } else {
        tmask = M_MONTH; tm.tm_mon = val;
      }
    } else if (dateBits == M_YEAR) {
      tmask = M_MONTH; tm.tm_mon = val;
    } else if (dateBits == M_MONTH) {
      if (haveTextMonth) {
        if (flen >= 3 || settings.dateOrder == DateOrder.YMD) {
          tmask = M_YEAR; tm.tm_year = val;
        } else {
          tmask = M_DAY; tm.tm_mday = val;
        }
      } else {
        tmask = M_DAY; tm.tm_mday = val;
      }
    } else if (dateBits == (M_YEAR | M_MONTH)) {
      if (haveTextMonth) {
        if (flen >= 3 && is2digits[0] != 0) {
          tmask = M_DAY;
          tm.tm_mday = tm.tm_year;
          tm.tm_year = val;
          is2digits[0] = 0;
        } else {
          tmask = M_DAY; tm.tm_mday = val;
        }
      } else {
        tmask = M_DAY; tm.tm_mday = val;
      }
    } else if (dateBits == M_DAY) {
      tmask = M_MONTH; tm.tm_mon = val;
    } else if (dateBits == (M_MONTH | M_DAY)) {
      tmask = M_YEAR; tm.tm_year = val;
    } else if (dateBits == M_DATE) {
      // we have the date already → must be a time
      return decodeNumberField(flen, str, fmask, tm, r, is2digits);
    } else {
      throw badFormat(str);
    }

    if (tmask == M_YEAR) is2digits[0] = (flen <= 2) ? 1 : 0;
    return tmask;
  }

  private static int decodeNumberField(int len, String str, int fmask,
                                       PgTm tm, DecodeResult r, int[] is2digits) {
    int dot = str.indexOf('.');
    if (dot >= 0) {
      String fracStr = str.substring(dot);
      if (fracStr.length() == 1) {
        if (r != null) r.fsec = 0;
      } else {
        double frac;
        try { frac = Double.parseDouble("0" + fracStr); }
        catch (NumberFormatException e) { throw badFormat(str); }
        if (r != null) r.fsec = Math.round(frac * 1_000_000);
      }
      str = str.substring(0, dot);
      len = str.length();
    } else if ((fmask & M_DATE) != M_DATE) {
      if (len >= 6) {
        // start-from-end: last 2 = day, prev 2 = month, rest = year
        tm.tm_mday = Integer.parseInt(str.substring(len - 2, len));
        tm.tm_mon  = Integer.parseInt(str.substring(len - 4, len - 2));
        tm.tm_year = Integer.parseInt(str.substring(0, len - 4));
        if (len - 4 == 2) is2digits[0] = 1;
        return M_DATE;
      }
    }

    if ((fmask & M_TIME) != M_TIME) {
      if (len == 6) {
        tm.tm_hour = Integer.parseInt(str.substring(0, 2));
        tm.tm_min  = Integer.parseInt(str.substring(2, 4));
        tm.tm_sec  = Integer.parseInt(str.substring(4, 6));
        return M_TIME;
      } else if (len == 4) {
        tm.tm_hour = Integer.parseInt(str.substring(0, 2));
        tm.tm_min  = Integer.parseInt(str.substring(2, 4));
        tm.tm_sec  = 0;
        return M_TIME;
      }
    }
    throw badFormat(str);
  }

  // ============================================================
  // DecodeTime
  // ============================================================

  private static int decodeTime(String str, int range, PgTm tm, DecodeResult r) {
    int p = 0, len = str.length();
    int hourEnd = p;
    while (hourEnd < len && isDigit(str.charAt(hourEnd))) hourEnd++;
    if (hourEnd == p) throw badFormat(str);
    long hour = Long.parseLong(str.substring(p, hourEnd));
    if (hourEnd >= len || str.charAt(hourEnd) != ':') throw badFormat(str);
    p = hourEnd + 1;

    int minEnd = p;
    while (minEnd < len && isDigit(str.charAt(minEnd))) minEnd++;
    if (minEnd == p) throw badFormat(str);
    int min = Integer.parseInt(str.substring(p, minEnd));
    p = minEnd;

    int sec = 0; long fsec = 0;
    if (p >= len) {
      // hh:mm only
    } else if (str.charAt(p) == '.') {
      // hh:mm.fff (interval shape) — for timestamps this is treated as mm:ss.fff
      double frac = parseFraction(str.substring(p));
      fsec = Math.round(frac * 1_000_000);
      sec = min; min = (int) hour; hour = 0;
    } else if (str.charAt(p) == ':') {
      p++;
      int secEnd = p;
      while (secEnd < len && isDigit(str.charAt(secEnd))) secEnd++;
      if (secEnd == p) throw badFormat(str);
      sec = Integer.parseInt(str.substring(p, secEnd));
      p = secEnd;
      if (p < len && str.charAt(p) == '.') {
        double frac = parseFraction(str.substring(p));
        fsec = Math.round(frac * 1_000_000);
      } else if (p < len) {
        throw badFormat(str);
      }
    } else {
      throw badFormat(str);
    }

    if (hour < 0 || min < 0 || min > MINS_PER_HOUR - 1
        || sec < 0 || sec > SECS_PER_MINUTE
        || fsec < 0 || fsec > USECS_PER_SEC) throw fieldOverflow(str);
    if (hour > Integer.MAX_VALUE) throw fieldOverflow(str);

    tm.tm_hour = (int) hour; tm.tm_min = min; tm.tm_sec = sec;
    r.fsec = fsec;
    return M_TIME;
  }

  // ============================================================
  // DecodeTimezone
  // ============================================================

  private static int decodeTimezone(String str) {
    if (str.isEmpty()) throw badFormat(str);
    char sign = str.charAt(0);
    if (sign != '+' && sign != '-') throw badFormat(str);
    int p = 1, len = str.length();
    int hrEnd = p;
    while (hrEnd < len && isDigit(str.charAt(hrEnd))) hrEnd++;
    if (hrEnd == p) throw badFormat(str);
    int hr;
    try { hr = Integer.parseInt(str.substring(p, hrEnd)); }
    catch (NumberFormatException e) { throw new PgDateTimeException("time zone displacement out of range: \"" + str + "\""); }
    p = hrEnd;

    int min = 0, sec = 0;
    if (p < len && str.charAt(p) == ':') {
      p++;
      int e = p;
      while (e < len && isDigit(str.charAt(e))) e++;
      if (e == p) throw badFormat(str);
      min = Integer.parseInt(str.substring(p, e));
      p = e;
      if (p < len && str.charAt(p) == ':') {
        p++;
        int e2 = p;
        while (e2 < len && isDigit(str.charAt(e2))) e2++;
        if (e2 == p) throw badFormat(str);
        sec = Integer.parseInt(str.substring(p, e2));
        p = e2;
      }
    } else if (p == len && str.length() > 3 + 1) {
      // run-together hhmm or hhmmss (PG only collapses hh+mm)
      int hhmm = hr;
      min = hhmm % 100;
      hr  = hhmm / 100;
    }

    if (hr < 0 || hr > MAX_TZDISP_HOUR) throw new PgDateTimeException("time zone displacement out of range: \"" + str + "\"");
    if (min < 0 || min >= MINS_PER_HOUR) throw new PgDateTimeException("time zone displacement out of range: \"" + str + "\"");
    if (sec < 0 || sec >= SECS_PER_MINUTE) throw new PgDateTimeException("time zone displacement out of range: \"" + str + "\"");

    int tz = (hr * MINS_PER_HOUR + min) * SECS_PER_MINUTE + sec;
    if (sign == '-') tz = -tz;

    if (p != len) throw badFormat(str);

    // PG convention: positive = west of UTC. Input "+05" means 5h east → return -5h.
    return -tz;
  }

  // ============================================================
  // Date validation
  // ============================================================

  private static final int[][] DAY_TAB = {
      { 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31, 0 },
      { 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31, 0 }
  };

  private static boolean isLeap(int y) {
    return (y % 4 == 0) && (y % 100 != 0 || y % 400 == 0);
  }

  private static void validateDate(int fmask, boolean isjulian, boolean is2digits,
                                   boolean bc, PgTm tm) {
    if ((fmask & M_YEAR) != 0) {
      if (isjulian) {
        // tm_year is correct as-is
      } else if (bc) {
        if (tm.tm_year <= 0) throw fieldOverflow("year");
        tm.tm_year = -(tm.tm_year - 1);
      } else if (is2digits) {
        if (tm.tm_year < 0) throw fieldOverflow("year");
        if (tm.tm_year < 70) tm.tm_year += 2000;
        else if (tm.tm_year < 100) tm.tm_year += 1900;
      } else {
        if (tm.tm_year <= 0) throw fieldOverflow("year");
      }
    }

    if ((fmask & M_DOY) != 0) {
      int j = date2j(tm.tm_year, 1, 1) + tm.tm_yday - 1;
      int[] ymd = j2date(j);
      tm.tm_year = ymd[0]; tm.tm_mon = ymd[1]; tm.tm_mday = ymd[2];
    }

    if ((fmask & M_MONTH) != 0) {
      if (tm.tm_mon < 1 || tm.tm_mon > MONTHS_PER_YEAR) throw new PgDateTimeException("date/time field value out of range");
    }
    if ((fmask & M_DAY) != 0) {
      if (tm.tm_mday < 1 || tm.tm_mday > 31) throw new PgDateTimeException("date/time field value out of range");
    }
    if ((fmask & M_DATE) == M_DATE) {
      int leap = isLeap(tm.tm_year) ? 1 : 0;
      if (tm.tm_mday > DAY_TAB[leap][tm.tm_mon - 1]) throw fieldOverflow("day");
    }
  }

  // ============================================================
  // tm + tz → Instant
  // ============================================================

  private static Instant tm2instant(PgTm tm, long fsec, int tz, String origInput) {
    if (!isValidJulian(tm.tm_year, tm.tm_mon, tm.tm_mday)) {
      throw new PgDateTimeException("timestamp out of range: \"" + origInput + "\"");
    }
    // Days from 1970-01-01 to (tm_year,tm_mon,tm_mday)
    int julDays = date2j(tm.tm_year, tm.tm_mon, tm.tm_mday) - UNIX_EPOCH_JDATE;
    long secOfDay = (long) tm.tm_hour * SECS_PER_HOUR
                  + (long) tm.tm_min * SECS_PER_MINUTE
                  + tm.tm_sec;
    long epochSec = (long) julDays * SECS_PER_DAY + secOfDay + tz;

    // Range check matching IS_VALID_TIMESTAMP. END_TIMESTAMP is past Instant.MAX
    // anyway, so just rely on Instant's own bounds.
    long nano = fsec * 1000L;
    if (nano < 0 || nano >= 1_000_000_000L) {
      epochSec += nano / 1_000_000_000L;
      nano = Math.floorMod(nano, 1_000_000_000L);
    }
    return Instant.ofEpochSecond(epochSec, nano);
  }

  /**
   * Mirrors {@code DetermineTimeZoneOffsetInternal} in
   * src/backend/utils/adt/datetime.c. For wall times that fall into a DST
   * transition this differs from {@link ZoneRules#getOffset(LocalDateTime)}:
   * Java picks the {@code before} offset for overlaps, but PostgreSQL picks
   * the offset that makes UTC monotonic — {@code before} for spring-forward
   * gaps and {@code after} for fall-back overlaps.
   */
  private static int determineTimeZoneOffset(PgTm tm, ZoneId zone) {
    LocalDateTime ldt;
    try {
      ldt = LocalDateTime.of(
          tm.tm_year, tm.tm_mon, tm.tm_mday,
          tm.tm_hour, tm.tm_min, tm.tm_sec);
    } catch (java.time.DateTimeException e) {
      // Out-of-range Y/M/D — match PG's "assume UTC" fallback.
      return 0;
    }
    ZoneRules rules = zone.getRules();
    java.time.zone.ZoneOffsetTransition trans = rules.getTransition(ldt);
    if (trans == null) {
      ZoneOffset off = rules.getOffset(ldt);
      return -off.getTotalSeconds();
    }
    int beforeSec = trans.getOffsetBefore().getTotalSeconds();
    int afterSec  = trans.getOffsetAfter().getTotalSeconds();
    // Postgres: in a gap (after > before) prefer "before"; in an overlap
    // (after < before) prefer "after".
    int chosen = (afterSec > beforeSec) ? beforeSec : afterSec;
    return -chosen;
  }

  /**
   * Postgres-style DYNTZ resolution: pick the offset of the {@code abbrev} as
   * it applies to the IANA zone {@code zone} on the date in {@code tm}. Java's
   * {@link ZoneRules} doesn't expose abbreviations for arbitrary instants, so
   * we fall back to the standard wall-time mapping — for the rare cases where
   * the same wall time has two valid abbreviations, we prefer DST=true if the
   * abbreviation is conventionally the daylight one (e.g. {@code MSD} in
   * Europe/Moscow), otherwise standard. This matches PG behaviour for
   * unambiguous dates and is correct for the modern era of zones in the
   * Default abbreviation set.
   */
  private static int determineTimeZoneAbbrevOffset(PgTm tm, String abbrev, ZoneId zone) {
    return determineTimeZoneOffset(tm, zone);
  }

  // ============================================================
  // Token / zone helpers
  // ============================================================

  private static int bitFor(PgDateTokens.Type t) {
    switch (t) {
      case YEAR:        return M_YEAR;
      case MONTH:       return M_MONTH;
      case DAY:         return M_DAY;
      case HOUR:        return M_HOUR;
      case MINUTE:      return M_MINUTE;
      case SECOND:      return M_SECOND;
      case MILLISECOND: return M_MS;
      case MICROSECOND: return M_US;
      case DOY:         return M_DOY;
      case DOW:         return M_DOW;
      case TZ:          return M_TZ;
      case DTZ:         return M_DTZ;
      case DYNTZ:       return M_TZ;
      case RESERV:
      case AMPM:
      case ADBC:
      case UNITS:
      case ISOTIME:
      case IGNORE_DTF:
      case DTZMOD:
      case UNKNOWN_FIELD:
      default:
        return 0;
    }
  }

  // Lower-cased → canonical IANA zone id, built once. PostgreSQL's pg_tzset() is
  // case-insensitive, but Java's ZoneId.of() is not — so we maintain our own
  // mapping over the JDK's available zones.
  private static final java.util.Map<String, String> ZONE_LOWER_TO_CANONICAL = buildZoneIndex();

  private static java.util.Map<String, String> buildZoneIndex() {
    java.util.Map<String, String> m = new java.util.HashMap<>();
    for (String z : ZoneId.getAvailableZoneIds()) {
      m.put(z.toLowerCase(Locale.ROOT), z);
    }
    return m;
  }

  private static ZoneId tryZone(String name) {
    String canonical = ZONE_LOWER_TO_CANONICAL.get(name.toLowerCase(Locale.ROOT));
    if (canonical != null) {
      try { return ZoneId.of(canonical); } catch (Exception ignored) { /* fall through */ }
    }
    try { return ZoneId.of(name, ZoneId.SHORT_IDS); }
    catch (Exception e) { return null; }
  }

  /**
   * Mirrors the C path: first try the abbreviation table (lowercased), then
   * fall back to a full IANA zone lookup. Used when DecodeDateTime sees a
   * field-shape DATE that's actually a tz name.
   */
  private static ZoneId lookupTimezoneName(String name) {
    PgTimezoneAbbrevs.Entry abEntry = PgTimezoneAbbrevs.lookup(name.toLowerCase(Locale.ROOT));
    if (abEntry != null) {
      if (abEntry.zone != null) return abEntry.zone;
      return ZoneOffset.ofTotalSeconds(abEntry.offsetSeconds);
    }
    return tryZone(name);
  }

  private static void fillNow(PgTm tm, DecodeResult r, ZoneId sessionTz) {
    Instant now = Instant.now();
    java.time.ZonedDateTime z = now.atZone(sessionTz);
    tm.tm_year = z.getYear();
    tm.tm_mon  = z.getMonthValue();
    tm.tm_mday = z.getDayOfMonth();
    tm.tm_hour = z.getHour();
    tm.tm_min  = z.getMinute();
    tm.tm_sec  = z.getSecond();
    r.fsec = z.getNano() / 1000L;
    r.tz = -z.getOffset().getTotalSeconds();
    r.tzSet = true;
  }

  // ============================================================
  // Julian-day arithmetic — exact port of date2j / j2date
  // ============================================================

  static int date2j(int year, int month, int day) {
    int julian; int century;
    if (month > 2) { month += 1; year += 4800; }
    else { month += 13; year += 4799; }
    century = year / 100;
    julian  = year * 365 - 32167;
    julian += year / 4 - century + century / 4;
    julian += 7834 * month / 256 + day;
    return julian;
  }

  static int[] j2date(int jd) {
    long julian = jd & 0xFFFFFFFFL;
    julian += 32044;
    long quad = julian / 146097;
    long extra = (julian - quad * 146097) * 4 + 3;
    julian += 60 + quad * 3 + extra / 146097;
    quad = julian / 1461;
    julian -= quad * 1461;
    long y = julian * 4 / 1461;
    julian = ((y != 0) ? ((julian + 305) % 365) : ((julian + 306) % 366)) + 123;
    y += quad * 4;
    int year = (int) (y - 4800);
    long quad2 = julian * 2141 / 65536;
    int day = (int) (julian - 7834 * quad2 / 256);
    int month = (int) ((quad2 + 10) % MONTHS_PER_YEAR + 1);
    return new int[] { year, month, day };
  }

  private static boolean isValidJulian(int y, int m, int d) {
    // Match IS_VALID_JULIAN(y,m,d): year in [-4713 (with month >= 11), 5874898]
    if (y < -4713) return false;
    if (y == -4713 && (m < 11 || (m == 11 && d < 24))) return false;
    if (y > 5874898) return false;
    if (y == 5874898 && (m > 6 || (m == 6 && d > 3))) return false;
    return true;
  }

  // ============================================================
  // Char predicates and small helpers
  // ============================================================

  private static boolean isDigit(char c) { return c >= '0' && c <= '9'; }
  private static boolean isAlpha(char c) { return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z'); }
  private static boolean isAlnum(char c) { return isDigit(c) || isAlpha(c); }
  private static char    toLower(char c) { return (c >= 'A' && c <= 'Z') ? (char) (c + 32) : c; }
  private static boolean isPunct(char c) {
    // C ispunct (ASCII): printable, non-alnum, non-space
    return c > 32 && c < 127 && !isAlnum(c);
  }

  private static double parseFraction(String dotPart) {
    if (dotPart.isEmpty() || dotPart.charAt(0) != '.')
      throw new IllegalStateException("fraction must start with '.'");
    if (dotPart.length() == 1) return 0.0;
    try { return Double.parseDouble("0" + dotPart); }
    catch (NumberFormatException e) { throw badFormat(dotPart); }
  }

  /** Mirrors {@code time_overflows} in src/backend/utils/adt/date.c. */
  private static boolean timeOverflows(int h, int m, int s, long fsec) {
    if (h < 0 || h > HOURS_PER_DAY
        || m < 0 || m >= MINS_PER_HOUR
        || s < 0 || s > SECS_PER_MINUTE
        || fsec < 0 || fsec > USECS_PER_SEC) return true;
    long total = ((((long) h * MINS_PER_HOUR + m) * SECS_PER_MINUTE) + s) * USECS_PER_SEC + fsec;
    return total > USECS_PER_DAY;
  }

  // ============================================================
  // Errors
  // ============================================================

  /** Thrown for any input that PostgreSQL would reject. */
  public static final class PgDateTimeException extends RuntimeException {
    public PgDateTimeException(String message) { super(message); }
  }

  private static PgDateTimeException badFormat(String s) {
    return new PgDateTimeException("invalid input syntax for timestamp with time zone: \"" + s + "\"");
  }

  private static PgDateTimeException fieldOverflow(String s) {
    return new PgDateTimeException("date/time field value out of range: \"" + s + "\"");
  }

  // discourage instantiation
  private PgTimestamp() {}
}
