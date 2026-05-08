export const PLACEHOLDER_TOKEN = '<generate-a-uuid>';

export const GUIDE_MARKDOWN = `This is Instant's get-a-db service.

To provision credentials, fetch https://www.getadb.com/provision/${PLACEHOLDER_TOKEN}.

Generate a random UUID yourself and use a different UUID each time. The
unique URL prevents upstream caches (e.g. WebFetch's 15-minute URL cache)
from serving stale credentials.
`;
