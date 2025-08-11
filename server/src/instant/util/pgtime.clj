(ns instant.util.pgtime
  (:import
   (java.time.format DateTimeFormatterBuilder)
   (java.time.temporal ChronoField)))

(set! *warn-on-reflection* true)

(comment
  ;; Refresh the pg-timezone-abbrevs with:
  (tool/with-prod-conn [conn]
    #_{:clj-kondo/ignore [:unresolved-namespace]}
    (instant.jdbc.sql/select conn ["select abbrev, extract(epoch from utc_offset)::bigint as offset, extract(hour from utc_offset)::int as hour, extract(minute from utc_offset)::int as minute, extract(second from utc_offset)::int as second from pg_timezone_abbrevs"])))

(def pg-timezone-abbrevs
  ;; sort them by reverse alphabetical to prevent substring matches
  ;; CETDST needs to be before CET or else it will succeed in parsing
  ;; CET and think it's done
  (reverse
   (sort-by :abbrev
            [{:abbrev "ACDT", :offset 37800}
             {:abbrev "ACSST", :offset 37800}
             {:abbrev "ACST", :offset 34200}
             {:abbrev "ACT", :offset -18000}
             {:abbrev "ACWST", :offset 31500}
             {:abbrev "ADT", :offset -10800}
             {:abbrev "AEDT", :offset 39600}
             {:abbrev "AESST", :offset 39600}
             {:abbrev "AEST", :offset 36000}
             {:abbrev "AFT", :offset 16200}
             {:abbrev "AKDT", :offset -28800}
             {:abbrev "AKST", :offset -32400}
             {:abbrev "ALMST", :offset 25200}
             {:abbrev "ALMT", :offset 21600}
             {:abbrev "AMST", :offset 14400}
             {:abbrev "AMT", :offset -14400}
             {:abbrev "ANAST", :offset 43200}
             {:abbrev "ANAT", :offset 43200}
             {:abbrev "ARST", :offset -10800}
             {:abbrev "ART", :offset -10800}
             {:abbrev "AST", :offset -14400}
             {:abbrev "AWSST", :offset 32400}
             {:abbrev "AWST", :offset 28800}
             {:abbrev "AZOST", :offset 0}
             {:abbrev "AZOT", :offset -3600}
             {:abbrev "AZST", :offset 14400}
             {:abbrev "AZT", :offset 14400}
             {:abbrev "BDST", :offset 7200}
             {:abbrev "BDT", :offset 21600}
             {:abbrev "BNT", :offset 28800}
             {:abbrev "BORT", :offset 28800}
             {:abbrev "BOT", :offset -14400}
             {:abbrev "BRA", :offset -10800}
             {:abbrev "BRST", :offset -7200}
             {:abbrev "BRT", :offset -10800}
             {:abbrev "BST", :offset 3600}
             {:abbrev "BTT", :offset 21600}
             {:abbrev "CADT", :offset 37800}
             {:abbrev "CAST", :offset 34200}
             {:abbrev "CCT", :offset 28800}
             {:abbrev "CDT", :offset -18000}
             {:abbrev "CEST", :offset 7200}
             {:abbrev "CET", :offset 3600}
             {:abbrev "CETDST", :offset 7200}
             {:abbrev "CHADT", :offset 49500}
             {:abbrev "CHAST", :offset 45900}
             {:abbrev "CHUT", :offset 36000}
             {:abbrev "CKT", :offset -36000}
             {:abbrev "CLST", :offset -10800}
             {:abbrev "CLT", :offset -14400}
             {:abbrev "COT", :offset -18000}
             {:abbrev "CST", :offset -21600}
             {:abbrev "CXT", :offset 25200}
             {:abbrev "DAVT", :offset 25200}
             {:abbrev "DDUT", :offset 36000}
             {:abbrev "EASST", :offset -21600}
             {:abbrev "EAST", :offset -21600}
             {:abbrev "EAT", :offset 10800}
             {:abbrev "EDT", :offset -14400}
             {:abbrev "EEST", :offset 10800}
             {:abbrev "EET", :offset 7200}
             {:abbrev "EETDST", :offset 10800}
             {:abbrev "EGST", :offset 0}
             {:abbrev "EGT", :offset -3600}
             {:abbrev "EST", :offset -18000}
             {:abbrev "FET", :offset 10800}
             {:abbrev "FJST", :offset 46800}
             {:abbrev "FJT", :offset 43200}
             {:abbrev "FKST", :offset -10800}
             {:abbrev "FKT", :offset -10800}
             {:abbrev "FNST", :offset -3600}
             {:abbrev "FNT", :offset -7200}
             {:abbrev "GALT", :offset -21600}
             {:abbrev "GAMT", :offset -32400}
             {:abbrev "GEST", :offset 14400}
             {:abbrev "GET", :offset 14400}
             {:abbrev "GFT", :offset -10800}
             {:abbrev "GILT", :offset 43200}
             {:abbrev "GMT", :offset 0}
             {:abbrev "GYT", :offset -14400}
             {:abbrev "HKT", :offset 28800}
             {:abbrev "HST", :offset -36000}
             {:abbrev "ICT", :offset 25200}
             {:abbrev "IDT", :offset 10800}
             {:abbrev "IOT", :offset 21600}
             {:abbrev "IRKST", :offset 28800}
             {:abbrev "IRKT", :offset 28800}
             {:abbrev "IRT", :offset 12600}
             {:abbrev "IST", :offset 7200}
             {:abbrev "JAYT", :offset 32400}
             {:abbrev "JST", :offset 32400}
             {:abbrev "KDT", :offset 36000}
             {:abbrev "KGST", :offset 21600}
             {:abbrev "KGT", :offset 21600}
             {:abbrev "KOST", :offset 39600}
             {:abbrev "KRAST", :offset 25200}
             {:abbrev "KRAT", :offset 25200}
             {:abbrev "KST", :offset 32400}
             {:abbrev "LHDT", :offset 37800}
             {:abbrev "LHST", :offset 37800}
             {:abbrev "LIGT", :offset 36000}
             {:abbrev "LINT", :offset 50400}
             {:abbrev "LKT", :offset 19800}
             {:abbrev "MAGST", :offset 39600}
             {:abbrev "MAGT", :offset 39600}
             {:abbrev "MART", :offset -34200}
             {:abbrev "MAWT", :offset 18000}
             {:abbrev "MDT", :offset -21600}
             {:abbrev "MEST", :offset 7200}
             {:abbrev "MESZ", :offset 7200}
             {:abbrev "MET", :offset 3600}
             {:abbrev "METDST", :offset 7200}
             {:abbrev "MEZ", :offset 3600}
             {:abbrev "MHT", :offset 43200}
             {:abbrev "MMT", :offset 23400}
             {:abbrev "MPT", :offset 36000}
             {:abbrev "MSD", :offset 14400}
             {:abbrev "MSK", :offset 10800}
             {:abbrev "MST", :offset -25200}
             {:abbrev "MUST", :offset 18000}
             {:abbrev "MUT", :offset 14400}
             {:abbrev "MVT", :offset 18000}
             {:abbrev "MYT", :offset 28800}
             {:abbrev "NDT", :offset -9000}
             {:abbrev "NFT", :offset -12600}
             {:abbrev "NOVST", :offset 25200}
             {:abbrev "NOVT", :offset 25200}
             {:abbrev "NPT", :offset 20700}
             {:abbrev "NST", :offset -12600}
             {:abbrev "NUT", :offset -39600}
             {:abbrev "NZDT", :offset 46800}
             {:abbrev "NZST", :offset 43200}
             {:abbrev "NZT", :offset 43200}
             {:abbrev "OMSST", :offset 21600}
             {:abbrev "OMST", :offset 21600}
             {:abbrev "PDT", :offset -25200}
             {:abbrev "PET", :offset -18000}
             {:abbrev "PETST", :offset 43200}
             {:abbrev "PETT", :offset 43200}
             {:abbrev "PGT", :offset 36000}
             {:abbrev "PHT", :offset 28800}
             {:abbrev "PKST", :offset 21600}
             {:abbrev "PKT", :offset 18000}
             {:abbrev "PMDT", :offset -7200}
             {:abbrev "PMST", :offset -10800}
             {:abbrev "PONT", :offset 39600}
             {:abbrev "PST", :offset -28800}
             {:abbrev "PWT", :offset 32400}
             {:abbrev "PYST", :offset -10800}
             {:abbrev "PYT", :offset -14400}
             {:abbrev "RET", :offset 14400}
             {:abbrev "SADT", :offset 37800}
             {:abbrev "SAST", :offset 7200}
             {:abbrev "SCT", :offset 14400}
             {:abbrev "SGT", :offset 28800}
             {:abbrev "TAHT", :offset -36000}
             {:abbrev "TFT", :offset 18000}
             {:abbrev "TJT", :offset 18000}
             {:abbrev "TKT", :offset 46800}
             {:abbrev "TMT", :offset 18000}
             {:abbrev "TOT", :offset 46800}
             {:abbrev "TRUT", :offset 36000}
             {:abbrev "TVT", :offset 43200}
             {:abbrev "UCT", :offset 0}
             {:abbrev "ULAST", :offset 32400}
             {:abbrev "ULAT", :offset 28800}
             {:abbrev "UT", :offset 0}
             {:abbrev "UTC", :offset 0}
             {:abbrev "UYST", :offset -7200}
             {:abbrev "UYT", :offset -10800}
             {:abbrev "UZST", :offset 21600}
             {:abbrev "UZT", :offset 18000}
             {:abbrev "VET", :offset -14400}
             {:abbrev "VLAST", :offset 36000}
             {:abbrev "VLAT", :offset 36000}
             {:abbrev "VOLT", :offset 10800}
             {:abbrev "VUT", :offset 39600}
             {:abbrev "WADT", :offset 28800}
             {:abbrev "WAKT", :offset 43200}
             {:abbrev "WAST", :offset 25200}
             {:abbrev "WAT", :offset 3600}
             {:abbrev "WDT", :offset 32400}
             {:abbrev "WET", :offset 0}
             {:abbrev "WETDST", :offset 3600}
             {:abbrev "WFT", :offset 43200}
             {:abbrev "WGST", :offset -7200}
             {:abbrev "WGT", :offset -10800}
             {:abbrev "XJT", :offset 21600}
             {:abbrev "YAKST", :offset 32400}
             {:abbrev "YAKT", :offset 32400}
             {:abbrev "YAPT", :offset 36000}
             {:abbrev "YEKST", :offset 21600}
             {:abbrev "YEKT", :offset 18000}
             {:abbrev "Z", :offset 0}
             {:abbrev "ZULU", :offset 0}])))

;; Parses short time zones, eg EST in `2025-06-05T17:00:00EST`
(def tz-abbrev-formatter
  (let [builder (DateTimeFormatterBuilder.)]
    (doseq [{:keys [abbrev offset]} pg-timezone-abbrevs]
      (.appendOptional builder
                       (.. (DateTimeFormatterBuilder.)
                           (appendLiteral ^String abbrev)
                           (parseDefaulting ChronoField/OFFSET_SECONDS offset)
                           (toFormatter))))
    (.toFormatter builder)))
