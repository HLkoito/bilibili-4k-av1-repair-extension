# Case study: 4K AV1 live playback falls back from D3D11 to software decoding

## Scope

This case concerns a particular AV1 metadata defect observed in some live media samples. It does not establish that every Bilibili stream has this defect or that all playback stutters have the same cause. Identifying account details, URLs, payloads, recordings, and raw browser logs are intentionally omitted.

## Symptoms and evidence

The website's own event log showed a switch from a lower-quality stream to 3840 x 2160, 60 fps AV1, followed by buffering. That log also recorded slow segment downloads. Those observations alone did not prove a decoder fault.

A browser media-internals export supplied the missing decoder evidence:

```text
Selected D3D11VideoDecoder for video decoding
kIsPlatformVideoDecoder: true
video decoder fallback after initial decode error.
Selected Dav1dVideoDecoder for video decoding
kIsPlatformVideoDecoder: false
```

This established that the hardware path was selected but failed during initial decoding. Later `DECODER_UNDERFLOW` events were consistent with a lack of decoded video frames, but do not independently identify the root cause.

## Independent bitstream checks

An original, non-transcoded sample produced this FFmpeg/libaom error:

```text
Failed to decode frame: Corrupt frame detected
The last nonzero byte of the ITU-T T.35 metadata OBU is 0x88, should be 0x80.
```

The native AV1/D3D11 route also reported:

```text
trailing_zero_bit out of range: 1, but must be in [0,0].
Failed to read unit 0 (type 5).
```

OBU type 5 is metadata. The AV1 trailing-bit rules require the appropriate one-bit marker followed by zero alignment bits. Inspection found malformed T.35 metadata carrying the `TencentStreamSEI` vendor marker. The country-code byte was `0x26`; only this narrowly identified pattern is handled by the extension.

These parser errors do not mean the GPU itself lacks 4K AV1 support. Rejection can occur in the software parser before data is submitted to the hardware accelerator.

## Controlled comparison

| Input / processing | Result on the original test system |
| --- | --- |
| Original 3-second sample, explicit D3D11 path | 0 frames decoded; 180 decode errors |
| Same sample with targeted, equal-length metadata replacement | All 180 frames decoded; 0 decode errors |
| Broader diagnostic removal of metadata from a 30-second sample | All 1,800 frames decoded; 0 decode errors |
| Original sample with `-err_detect ignore_err` | Still failed; 0 frames decoded |
| Original website with the MSE repair hook, AV1 selected, 4K selected | `D3D11VideoDecoder`, platform decoder true, no initial-error fallback in the inspected log |

Byte comparisons confirmed that image-bearing OBUs remained unchanged. The targeted replacement also preserved unrelated metadata and the original sample/fragment lengths. These are observations from the original investigation, not a guarantee for every GPU, driver, stream, or browser version.

## Why updating a system FFmpeg executable did not address the browser

The independent FFmpeg command was a diagnostic tool. The browser's AV1 hardware path is not the system `ffmpeg` executable. Chromium's AV1 decoder implementation uses libgav1 parsing and platform accelerator components. The same browser log's `FFmpegAudioDecoder` entry referred to AAC audio, not the AV1 video decoder.

Therefore, replacing an arbitrary browser `ffmpeg.dll`, installing a newer system FFmpeg, or passing command-line options to it does not configure the webpage's decoder. This workaround instead fixes the identified metadata before the browser parses the appended media samples.

## The targeted workaround

The extension hooks `SourceBuffer.appendBuffer` in the page's main execution world, including matching player frames. It parses initialization/fragment metadata, finds AV1 sample boundaries, and changes only the known malformed vendor metadata OBU into a padding OBU of exactly the same length.

The replacement changes the OBU type, zeroes the vendor payload, and supplies a valid trailing marker. Keeping lengths constant avoids rewriting MP4 offsets or remuxing the live stream. This intentionally drops that vendor metadata's functionality; it does not recover its original meaning.

The original player was observed to append `moof` and `mdat` separately. The hook retains the fragment header for parsing, lets the original header append proceed, then repairs the following data append. It preserves the player's original append/updateend sequencing. Unsupported or incomplete layouts are passed through without guessed edits.

The final extension does not proxy requests, alter authentication, replace the player, insert a toolbar, or transcode media.

## Optional offline reproduction

Use a sample you are authorized to obtain. Avoid sharing signed URLs or raw logs publicly. Example commands use local, generic filenames.

```sh
# Explicit hardware-path test of an original sample:
ffmpeg -hide_banner -loglevel verbose -hwaccel d3d11va -hwaccel_output_format d3d11 -c:v av1 -i original.mkv -map 0:v:0 -an -f null -

# Broad diagnostic workaround, not the extension's narrow production rule:
ffmpeg -i original.mkv -map 0 -c copy -bsf:v "filter_units=remove_types=5" diagnostic-no-metadata.mkv

# Compare hardware decoding of the diagnostic copy:
ffmpeg -hide_banner -loglevel verbose -hwaccel d3d11va -hwaccel_output_format d3d11 -c:v av1 -i diagnostic-no-metadata.mkv -map 0:v:0 -an -f null -
```

The `filter_units` command removes **all** metadata OBUs, including potentially useful HDR or other metadata. It is a diagnostic comparison, not a general recommendation for every stream. The extension retains unrelated and valid metadata.

## References

- [AV1 specification and approved PDF](https://aomediacodec.github.io/av1-spec/) — OBU syntax, metadata, padding, and trailing bits.
- [Chromium AV1 decoder implementation](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/gpu/av1_decoder.cc) — libgav1 parser and accelerator integration; current upstream can differ from the tested browser build.
- [FFmpeg bitstream filters](https://ffmpeg.org/ffmpeg-bitstream-filters.html) — `filter_units`.
- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) — document-start, frame matching, and main-world injection.
