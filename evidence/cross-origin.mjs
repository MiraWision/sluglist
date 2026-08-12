import http from "node:http";

/**
 * A second origin for the capture matrix (port 5176 vs the harness's 5175).
 *
 * Cross-origin images and webfonts are the single biggest source of
 * browser-specific screenshot failures — the DOM-to-canvas renderer re-fetches
 * them to inline them, and Safari in particular is strict about what it will
 * let into a canvas. Serving them from a real second origin locally reproduces
 * that without reaching the internet.
 *
 * Two modes, chosen by path:
 *   /cors/*   — sends `access-control-allow-origin: *` (inlines fine)
 *   /nocors/* — sends no CORS header (the failure case worth measuring)
 */

// An 8x8 solid-red PNG, base64. Small enough to inline here, and a strictly
// valid stream — Firefox refuses malformed PNGs that Chromium and WebKit decode
// anyway, which would otherwise read as a sluglist failure in the matrix.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGO4o6aGFTEMLQkAF/tKAS/fz4YAAAAASUVORK5CYII=",
  "base64"
);

http
  .createServer((req, res) => {
    const url = req.url ?? "/";
    const cors = url.startsWith("/cors/");
    const headers = {
      "content-type": "image/png",
      "cache-control": "no-store",
      ...(cors ? { "access-control-allow-origin": "*" } : {}),
    };
    res.writeHead(200, headers);
    res.end(PNG);
  })
  .listen(5176, () =>
    console.log("sluglist cross-origin server on http://localhost:5176")
  );
