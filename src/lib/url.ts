export function normalizeUrl(url: string): string {
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url)) return url;
  return `https://${url}`;
}
