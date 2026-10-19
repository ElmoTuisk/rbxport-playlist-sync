# Preparing a GitHub release

1. Use this add-on folder as the repository root. Keep the GPL-2.0-or-later license and attribution.
2. Run `node --test test/*.test.mjs` with FFmpeg and FFprobe installed. Document any skipped tests and unverified integrations.
3. Test the UI and existing-library matching against a disposable fixture library first. A live library test needs the library owner's explicit instruction.
4. Update README, this validation record, CHANGELOG, package version and manifest version together. Include the exact tested rbxport version.
5. Verify `dependencies.json` against the publishers' checksums, then test `Install-Playlist-Sync.cmd` on Windows x64. Run `Package-Addon.ps1`. Inspect the resulting setup ZIP; it is an allowlist of source, tests, documentation, installer and launchers.
6. Never publish `.local-data`, `.tools`, `.runtime`, `.install-cache`, `.installer-test`, `installed.json`, account tokens, cookies, music, local test reports, real playlist screenshots or launch pairing URLs. Add a demo screenshot only after verifying it contains fictional data.
7. Create your GitHub repository and upload the reviewed source. The add-on does not create a repository, push code or publish a release for you.

See [uploading to GitHub](github-upload.md) to use the README as the installation page and attach the setup ZIP as a release asset.

The setup package excludes external binaries and downloads pinned builds directly from their maintainers. Keep versions, URLs and hashes together when updating them. Verify the entry below Tag List, clickable status symbols, main-frame action isolation and UI cleanup on the pinned rbxport build. Edge/Chrome is only needed for optional detached mode. A future signed executable installer can wrap the same setup flow; this release uses an extracted ZIP and double-click setup script. Keep future issues reproducible with fixture tracks and redacted logs.
