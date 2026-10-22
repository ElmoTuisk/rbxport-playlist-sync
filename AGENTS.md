# Working on Playlist Sync

Read `PROJECT_OVERVIEW.md`, `README.md` and `docs/validation.md` before changing behavior. This repository contains the independent add-on, not the upstream rbxport application.

- Keep the sidebar/popup minimal. Do not introduce a full dashboard or additional top-level tabs for routine sync work.
- Preserve library identity guards on every host operation. Never replace missing host capabilities with a guessed library path or direct music-database writes.
- Do not weaken recording/version/duration, decoding, codec/bitrate, stereo or sample-rate checks to improve completion numbers. Lower-quality ordinary streams need explicit individual or bulk approval; artist-enabled SoundCloud originals have their separate existing policy.
- Preserve source order and stable extras. Never delete music when unlinking or reconciling deleted target playlists. Keep global collection bindings reusable.
- Distinguish reported alternatives, a pending transfer, verified source audio and verified output. A 320 kbps encoding does not prove recording provenance. Never count pending songs or existing library reuse as newly downloaded files.
- Use isolated fixture libraries and synthetic audio by default. Do not control the desktop, restart running apps, alter the live library or start real downloads unless the user authorizes that live work. Code changes, isolated tests and explicitly requested GitHub publication do not require desktop control.
- Keep credentials, pairing tokens, cookies, downloaded music and private logs out of code, tool output, Git and release ZIPs. Local operational notes belong in ignored `LOCAL_WORKSPACE.md`.
- Use Node.js 24 and `node --test test/*.test.mjs`. Set `FFMPEG`/`FFPROBE` for real audio tests; Windows is needed for launcher/DPAPI checks. Report skipped checks and live limitations accurately.
- Update the README/changelog/validation evidence with material changes. Version tags must match `package.json`; every release must provide the single-file Windows setup EXE as its main download, public source and checksums. `.github/workflows/test.yml` publishes the EXE and source ZIP only after both CI platforms pass. Updates must detect existing installations and preserve their saved-data location. Do not claim an icon was restored or a reliability target achieved without the corresponding evidence.
