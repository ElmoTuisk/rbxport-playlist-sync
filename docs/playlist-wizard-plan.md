# Playlist Wizard: implementation plan

Status: design recorded 22 October 2026; an independent initial implementation now lives in [playlist-wizard](../playlist-wizard/README.md). The user clarified that this must be independently installable/runnable, with a cohesive visual style. The initial shared-service proposal below is superseded on that point. See the implementation's validation record for actual evidence and remaining milestones; live host/USB compatibility and listening quality are not established.

## Product decision

Build Playlist Wizard as a separate sidebar entry beside Playlist Sync, focused first on preparing DJ sets from existing music. Keep its popup compact. Share the guarded host connection, lifecycle and operation coordinator; keep the Wizard's recipes, analysis cache and generation code separate from Sync's links and acquisition pipeline.

The core should work offline without an AI account. Local audio analysis supplies evidence; a deterministic optimizer selects and orders songs; an optional agent translates creative instructions into a validated recipe and suggests bounded revisions. An agent must never invent track features, silently relax constraints or write playlists on its own.

User decisions already established:

- DJ sets are the first priority.
- Sources include selected playlists and all songs on a selected USB.
- Energy curves must be selectable.
- Length can mean an exact number of songs or an approximate duration.

## Small user flow

1. Open **Playlist Wizard** beside Playlist Sync.
2. Choose a pool: one or more playlists, the active collection, selected USB playlists, or all tracks on one selected USB library. Multiple playlist selections form a union by default. Offer **use every song, just reorder** as a distinct mode.
3. Choose **Songs** (for example, 20) or **Approximate duration** (for example, 90 minutes). Choose an energy shape and optionally tempo range, harmonic strictness, opener, closer and must-include songs.
4. Analyze uncached tracks locally with progress, pause/cancel and resume. Metadata-only generation is available with its coverage stated.
5. Generate a draft. Show requested versus achieved energy, track order, length and transition warnings. Allow lock, exclude, replace and regenerate unlocked sections. Advanced settings stay collapsed.
6. **Create playlist** names a new playlist and shows its destination. Revalidate the source and destination, write through supported host commands, then read back its exact membership and order. Store the recipe locally for manual regeneration.

Generation itself is read-only. Existing source playlists, Sync targets, audio tags, cues and beat grids are preserved. Live testing and deployment require separate authorization under this repository's instructions.

## Length and curve semantics

| Length mode | Contract |
| --- | --- |
| Songs | Exact count of distinct eligible recordings; report infeasibility if the pool or other constraints prevent it. No repeat filling. |
| Approximate duration | Target minutes with a visible tolerance; suggested starting default is the larger of 2 minutes or 5%, adjustable in Advanced. Show any shortfall or overshoot. |
| Reorder every song | Count is fixed by the deduplicated pool; show estimated duration rather than implying a duration target can remove songs. |

For duration mode distinguish **full track runtime** from **estimated mixed runtime**. Initially use a visible assumed overlap, such as 32 bars at the proposed transition tempo. Clamp overlaps to available play segments and do not subtract the same time twice. A fuller transition planner can replace these assumptions with candidate cue regions. Clearly label early-exit or playing-time assumptions; actual DJ performance determines the final runtime.

Place the energy curve on elapsed estimated set time, rather than track index. For song-count mode, derive the timeline from selected track durations and overlap assumptions as well. Fit the dominant played section's energy to the curve; do not average a long silent intro into a supposed low-energy song. Keep duration and energy estimates consistent after replacements.

Initial presets use a relative 1–10 intensity scale. These are design targets, not measured universal energy values:

| Preset | Shape |
| --- | --- |
| Gradual build | Start restrained, rise steadily, finish strong. |
| Waves | Build, release, build to a higher peak. |
| Peak and hold | Reach high intensity early, then sustain it with small variation. |
| Rise and release | Build to a late peak, then ease into the ending. |
| Wind down | Lower intensity gradually while keeping transitions coherent. |
| Custom | Edit time/energy anchors; later support direct curve drawing. |

An energy curve and a BPM trajectory are separate controls. A fast song is not automatically intense, and a slow song can be a peak. Display desired and achieved curves independently. If the pool lacks suitable low-energy songs, say so rather than relabelling the least intense available song as objectively calm. Source-relative rankings may be offered with an explicit label, separate from calibrated energy.

## Integration findings and first compatibility gate

The existing add-on is an independent service using rbxport's opt-in automation connection, not a permanent official plugin API. Its `src/bridge.mjs` currently reads collection/playlist rows and performs guarded native creation, addition and reordering. Its row mapper drops the host's BPM and key fields. Reuse its safety patterns without replacing its source-ordering logic with Wizard sequencing.

The host IPC contract at the add-on's documented tested commit, `7fb4dad3f88a2cc0cecec0e718b4dde408fd7448`, provides:

- `RowDto.bpmX100`, `key`, `genre`, `rating` and analysis status. Convert BPM units explicitly; missing/zero BPM is unknown.
- Device sources for `open_view`: path, library format and playlist; playlist `"0"` means all tracks in that device library.
- `list_devices`, `device_libraries`, and `device_playlist_edit` with create/add operations. Device row IDs belong to their device namespace.
- Host analysis code that computes tempo, beat grids, key and waveform/peak/RMS. This does not establish semantic energy, automatic vocal detection or reliable phrase labels.

These are source-code findings, not successful live add-on calls. Before implementing the UI, verify command shapes, paths, native ordering and failure behavior against isolated host fixtures and the supported build.

USB handling needs its own guard in addition to the current desktop library guard. Pin the selected volume identity, host-reported mount, Device Library versus OneLibrary format, source revision/snapshot and namespaced track IDs. Re-enumerate before each operation, invalidate on eject/remount/library change, and reject a reused drive letter that now belongs to another device. Use host-returned identity and file paths only. If an identity cannot be established, block the operation.

For a USB-only pool, the preferred output is a fresh playlist in the same selected USB library, using host create/add commands in generated order. The examined device edit contract has no reorder operation: prove that adding to a fresh playlist preserves supplied order, including batching. Otherwise this route remains unsupported until a suitable host capability exists. Never emulate reordering by deleting and reconstructing a user's existing playlist.

Device Library and OneLibrary are separate destinations. Label which one is updated; do not imply both are mirrored. Combining desktop and device pools, or several devices, requires a separately verified mapping/import/export route. Keep those combinations unavailable initially rather than sending one namespace's IDs to another. A plain USB folder without a recognized host library is a separate later source mode.

Do not invoke full USB Sync Manager for Wizard creation: its broader reconciliation and cleanup semantics are unnecessary. Do not open or write the host's music databases directly. Read-only host or device states remain read-only.

## Analysis: evidence before selection

Use two levels so a large USB is not rescanned on every generation:

1. **Metadata pass:** enumerate and deduplicate the selected pool; reuse existing BPM, key, genre, ratings and user corrections. Track coverage and provenance separately for each feature. Known file failures exclude a song; an unanalyzed song is not assumed broken or low quality.
2. **Audio pass:** decode host-resolved local files into a bounded worker, extracting compact per-section features and track summaries. Store Wizard analysis in the computer's private data directory, not on the stick or inside music tags. Full-track streaming analysis is the quality path; sampled analysis is explicitly provisional.

Suggested first stack: Node.js 24 coordinator, existing FFmpeg/ffprobe for decoding, and a pinned lightweight feature extractor such as Meyda for spectral and amplitude features. Use host BPM/key first. Benchmark a small offline helper around the host's pure `rbl-analysis` crate for missing BPM/key if needed; this is a proposed helper, not an existing packaged executable. Do not invoke host reanalysis silently because it can update grids, metadata and files under host settings.

Build an initial explainable intensity estimate from rhythmic activity, onset density, bass/percussive activity, spectral brightness, dynamics and loudness. Limit loudness's contribution so mastering level does not dominate. Use stable normalization/calibration across scans and retain raw features; never equate RMS, BPM, danceability or model arousal with DJ energy by itself. Keep representative body, peak, intro and outro estimates separate. A 1–10 display is an estimate with an evidence label, not a probability or measured physical quantity.

Allow manual energy, BPM and key corrections with a clear local override indicator. Preserve the original metadata and per-feature provenance. Treat changing key, unstable tempo, rhythm ambiguity and half/double-time alternatives explicitly. Do not claim a confidence percentage when the underlying analyzer exposes none; use known, estimated, missing or conflicting evidence states instead.

Cache track features against namespaced identity plus file identity/size/mtime and analyzer/model/settings version. A stat match is a fast validity check, not proof of identical audio. Recheck stats around decoding; invalidate on changed files and relevant host metadata edits. Add a content digest when robust cross-copy reuse is needed, without hashing the whole USB before the first preview. Never merge remixes or edits by artist/title alone. Keep temporary decoded audio bounded and clean it after cancellation.

Essentia/Essentia.js are plausible later benchmarks for richer rhythm/tonal features, not an automatic dependency choice. Their documentation distinguishes native Windows support from Python bindings; evaluate deployment on Windows/Node 24. Check analyzer and model licenses separately before selecting distributable artifacts. The current Essentia model catalog lists MTG models with non-commercial terms, so do not assume they can be shipped as an unrestricted default. Mood, genre, vocal and embedding models are optional later enhancements after deployment and musical-quality evidence.

## Sequencing engine

Selection and ordering must be solved together: selecting the nearest-energy songs first and sorting by key afterwards can destroy the requested arc.

Represent songs as candidates and directed song-to-song transitions as edges. Transition direction matters: outgoing and incoming sections differ. A practical objective combines:

- energy deviation from the requested timeline, plus unintended sudden jumps;
- tempo adjustment required at the transition, stable-grid evidence and allowed half/double-time interpretation;
- harmonic compatibility, weighted by key certainty and tonal content;
- changes in rhythmic feel and timbre; artist/recording repetition and diversity;
- duration error, played-section plausibility and uncertainty penalties.

Start with conventional same-key, neighboring Camelot and relative-major/minor relationships as preferences. They are candidate filters, not proof that an audible blend works. A brief percussion-led handoff may tolerate a key change that a long melodic blend cannot. Account for the chosen key-lock assumption: changing playback speed without key lock shifts pitch. Do not propose key shifts, beat jumps or complex mixes silently to make a transition pass.

Hard constraints include source membership, no unwanted duplicates, exact song count when selected, excludes, locked songs/positions and explicit maximum tempo adjustments. Other preferences have visible weights or simple user controls. Impossible requests produce reasons and proposed changes that require a new user choice; no hidden relaxation.

For a large library, retrieve a bounded candidate set for each region of the curve using tempo/key/energy indexes, including must-include tracks. Build only plausible neighbor edges, then run a seeded beam search with local swaps/replacements and an independent constraint validator. Avoid a complete all-pairs graph. Keep candidates near timing/energy boundaries to avoid an overly narrow shortlist; widen within time/resource limits before reporting no solution. Report search exhaustion as **no suitable draft found within budget**, not mathematical infeasibility unless that is established.

Persist the input snapshot, feature versions, recipe, seed, result and score breakdown. Identical inputs and versions should reproduce the same result. Regenerate offers controlled variety. Locked tracks stay fixed; local replacement regenerates affected transitions and rechecks the whole draft.

## Optional agent workflow

The agent receives compact facts for eligible local track IDs and the supported recipe schema. Raw music and private file paths stay local. Any remote AI option must disclose and obtain agreement to the metadata it sends; the ordinary workflow remains available offline.

Suggested bounded loop:

1. Interpret: convert “90 minutes of UKG, warm start, two peaks, finish with this song” into visible settings.
2. Plan: call the local optimizer with those validated settings.
3. Critique: inspect validator output, curve coverage, transition uncertainty and duration shortfall.
4. Repair: request limited regeneration of weak regions, preserving locks and hard constraints. Cap calls and elapsed time.
5. Present: show alternatives and feature-backed reasons. Playlist creation still uses the explicit button and guarded writer.

All track titles, tags and comments are data, never instructions to the agent. Tool arguments accept only current candidate IDs. The optimizer and validator, not the language model, calculate numerical features and judge constraint satisfaction. Explanations must be generated from actual stored reasons.

## Safe creation and recovery

Use a shared operation lock with Playlist Sync for host writes and coordinate expensive analysis. Snapshot source membership, destination identity, recipe, feature versions and the chosen order into a signed preview. Revalidate at creation and before subsequent host calls. Changed inputs require a refreshed preview.

Create a fresh named destination by default. Record its exact returned ID and a durable journal before adding entries; save progress after each bounded batch. On interruption or timeout, read back before retrying, because the host may have completed the operation. Never identify a target by a guessed name or create another playlist blindly. Recover into the same journaled target only when identity and membership agree; otherwise show an incomplete result for review.

Read back all track IDs and order before reporting success. Multi-call writes are not a transaction; disclose partial playlists and offer safe resume. Do not automatically delete music, remove user entries or roll back by guessing. A recipe refresh creates a new draft rather than auto-overwriting the previous set or a linked Sync target. Existing Sync source order and stable extras rules stay intact.

## Reliability and validation

Automated checks should establish invariants and recovery, not claim musical taste:

- Fixture libraries/devices: pool union, namespaces, both device formats, changed volume identity, ejection, protected hosts, exact counts, duration bounds, locks, duplicates, stale previews, cancellation, restart and partial-write retries.
- Native command contracts: correct BPM scaling; USB all-tracks and selected-playlist reads; create/add order and readback; no downloads, import, tag writes or deletion in the normal Wizard route.
- Synthetic audio: known tempo/key where applicable, silence, loudness-only changes, percussive versus sustained signals, mixed tempos and decode failures. Verify gain changes do not dominate the energy ranking. Synthetic signals do not establish perceived energy accuracy on real music.
- Optimizer: repeatable seeds, independent hard-constraint checks, sparse-pool handling and bounded runtime/memory. Benchmark cold analysis, warm generation and cancellation on 1,000/10,000-track fixtures; set performance targets from measurements.
- Minimal panel: keyboard controls, narrow viewport, long names, progress/cancel and reachable Create action. Analysis coverage and warnings survive updates.

Before claiming good flow, run a user-authorized listening evaluation on varied real sets, including UKG, house/techno, bass music and mixed-tempo material. Compare blindly against shuffle, BPM-only, BPM+key and simple energy sorting. Rate neighboring transitions and whole-set pacing separately. Record how many sets/tracks were rated, weak transitions, edits needed, target/actual duration and curve fit. Use separate calibration and held-out songs so energy tuning is not evaluated on its training examples. Test at matched listening level.

Proposed release gates: no known hard-constraint violations, verified native output membership/order on supported hosts, explicit partial-failure handling, measured performance, and a documented listening preference over basic baselines. Thresholds for subjective ratings need agreement before evaluation; no percentage reliability or universal flow guarantee is established by this plan.

## Delivery order

| Milestone | Concrete outcome and gate |
| --- | --- |
| 1. Host capability spike | Fixture-proven metadata fields, identity checks and USB create/add ordering. Decide supported source/destination combinations before promising them. |
| 2. Deterministic draft generator | Compact Wizard with source choice, song-count/duration modes, curve presets/custom anchors, metadata coverage, locks and explainable draft sequencing. Use fixtures; no live writes. |
| 3. Audio-based energy | Versioned local analysis/cache, body/intro/outro summaries, corrections and desired/achieved curves. Benchmark analyzer choices on Windows. |
| 4. Guarded creation | Explicit Create, journaled native writes, readback verification and recovery for validated desktop/USB routes; shared write coordination with Sync. |
| 5. Listening validation | Evaluate and tune against baselines on authorized music; add transition audition and richer region planning only through verified playback capabilities. |
| 6. Agent assistance | Natural-language recipes and bounded critique/repair once the local engine has demonstrated value. |

Suggested module boundaries for implementation: `src/wizard/{sources,analysis,features,recipe,transitions,optimizer,validator,store,writer}.mjs`, a compact Wizard renderer, and fixture tests. A shared host/coordinator extraction needs Sync regression coverage before adoption. This document adds no runtime modules and changes no behavior or version.

## Primary sources inspected

- Local `PROJECT_OVERVIEW.md`, `README.md`, `docs/architecture.md`, `docs/addon-guide.md`, `docs/validation.md` and `src/bridge.mjs`.
- [Pinned host IPC types](https://github.com/chrisle/rbxport/blob/7fb4dad3f88a2cc0cecec0e718b4dde408fd7448/src/ipc/types.ts) and [command adapter](https://github.com/chrisle/rbxport/blob/7fb4dad3f88a2cc0cecec0e718b4dde408fd7448/src/ipc/client.ts).
- [Pinned host analysis crate](https://github.com/chrisle/rbxport/blob/7fb4dad3f88a2cc0cecec0e718b4dde408fd7448/crates/rbl-analysis/README.md); [current host analysis settings](https://github.com/chrisle/rbxport/blob/main/docs/user/analysis-settings.md) and [USB export guide](https://github.com/chrisle/rbxport/blob/main/docs/user/usb-export.md) for additional context, not proof of installed capabilities.
- [Meyda feature reference](https://meyda.js.org/audio-features) and [license](https://github.com/meyda/meyda/blob/main/LICENSE.md).
- [Essentia.js](https://github.com/MTG/essentia.js), [Essentia installation](https://essentia.upf.edu/installing.html), [model catalog and licenses](https://essentia.upf.edu/models.html).
