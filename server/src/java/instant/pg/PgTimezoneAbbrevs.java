package instant.pg;

import java.time.ZoneId;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * PostgreSQL "Default" timezone abbreviation set.
 *
 * Mirrors src/timezone/tznames/Default in the PostgreSQL source. Each
 * abbreviation is one of:
 *
 *   - TZ:    fixed UTC offset (seconds, ISO sign convention: positive east)
 *   - DTZ:   fixed UTC offset, marked as a daylight-savings abbreviation
 *   - DYNTZ: a reference to a full IANA zone; the actual offset depends on
 *            the date being parsed and is resolved later
 *
 * Lookups are case-insensitive (PostgreSQL lower-cases input before search).
 *
 * Token comparison is truncated to TOKMAXLEN (10) characters to match
 * PostgreSQL semantics, but every abbreviation in the Default set is short
 * enough that this only matters for the keyword table in {@link PgDateTokens}.
 */
final class PgTimezoneAbbrevs {

  private PgTimezoneAbbrevs() {}

  static final class Entry {
    final String token;          // lower-cased
    final PgDateTokens.Type type; // TZ, DTZ, DYNTZ
    final int offsetSeconds;     // for TZ/DTZ; 0 for DYNTZ
    final ZoneId zone;           // for DYNTZ; null for TZ/DTZ

    Entry(String token, PgDateTokens.Type type, int offsetSeconds, ZoneId zone) {
      this.token = token;
      this.type = type;
      this.offsetSeconds = offsetSeconds;
      this.zone = zone;
    }
  }

  private static final Map<String, Entry> TABLE = build();

  static Entry lookup(String lowtoken) {
    if (lowtoken == null) return null;
    // strncmp(lowtoken, token, TOKMAXLEN=10) — truncate input to 10
    String key = lowtoken.length() > 10 ? lowtoken.substring(0, 10) : lowtoken;
    return TABLE.get(key);
  }

  private static Map<String, Entry> build() {
    Map<String, Entry> m = new HashMap<>();
    // Fixed offsets and DST-marked offsets (TZ / DTZ)
    fixed(m, "EAT",   10800, false);
    fixed(m, "SAST",   7200, false);
    fixed(m, "WAT",    3600, false);
    fixed(m, "ACT",  -18000, false);
    fixed(m, "AKDT", -28800, true);
    fixed(m, "AKST", -32400, false);
    dyn  (m, "ART",  "America/Argentina/Buenos_Aires");
    dyn  (m, "ARST", "America/Argentina/Buenos_Aires");
    fixed(m, "BOT",  -14400, false);
    fixed(m, "BRA",  -10800, false);
    fixed(m, "BRST",  -7200, true);
    fixed(m, "BRT",  -10800, false);
    fixed(m, "COT",  -18000, false);
    fixed(m, "CDT",  -18000, true);
    fixed(m, "CLST", -10800, true);
    dyn  (m, "CLT",  "America/Santiago");
    fixed(m, "CST",  -21600, false);
    fixed(m, "EDT",  -14400, true);
    fixed(m, "EGST",      0, true);
    fixed(m, "EGT",   -3600, false);
    fixed(m, "EST",  -18000, false);
    fixed(m, "FNT",   -7200, false);
    fixed(m, "FNST",  -3600, true);
    fixed(m, "GFT",  -10800, false);
    dyn  (m, "GYT",  "America/Guyana");
    fixed(m, "MDT",  -21600, true);
    fixed(m, "MST",  -25200, false);
    fixed(m, "NDT",   -9000, true);
    fixed(m, "NFT",  -12600, false);
    fixed(m, "NST",  -12600, false);
    fixed(m, "PET",  -18000, false);
    fixed(m, "PDT",  -25200, true);
    fixed(m, "PMDT",  -7200, true);
    fixed(m, "PMST", -10800, false);
    fixed(m, "PST",  -28800, false);
    fixed(m, "PYST", -10800, true);
    dyn  (m, "PYT",  "America/Asuncion");
    fixed(m, "UYST",  -7200, true);
    fixed(m, "UYT",  -10800, false);
    dyn  (m, "VET",  "America/Caracas");
    fixed(m, "WGST",  -7200, true);
    fixed(m, "WGT",  -10800, false);
    dyn  (m, "DAVT", "Antarctica/Davis");
    fixed(m, "DDUT",  36000, false);
    dyn  (m, "MAWT", "Antarctica/Mawson");
    fixed(m, "AFT",   16200, false);
    fixed(m, "ALMT",  21600, false);
    fixed(m, "ALMST", 25200, true);
    dyn  (m, "AMST", "Asia/Yerevan");
    fixed(m, "AMT",  -14400, false);
    dyn  (m, "ANAST","Asia/Anadyr");
    dyn  (m, "ANAT", "Asia/Anadyr");
    dyn  (m, "AZST", "Asia/Baku");
    dyn  (m, "AZT",  "Asia/Baku");
    fixed(m, "BDT",   21600, false);
    fixed(m, "BNT",   28800, false);
    fixed(m, "BORT",  28800, false);
    fixed(m, "BTT",   21600, false);
    fixed(m, "CCT",   28800, false);
    dyn  (m, "GEST", "Asia/Tbilisi");
    dyn  (m, "GET",  "Asia/Tbilisi");
    fixed(m, "HKT",   28800, false);
    fixed(m, "ICT",   25200, false);
    fixed(m, "IDT",   10800, true);
    dyn  (m, "IRKST","Asia/Irkutsk");
    dyn  (m, "IRKT", "Asia/Irkutsk");
    fixed(m, "IRT",   12600, false);
    fixed(m, "IST",    7200, false);
    fixed(m, "JAYT",  32400, false);
    fixed(m, "JST",   32400, false);
    fixed(m, "KDT",   36000, true);
    fixed(m, "KGST",  21600, true);
    dyn  (m, "KGT",  "Asia/Bishkek");
    dyn  (m, "KRAST","Asia/Krasnoyarsk");
    dyn  (m, "KRAT", "Asia/Krasnoyarsk");
    fixed(m, "KST",   32400, false);
    dyn  (m, "LKT",  "Asia/Colombo");
    dyn  (m, "MAGST","Asia/Magadan");
    dyn  (m, "MAGT", "Asia/Magadan");
    fixed(m, "MMT",   23400, false);
    fixed(m, "MYT",   28800, false);
    dyn  (m, "NOVST","Asia/Novosibirsk");
    dyn  (m, "NOVT", "Asia/Novosibirsk");
    fixed(m, "NPT",   20700, false);
    dyn  (m, "OMSST","Asia/Omsk");
    dyn  (m, "OMST", "Asia/Omsk");
    dyn  (m, "PETST","Asia/Kamchatka");
    dyn  (m, "PETT", "Asia/Kamchatka");
    fixed(m, "PHT",   28800, false);
    fixed(m, "PKT",   18000, false);
    fixed(m, "PKST",  21600, true);
    fixed(m, "SGT",   28800, false);
    fixed(m, "TJT",   18000, false);
    dyn  (m, "TMT",  "Asia/Ashgabat");
    fixed(m, "ULAST", 32400, true);
    dyn  (m, "ULAT", "Asia/Ulaanbaatar");
    fixed(m, "UZST",  21600, true);
    fixed(m, "UZT",   18000, false);
    dyn  (m, "VLAST","Asia/Vladivostok");
    dyn  (m, "VLAT", "Asia/Vladivostok");
    fixed(m, "XJT",   21600, false);
    dyn  (m, "YAKST","Asia/Yakutsk");
    dyn  (m, "YAKT", "Asia/Yakutsk");
    fixed(m, "YEKST", 21600, true);
    dyn  (m, "YEKT", "Asia/Yekaterinburg");
    fixed(m, "ADT",  -10800, true);
    fixed(m, "AST",  -14400, false);
    fixed(m, "AZOST",     0, true);
    fixed(m, "AZOT",  -3600, false);
    dyn  (m, "FKST", "Atlantic/Stanley");
    dyn  (m, "FKT",  "Atlantic/Stanley");
    fixed(m, "ACSST", 37800, true);
    fixed(m, "ACDT",  37800, true);
    fixed(m, "ACST",  34200, false);
    fixed(m, "ACWST", 31500, false);
    fixed(m, "AESST", 39600, true);
    fixed(m, "AEDT",  39600, true);
    fixed(m, "AEST",  36000, false);
    fixed(m, "AWSST", 32400, true);
    fixed(m, "AWST",  28800, false);
    fixed(m, "CADT",  37800, true);
    fixed(m, "CAST",  34200, false);
    dyn  (m, "LHDT", "Australia/Lord_Howe");
    fixed(m, "LHST",  37800, false);
    fixed(m, "LIGT",  36000, false);
    fixed(m, "NZT",   43200, false);
    fixed(m, "SADT",  37800, true);
    fixed(m, "WADT",  28800, true);
    fixed(m, "WAST",  25200, false);
    fixed(m, "WDT",   32400, true);
    fixed(m, "GMT",       0, false);
    fixed(m, "UCT",       0, false);
    fixed(m, "UT",        0, false);
    fixed(m, "UTC",       0, false);
    fixed(m, "Z",         0, false);
    fixed(m, "ZULU",      0, false);
    fixed(m, "BST",    3600, true);
    fixed(m, "BDST",   7200, true);
    fixed(m, "CEST",   7200, true);
    fixed(m, "CET",    3600, false);
    fixed(m, "CETDST", 7200, true);
    fixed(m, "EEST",  10800, true);
    fixed(m, "EET",    7200, false);
    fixed(m, "EETDST",10800, true);
    fixed(m, "FET",   10800, false);
    fixed(m, "MEST",   7200, true);
    fixed(m, "MESZ",   7200, true);
    fixed(m, "MET",    3600, false);
    fixed(m, "METDST", 7200, true);
    fixed(m, "MEZ",    3600, false);
    fixed(m, "MSD",   14400, true);
    dyn  (m, "MSK",  "Europe/Moscow");
    dyn  (m, "VOLT", "Europe/Volgograd");
    fixed(m, "WET",       0, false);
    fixed(m, "WETDST", 3600, true);
    fixed(m, "CXT",   25200, false);
    dyn  (m, "IOT",  "Indian/Chagos");
    fixed(m, "MUT",   14400, false);
    fixed(m, "MUST",  18000, true);
    fixed(m, "MVT",   18000, false);
    fixed(m, "RET",   14400, false);
    fixed(m, "SCT",   14400, false);
    fixed(m, "TFT",   18000, false);
    fixed(m, "CHADT", 49500, true);
    fixed(m, "CHAST", 45900, false);
    fixed(m, "CHUT",  36000, false);
    dyn  (m, "CKT",  "Pacific/Rarotonga");
    dyn  (m, "EASST","Pacific/Easter");
    dyn  (m, "EAST", "Pacific/Easter");
    fixed(m, "FJST",  46800, true);
    fixed(m, "FJT",   43200, false);
    fixed(m, "GALT", -21600, false);
    fixed(m, "GAMT", -32400, false);
    fixed(m, "GILT",  43200, false);
    fixed(m, "HST",  -36000, false);
    dyn  (m, "KOST", "Pacific/Kosrae");
    dyn  (m, "LINT", "Pacific/Kiritimati");
    fixed(m, "MART", -34200, false);
    fixed(m, "MHT",   43200, false);
    fixed(m, "MPT",   36000, false);
    dyn  (m, "NUT",  "Pacific/Niue");
    fixed(m, "NZDT",  46800, true);
    fixed(m, "NZST",  43200, false);
    fixed(m, "PGT",   36000, false);
    fixed(m, "PONT",  39600, false);
    fixed(m, "PWT",   32400, false);
    fixed(m, "TAHT", -36000, false);
    dyn  (m, "TKT",  "Pacific/Fakaofo");
    fixed(m, "TOT",   46800, false);
    fixed(m, "TRUT",  36000, false);
    fixed(m, "TVT",   43200, false);
    fixed(m, "VUT",   39600, false);
    fixed(m, "WAKT",  43200, false);
    fixed(m, "WFT",   43200, false);
    fixed(m, "YAPT",  36000, false);
    return m;
  }

  private static void fixed(Map<String, Entry> m, String tok, int offsetSec, boolean isDst) {
    String k = tok.toLowerCase(Locale.ROOT);
    m.put(k, new Entry(k, isDst ? PgDateTokens.Type.DTZ : PgDateTokens.Type.TZ,
                       offsetSec, null));
  }

  private static void dyn(Map<String, Entry> m, String tok, String zoneId) {
    String k = tok.toLowerCase(Locale.ROOT);
    m.put(k, new Entry(k, PgDateTokens.Type.DYNTZ, 0, ZoneId.of(zoneId)));
  }
}
