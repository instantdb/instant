package instant;

// Creates an exception without a stack trace
public class SpanTrackException extends Throwable {
    public SpanTrackException(String spanId) {
        super(spanId, null, true, false);
    }
}
