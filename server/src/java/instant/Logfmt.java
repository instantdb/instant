package instant;

/**
 * Logfmt value escaping. Hot-path utility for the structured logger and the
 * OpenTelemetry span exporter — keeping this in plain Java avoids the boxing
 * risks of Clojure's case/char dispatch and gives the JIT the simplest
 * possible bytecode to inline.
 */
public final class Logfmt {
  private Logfmt() {}

  /**
   * Append {@code s} to {@code sb} as a logfmt value:
   *
   * <ul>
   *   <li>Bare if the string is safe — no space, {@code =}, or escape char.</li>
   *   <li>Otherwise wrapped in {@code "..."} with {@code "}, {@code \},
   *       {@code \n}, {@code \r}, {@code \t} backslash-escaped.</li>
   * </ul>
   *
   * {@code null} and empty strings are emitted as {@code ""} so a parser can
   * always distinguish them from a missing value. The safe span between
   * escapes is copied in one batched range-append.
   */
  public static void appendLogfmtString(StringBuilder sb, String s) {
    if (s == null || s.isEmpty()) {
      sb.append("\"\"");
      return;
    }
    int n = s.length();

    // First pass: find the earliest char that forces quoting. Bare logfmt
    // values can't contain space, =, or any of the five escape chars.
    int trigger = -1;
    for (int k = 0; k < n; k++) {
      char c = s.charAt(k);
      if (c == ' ' || c == '=' || c == '"' || c == '\\'
          || c == '\n' || c == '\r' || c == '\t') {
        trigger = k;
        break;
      }
    }
    if (trigger < 0) {
      sb.append(s);
      return;
    }

    sb.append('"');
    sb.append(s, 0, trigger);

    // Inside the quoted region only the five real escape chars matter; space
    // and = are now plain content. Skip ahead from one escape to the next,
    // batch-copying the safe span between them.
    int i = trigger;
    while (i < n) {
      int escapeAt = -1;
      for (int k = i; k < n; k++) {
        char c = s.charAt(k);
        if (c == '"' || c == '\\' || c == '\n' || c == '\r' || c == '\t') {
          escapeAt = k;
          break;
        }
      }
      if (escapeAt < 0) {
        sb.append(s, i, n);
        break;
      }
      sb.append(s, i, escapeAt);
      switch (s.charAt(escapeAt)) {
        case '"':  sb.append("\\\""); break;
        case '\\': sb.append("\\\\"); break;
        case '\n': sb.append("\\n"); break;
        case '\r': sb.append("\\r"); break;
        case '\t': sb.append("\\t"); break;
      }
      i = escapeAt + 1;
    }
    sb.append('"');
  }

  /**
   * Append a logfmt key into {@code sb}, normalising two characters that
   * are inconvenient downstream:
   *
   * <ul>
   *   <li>{@code .} is rewritten as {@code _}. Many OTel semantic-convention
   *       keys are dotted ({@code exception.type}, {@code http.method},
   *       {@code db.statement}, …); a dot in a logfmt key reads as nested
   *       access in VRL / Athena / most JSON tooling.</li>
   *   <li>{@code ?} is dropped. Clojure's convention for boolean-predicate
   *       keywords ({@code :rate-limited?}, {@code :skipped-event?}) puts a
   *       trailing {@code ?} that survives clj-otel's snake_case conversion.
   *       It's out-of-spec for logfmt and rejected as an identifier by
   *       Athena.</li>
   * </ul>
   *
   * Fast path: keys with neither character are copied in a single bulk
   * append, no allocation.
   */
  public static void appendLogfmtKey(StringBuilder sb, String key) {
    if (key.indexOf('.') < 0 && key.indexOf('?') < 0) {
      sb.append(key);
      return;
    }
    int n = key.length();
    for (int i = 0; i < n; i++) {
      char c = key.charAt(i);
      if (c == '?') {
        // Drop, don't replace — `rate_limited` reads better than
        // `rate_limited_`.
        continue;
      }
      sb.append(c == '.' ? '_' : c);
    }
  }
}
