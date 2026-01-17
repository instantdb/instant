package instant;

// Creates an exception without a stack trace
public class SpanTrackException extends Throwable {
  private static final long serialVersionUID = 1L;

  public SpanTrackException(String spanId) {
    super(spanId, null, true, false);
  }
}
