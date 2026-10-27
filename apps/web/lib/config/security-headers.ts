export const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // No preload/includeSubDomains: this application does not own sibling hosts.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
];

export const privateResponseHeaders = [
  { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
];

// Next's configured headers override a Route Handler's CSP. Keep private files
// sandboxed at the final HTTP boundary as well as inside the download adapter.
export const privateDownloadHeaders = [
  { key: 'Content-Security-Policy', value: "default-src 'none'; sandbox; frame-ancestors 'none'" },
];
