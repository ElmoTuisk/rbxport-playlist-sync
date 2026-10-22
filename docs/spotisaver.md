# Spotisaver connection

The optional connection processes Spotify track details through Spotisaver inside Playlist Sync. A dedicated browser window handles site verification and session requests. It does not access Spotify audio, use a Spotify password or change the normal audio standard.

Under **gear → Advanced → Spotisaver for Spotify tracks**, select:

- **Off** (default): no requests to Spotisaver.
- **Last resort, after Soulseek**: try ordinary web sources first, then enabled Soulseek, then Spotisaver only if neither supplies a verified file. If Soulseek is disabled, Spotisaver follows web discovery. Earlier source attempts remain visible. Soulseek account/setup failures still stop the batch for correction; a temporary connection failure may continue to Spotisaver.
- **Try first, then other sources**: ask Spotisaver first during ordinary acquisition, then continue through existing sources if it fails. Explicit source URLs, local files, lower-quality approvals and an explicitly requested Soulseek retry retain their existing routes.

Save, then use **Retry missing** for previously held songs. Last-resort failures remain held until a retry; routine sync does not repeatedly search Soulseek and Spotisaver for them. Explicit source URLs, local files, lower-quality approvals and Soulseek-only retries keep their selected routes. SoundCloud songs do not use Spotisaver. Enabling the connection sends the Spotify track ID and recording metadata to Spotisaver. It does not send account credentials, library paths or the collection. Request signatures stay in memory; browser-session cookies remain in the dedicated private browser profile. Signed transfer URLs are never stored in jobs or logs.

## Browser verification

Use **Verify Spotisaver** under Advanced, or in an unresolved Spotify song's review. Playlist Sync opens a dedicated Microsoft Edge window (Chrome if Edge is unavailable), using its own profile. Finish any verification shown there. The add-on checks the selected recording's metadata again and updates the connection status automatically; **Check verification** is available if needed. Verification itself does not download a song.

Once connected, use **Retry download** in the song review, or **Retry missing** for the playlist. Keep the browser window open; it can be minimized. The service performs its requests and audio transfers through that same browser session. Cookies remain in the browser rather than being copied into the Node downloader. Closing the window disconnects that session; **Verify Spotisaver** reconnects it. The profile is retained locally so a new window can reuse its session when the site permits. Verification can expire or be requested again.

No browser extension, cookie export, Spotify password or separately installed browser runtime is required. A cross-origin iframe cannot host Cloudflare's challenge reliably, so this uses a separate browser window. It does not solve interactive challenges, spoof browser identity, disable browser security or use a personal browser profile. The local debugging connection is restricted to loopback and the dedicated profile. Audio is streamed in bounded chunks and must pass the same checks below. Automatic browser downloads are disabled in this dedicated window so they cannot skip validation. The browser profile is private application data and must never be included in logs, Git or release archives.

## What “320 kbps” verifies

Spotisaver returns a finished file. The add-on checks the requested Spotify ID, title, artist, recording/version and duration against the returned metadata. It then independently probes the received audio and checks its tags, duration, stereo channels, sample rate and full decoding. The audio stream must be **MP3 at exactly 320 kbps**. A filename, response label or container bitrate including artwork cannot pass this check. Lower-bitrate output, missing bitrate, another codec or a damaged/truncated recording is rejected without applying a quality exception.

Accepted MP3 audio packets are copied unchanged into the published file, which is verified again. File comments and saved/UI quality reports retain **original quality unverified**. This remains true after a retry or restart: neither ffprobe nor a 320 kbps MP3 header establishes the quality of the audio before Spotisaver processed it. A spectral cutoff can inform manual investigation, but does not reliably prove an exact original bitrate or justify automatically accepting/rejecting a recording.

## Public mechanism and limitations

Spotisaver's [own description](https://spotisaver.online/) says it uses Spotify metadata and matches audio from other sources. Its [changelog](https://spotisaver.online/en/changelog) mentions additional sources, including YAMS; that does not expose the private server's current provider selection or conversion logic.

The inspected public browser code loads track metadata and requests a completed file through same-origin PHP endpoints, with session-bound request signatures. Playlist Sync implements that observed client protocol independently. It handles binary responses and the site's same-origin relay; it does not execute downloaded JavaScript or follow arbitrary download URLs. Changed contracts, browser verification, rate limits and failed transfers stop this provider and allow other sources to continue. No CAPTCHA workaround is included.

On 21 October 2026, direct HTTP requests encountered a Cloudflare challenge at track metadata. After adding the browser connection, all three selected live test recordings downloaded into isolated folders and passed matching metadata/file tags, duration, stereo, sample rate, full decoding and actual 320 kbps MP3 checks. The browser reconnected successfully for the second test session. No manual challenge was presented in these successful runs; the interactive handoff remains covered by fixtures rather than a completed live CAPTCHA. Three successful recordings do not establish a general reliability rate or higher-quality originals. The live library was not modified. The opt-in connection is included in v0.11.1.

References: [Cloudflare challenge limitations](https://developers.cloudflare.com/cloudflare-challenges/concepts/how-challenges-work/), [supported browser environments](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/), [Chrome's separate-profile debugging requirement](https://developer.chrome.com/blog/remote-debugging-port).
