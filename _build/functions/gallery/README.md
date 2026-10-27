# gallery (Neon Function)

Serves 30 church photos per month to the website gallery from shared church Google Photos albums, never repeating until every photo has been shown.

Project silent-firefly-93121470, branch br-old-sea-b51wuht3, slug `gallery`. Table `gallery_photos`. Monthly trigger `gallery-monthly-rotation` (06:05 UTC on the 1st).

When fewer than 90 unused photos remain, it queues `gallery_alert` in automation_status and the `welcome` function emails jimmy@peremis.com once that month asking for more albums.

To add albums: share the album by link, collect its photos in the browser (anonymous share page + snAcKc paging), skip burst shots within 3 seconds, and POST to /ingest with the token stored in automation_status.gallery_token.
