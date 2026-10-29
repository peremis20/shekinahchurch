# gallery (Neon Function)

Serves 30 church photos every other month (sets change Dec 1, Feb 1, Apr 1, Jun 1, Aug 1, Oct 1) to the website gallery from shared church Google Photos albums, never repeating until every photo has been shown.

Project silent-firefly-93121470, branch br-old-sea-b51wuht3, slug `gallery`. Table `gallery_photos`. Trigger `gallery-monthly-rotation` still fires on the 1st of every month; on the second month of a period it finds the set already full and changes nothing.

When fewer than 90 unused photos remain (3 rotations, about 6 months), it queues `gallery_alert` in automation_status and the `welcome` function emails jimmy@peremis.com once that rotation asking for more albums.

To add albums: share the album by link, collect its photos in the browser (anonymous share page + snAcKc paging), skip burst shots within 3 seconds, and POST to /ingest with the token stored in automation_status.gallery_token.
