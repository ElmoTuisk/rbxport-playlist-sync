# Preparing a GitHub release

1. Use this add-on folder as the repository root. Keep the GPL-2.0-or-later license and attribution.
2. Run `node --test test/*.test.mjs` with FFmpeg and FFprobe installed. Document any skipped tests and unverified integrations.
3. Test the UI and existing-library matching against a disposable fixture library first. A live library test needs the library owner's explicit instruction.
4. Update README, this validation record, CHANGELOG, package version and manifest version together. Include the exact tested rbxport version.
5. Keep `dependencies.json` pinned to verified publisher builds. Test installation and upgrades with isolated fixtures, then run `Build-Installer.ps1` on Windows x64. Its verification-only check validates the embedded source payload without installing. Inspect the source ZIP; it is an allowlist of source, tests, documentation, installer and launchers.
6. Never publish `.local-data`, `.tools`, `.runtime`, `.install-cache`, `.installer-test`, `installed.json`, account tokens, cookies, music, local test reports, real playlist screenshots or launch pairing URLs. Add a demo screenshot only after verifying it contains fictional data.
7. Push the reviewed source and a matching `vX.Y.Z` tag. GitHub Actions publishes only after Windows and Linux tests pass. Every release must include `playlist-sync-X.Y.Z-windows-setup.exe` as the main download, `playlist-sync-X.Y.Z-source.zip` for inspection/building and `SHA256SUMS.txt`. Verify the published assets before announcing success. Do not substitute a ZIP-only release if the EXE build fails.

See [uploading to GitHub](github-upload.md) for publication details. The repository and the installer source remain public; the EXE does not replace source access.

The embedded setup payload excludes external binaries and downloads pinned builds directly from their maintainers. Keep versions, URLs and hashes together when updating them. Verify the entry below Tag List, clickable status symbols, main-frame action isolation and UI cleanup on the pinned rbxport build. Edge/Chrome is also used for optional detached mode and Spotisaver verification. The EXE is currently unsigned. Keep future issues reproducible with fixture tracks and redacted logs.
