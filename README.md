# Bilibili 4K AV1 Repair Extension

A standalone Chromium extension that works around a specific malformed AV1 metadata pattern found in some Bilibili live streams. It repairs matching metadata immediately before Media Source Extensions (MSE) submits media data for decoding.

**No local server, proxy, FFmpeg installation, startup script, injected toolbar, or player replacement is required.** Open the normal Bilibili Live website and keep its original login session, chat, layout, and playback controls.

## The original failure

Affected 4K/60 fps AV1 streams initially selected `D3D11VideoDecoder`, then reported:

```text
video decoder fallback after initial decode error.
```

The browser switched to `Dav1dVideoDecoder` (software decoding). An independent FFmpeg test rejected the stream's ITU-T T.35 metadata trailing bits. Replacing only the identified malformed metadata restored D3D11 hardware decoding in the investigated case.

See [Failure analysis and workaround](docs/av1-metadata-failure.md) for the evidence, reproduction commands, limits, and distinction between FFmpeg and the browser's decoder.

## Install

1. Download the ZIP from [Releases](https://github.com/HLkoito/bilibili-4k-av1-repair-extension/releases/latest), or download/clone this repository.
2. Extract the archive. Open `chrome://extensions` in Chrome/Ego, or `edge://extensions` in Edge.
3. Enable **Developer mode**, select **Load unpacked**, and choose the **`extension` directory containing `manifest.json`**.
4. Disable older copies of this extension, then refresh any already-open live room.

This is an unpacked extension, not a Chrome Web Store installation. Loading it once is sufficient; do not run a server or a command before each viewing session.

## Use

Visit a normal Bilibili Live room. Repair is automatic on matching pages. The optional extension-button popup accepts a room URL and opens it in a new tab.

No elements are added to the live page. The extension does not force a codec, change the selected quality, or unlock restricted streams. HEVC, AVC, and AV1 streams without the identified defect do not need this repair.

To verify decoding, open `chrome://media-internals` or `edge://media-internals` and select the relevant player:

- `D3D11VideoDecoder` with `kIsPlatformVideoDecoder: true` identified hardware decoding on the Windows test system.
- `Dav1dVideoDecoder` identified the software AV1 fallback in the reported failure.

Decoder names differ across platforms. The extension cannot add AV1 support to unsupported hardware or guarantee smooth playback under network/rendering bottlenecks.

For local debugging, select the player frame in DevTools and inspect `window.__AV1RepairDiagnostics`. Diagnostics stay in the page's memory; they are not uploaded.

## How it works

1. Read the fMP4 initialization boxes and identify `av01` tracks.
2. Locate video samples using `tfhd`/`trun` sizes and offsets.
3. Parse AV1 OBU boundaries and match the specific malformed T.35 `TencentStreamSEI` pattern.
4. Replace only matching metadata OBUs with **equal-length padding OBUs**.
5. Pass the media buffer to the original `SourceBuffer.appendBuffer` implementation.

Image-bearing data, audio, sample sizes, and timestamps remain unchanged. The malformed vendor metadata is discarded, not reconstructed. Valid and unrelated metadata is retained. Both complete fragments and separate `moof`/`mdat` appends are supported for the tested layout. If parsing fails, the original append proceeds unchanged and an in-memory diagnostic error is recorded.

## Compatibility and limits

- Targets Chromium browsers supporting Manifest V3 `MAIN`-world content scripts; the original investigation used Windows and Chromium 156.
- Firefox and Safari have not been verified.
- Targets the known AV1/fMP4/MSE path, not arbitrary AV1 corruption, encrypted media, or every possible MP4 layout.
- The MSE hook runs in matching document frames. MediaSource implementations running exclusively inside workers are not covered.
- Fragment headers and `mdat` boxes must be complete in the relevant append calls. Arbitrarily split boxes and unusual multi-`mdat` layouts are not generally supported.
- The original website may change its player implementation; future changes can require updates.

## Privacy

No telemetry, cookie reading, background worker, remote code, or extension-initiated network requests. The popup only opens a user-supplied, validated Bilibili Live URL. See [PRIVACY.md](PRIVACY.md).

This public repository and its release ZIP intentionally exclude original live recordings, signed CDN URLs, account identifiers, IP addresses, browser exports, local filesystem paths, and private diagnostic logs. Public tests use synthetic bytes.

## Development

Node.js 20+ is used only for development checks and packaging. It is not needed to use the extension. There are no npm dependencies.

```sh
npm test
npm run package
```

The package command writes an allowlisted ZIP and SHA-256 checksum into `dist/`.

## License

MIT. This is an independent project, not affiliated with Bilibili, Tencent, Google, Intel, or the FFmpeg project.
