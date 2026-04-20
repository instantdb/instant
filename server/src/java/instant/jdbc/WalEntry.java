package instant.jdbc;

import clojure.lang.ILookup;
import clojure.lang.Keyword;
import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import java.io.IOException;
import java.util.List;
import java.util.Objects;
import org.postgresql.replication.LogSequenceNumber;

/**
 * Jackson deserialization target for a single wal2json format-version 2
 * entry. Fields that don't apply to the entry's action are left null.
 *
 * {@code action} is deserialized directly into a Clojure Keyword by
 * {@link WalEntry.ActionDeserializer}. {@code txBytes} is not in JSON
 * and is set by {@code instant.jdbc.wal-entry/parse-buffer}.
 *
 * {@code lsn} and {@code nextlsn} are deserialized via
 * {@code LogSequenceNumber.valueOf(String)} — Jackson picks up the
 * static factory method automatically.
 *
 * Implements ILookup so existing Clojure consumers can continue to use
 * {@code (:action r)}, {@code (:columns r)}, etc. unchanged.
 */
@JsonAutoDetect(fieldVisibility = JsonAutoDetect.Visibility.ANY)
public final class WalEntry implements ILookup {
  private static final Keyword KW_ACTION = Keyword.intern("action");
  private static final Keyword KW_TX_BYTES = Keyword.intern("tx-bytes");
  private static final Keyword KW_TABLE = Keyword.intern("table");
  private static final Keyword KW_COLUMNS = Keyword.intern("columns");
  private static final Keyword KW_IDENTITY = Keyword.intern("identity");
  private static final Keyword KW_PREFIX = Keyword.intern("prefix");
  private static final Keyword KW_CONTENT = Keyword.intern("content");
  private static final Keyword KW_LSN = Keyword.intern("lsn");
  private static final Keyword KW_NEXTLSN = Keyword.intern("nextlsn");

  /** Normalized Keyword (:begin, :insert, ...). Unknown actions pass through as the raw String. */
  @JsonDeserialize(using = ActionDeserializer.class)
  public Object action;

  /** Byte length of the original WAL record. Set by parse-buffer; not in JSON. */
  public long txBytes;

  /** Table name. Present for insert/update/delete entries. */
  public String table;

  /** New row values. Present for insert and update entries. */
  @JsonDeserialize(using = WalColumnVectorDeserializer.class)
  public List<WalColumn> columns;

  /** Old row / replica-identity values. Present for update and delete entries. */
  @JsonDeserialize(using = WalColumnVectorDeserializer.class)
  public List<WalColumn> identity;

  /** Prefix of a pg_logical_emit_message call. Present only for message entries. */
  public String prefix;

  /** Body of a pg_logical_emit_message call (text). Present only for message entries. */
  public String content;

  /** Commit LSN. Present only for commit (close) entries. */
  public LogSequenceNumber lsn;

  /** Next LSN after the commit. Present only for commit (close) entries. */
  public LogSequenceNumber nextlsn;

  public WalEntry() {}

  public WalEntry(Object action,
                  long txBytes,
                  String table,
                  List<WalColumn> columns,
                  List<WalColumn> identity,
                  String prefix,
                  String content,
                  LogSequenceNumber lsn,
                  LogSequenceNumber nextlsn) {
    this.action = action;
    this.txBytes = txBytes;
    this.table = table;
    this.columns = columns;
    this.identity = identity;
    this.prefix = prefix;
    this.content = content;
    this.lsn = lsn;
    this.nextlsn = nextlsn;
  }

  @Override
  public Object valAt(Object key) {
    return valAt(key, null);
  }

  @Override
  public Object valAt(Object key, Object notFound) {
    if (key == KW_ACTION) return action;
    if (key == KW_TX_BYTES) return txBytes;
    if (key == KW_TABLE) return table;
    if (key == KW_COLUMNS) return columns;
    if (key == KW_IDENTITY) return identity;
    if (key == KW_PREFIX) return prefix;
    if (key == KW_CONTENT) return content;
    if (key == KW_LSN) return lsn;
    if (key == KW_NEXTLSN) return nextlsn;
    return notFound;
  }

  @Override
  public String toString() {
    StringBuilder sb = new StringBuilder("#WalEntry{");
    sb.append(":action ").append(action);
    sb.append(", :tx-bytes ").append(txBytes);
    if (table != null) sb.append(", :table \"").append(table).append('"');
    if (columns != null) sb.append(", :columns ").append(columns);
    if (identity != null) sb.append(", :identity ").append(identity);
    if (prefix != null) sb.append(", :prefix \"").append(prefix).append('"');
    if (content != null) sb.append(", :content \"").append(content).append('"');
    if (lsn != null) sb.append(", :lsn ").append(lsn);
    if (nextlsn != null) sb.append(", :nextlsn ").append(nextlsn);
    sb.append('}');
    return sb.toString();
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof WalEntry)) return false;
    WalEntry that = (WalEntry) o;
    return txBytes == that.txBytes
        && Objects.equals(action, that.action)
        && Objects.equals(table, that.table)
        && Objects.equals(columns, that.columns)
        && Objects.equals(identity, that.identity)
        && Objects.equals(prefix, that.prefix)
        && Objects.equals(content, that.content)
        && Objects.equals(lsn, that.lsn)
        && Objects.equals(nextlsn, that.nextlsn);
  }

  @Override
  public int hashCode() {
    return Objects.hash(action, txBytes, table, columns, identity, prefix, content, lsn, nextlsn);
  }

  public static final class ActionDeserializer extends JsonDeserializer<Object> {
    private static final Keyword KW_BEGIN = Keyword.intern("begin");
    private static final Keyword KW_INSERT = Keyword.intern("insert");
    private static final Keyword KW_UPDATE = Keyword.intern("update");
    private static final Keyword KW_DELETE = Keyword.intern("delete");
    private static final Keyword KW_TRUNCATE = Keyword.intern("truncate");
    private static final Keyword KW_MESSAGE = Keyword.intern("message");
    private static final Keyword KW_CLOSE = Keyword.intern("close");

    @Override
    public Object deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
      String s = p.getText();
      if (s.length() == 1) {
        switch (s.charAt(0)) {
          case 'B': return KW_BEGIN;
          case 'I': return KW_INSERT;
          case 'U': return KW_UPDATE;
          case 'D': return KW_DELETE;
          case 'T': return KW_TRUNCATE;
          case 'M': return KW_MESSAGE;
          case 'C': return KW_CLOSE;
          default: break;
        }
      }
      return s;
    }
  }
}
