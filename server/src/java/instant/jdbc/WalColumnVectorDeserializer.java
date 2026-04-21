package instant.jdbc;

import clojure.lang.ITransientCollection;
import clojure.lang.PersistentVector;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import java.io.IOException;
import java.util.List;

/**
 * Deserializes a JSON array of {@link WalColumn} objects into a Clojure
 * {@link PersistentVector}, which also implements {@link List}, so the
 * declared field type can stay {@code List<WalColumn>}. Using a Clojure
 * vector ensures Nippy serializes the collection natively — if we left
 * Jackson's default {@code ArrayList}, Nippy would fall back to Java
 * serialization and fail on the non-{@code Serializable} elements.
 */
public final class WalColumnVectorDeserializer extends JsonDeserializer<List<WalColumn>> {
  @Override
  @SuppressWarnings("unchecked")
  public List<WalColumn> deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
    if (!p.isExpectedStartArrayToken()) {
      return (List<WalColumn>) ctxt.handleUnexpectedToken(List.class, p);
    }
    ITransientCollection v = PersistentVector.EMPTY.asTransient();
    while (p.nextToken() != JsonToken.END_ARRAY) {
      WalColumn col = p.readValueAs(WalColumn.class);
      v = v.conj(col);
    }
    return (List<WalColumn>) v.persistent();
  }
}
