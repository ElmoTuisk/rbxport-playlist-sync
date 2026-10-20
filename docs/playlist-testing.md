# Playlist reliability testing

The release target is approximately 95% automatic completion across a varied playlist test set, at the best accessible quality allowed by the user's policy. This is a target, not a demonstrated success rate or a guarantee for every playlist.

## Score each completed run

- **New downloads:** complete, verified audio imported successfully. Record source encoding/bitrate, cover status and elapsed time.
- **Reused:** an existing collection file matched and was linked. Report separately from new downloads; a filled library is not evidence that acquisition works.
- **Quality holds:** recording found, but only audio below the current policy was available. Report separately; do not silently approve it or call it unavailable.
- **Unavailable:** no verified recording from the accessible sources after the complete attempt chain. Record blocked providers separately from an empty search.
- **Other failures:** authentication, provider metadata, transfers, decoding, import, ordering or artwork. A missing image must not discard otherwise verified audio.
- **Pending:** not attempted yet. Never include pending songs in a finished success/failure rate.

Use both new-download completion (verified new downloads / attempted missing songs) and total playlist completion (new downloads + reused / eligible source songs). Show all exclusions, including unavailable source metadata, rather than quietly removing difficult songs from the denominator. Repeat with an empty fixture library and again with existing files. A 95% claim needs complete runs across multiple playlists, not a few successful samples.

## Representative cases

| Case | Checks |
| --- | --- |
| Mainstream EDM | Multi-artist credits, `(with …)`, original/radio/extended mixes, source order, 320 MP3/AAC/lossless, album covers |
| Underground UKG/house | Free-download originals, uploader versus performer tags, lower-quality-only recordings, vinyl/catalogue upload names |
| Remix/bassline sets | Remixer identity, different lengths, 30-second previews, unplayable originals, guest credits before remix annotations |
| Game music | Available originals, unsupported/blocked providers, playlist access versus download failure |
| Large existing collection | Reuse without duplicate acquisition, files outside the target playlist, stable extras and UI responsiveness |
| Failure/restart run | Bad peer, changed source bitrate, stalled transfer, temporary connection loss, cancellation, restart and reordering |

Test without weakening duration, mix identity, decoding, stereo/sample-rate or actual codec/bitrate checks. A newly encoded 320 kbps file is not proof of a high-quality original.

## Current evidence

See [validation.md](validation.md) for automated regressions and live observations. Discovery-only samples and saved collection counts are labelled explicitly. They are not full acquisition benchmarks. Keep private diagnostic logs, credentials and downloaded music outside the repository/package.
