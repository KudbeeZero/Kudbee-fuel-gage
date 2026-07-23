/**
 * Returns the URL prefix needed to route fetch requests through the
 * Lightning Studio proxy when running in a cloudspaces environment.
 *
 * When the page is served at:
 *   https://lightning.ai/.../web-ui?port=5173/terminal.html
 *
 * All API calls must go through the same proxy path so the Studio
 * can forward them to the Vite dev server on the correct port.
 */
export function getProxyBase(): string {
  if (typeof window === "undefined") return "";
  const loc = window.location;
  // Only apply when behind the Studio proxy (URL has ?port=N)
  if (!loc.search.includes("port=")) return "";
  // Extract the directory portion before the current HTML page,
  // then append the query string so relative paths resolve correctly.
  // e.g. /.../web-ui?port=5173/terminal.html → /.../web-ui?port=5173/
  const dir = loc.pathname.split("/").slice(0, -1).join("/") + "/";
  return dir + loc.search + "/";
}
