package instant.jdbc;

import clojure.lang.ILookup;
import clojure.lang.Keyword;
import com.fasterxml.jackson.annotation.JsonAutoDetect;
import java.util.Objects;

/**
 * A single column entry from a wal2json format-version 2 row (inside
 * {@code columns} or {@code identity}). Deserialized by Jackson from JSON
 * {@code {"name": ..., "value": ..., ...}} objects.
 *
 * Implements ILookup so existing Clojure consumers can use
 * {@code (:name col)} / {@code (:value col)} and
 * {@code {:keys [name value]}} destructuring without conversion.
 */
@JsonAutoDetect(fieldVisibility = JsonAutoDetect.Visibility.ANY)
public final class WalColumn implements ILookup {
  private static final Keyword KW_NAME = Keyword.intern("name");
  private static final Keyword KW_VALUE = Keyword.intern("value");

  public String name;
  public Object value;

  public WalColumn() {}

  public WalColumn(String name, Object value) {
    this.name = name;
    this.value = value;
  }

  @Override
  public Object valAt(Object key) {
    return valAt(key, null);
  }

  @Override
  public Object valAt(Object key, Object notFound) {
    if (key == KW_NAME) return name;
    if (key == KW_VALUE) return value;
    return notFound;
  }

  @Override
  public String toString() {
    return "#WalColumn{:name \"" + name + "\", :value " + value + "}";
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof WalColumn)) return false;
    WalColumn that = (WalColumn) o;
    return Objects.equals(name, that.name) && Objects.equals(value, that.value);
  }

  @Override
  public int hashCode() {
    return Objects.hash(name, value);
  }
}
