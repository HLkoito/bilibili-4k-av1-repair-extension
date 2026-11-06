# Privacy

The extension does not collect or transmit personal information.

- No analytics, telemetry, extension-initiated fetch/XHR requests, or remote scripts.
- No cookie-reading, history, storage, native messaging, or unrestricted host permissions.
- No local HTTP server, proxy, or startup process.
- Normal website requests, account sessions, chat, and player controls remain the website's responsibility.
- No popup, URL-entry interface, browser action, or code that opens tabs.
- Repair diagnostics are counters and parser messages held only in the player frame's memory. No payload bytes, account identifiers, or stream URLs are included in the diagnostic object.

## Website access

Static content scripts match Bilibili Live pages and Bilibili blackboard pages used for embedded players. The main-world hook shares the website's JavaScript environment: code on that page can inspect or modify that environment. The diagnostic object is not a secret storage mechanism.

## Public release hygiene

Only allowlisted source, documentation, license, and packaging files are published. Original recordings, signed CDN addresses, browser exports, screenshots, account IDs, IP addresses, private email addresses, SSH configuration, local paths, and private logs are excluded. Tests construct synthetic bytes and contain no captured live content.

If reporting a bug, provide a minimal description and sanitized error text. Remove cookies, authorization headers, URL query strings, IP addresses, account/room IDs, and machine-specific paths before sharing diagnostics.
