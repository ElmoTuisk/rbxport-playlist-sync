# Publishing Playlist Sync on GitHub

The public [repository](https://github.com/ElmoTuisk/rbxport-playlist-sync) contains the full source and installer code. Its README is the installation page.

1. Follow the [release checklist](releasing.md), run the tests and update versions, changelog and validation evidence.
2. Review the staged source. Exclude private data, downloaded tools, music, logs and unrelated development projects.
3. Push the source and a matching version tag (for this release, `v0.11.1`).
4. The GitHub Actions workflow waits for Windows and Linux tests, builds and verifies the EXE, and publishes the EXE, source ZIP and SHA-256 checksums.
5. Confirm all assets exist on the release. Link the EXE as the main install/update download. Do not publish a ZIP-only replacement if the EXE build fails.

For local builds, run `Build-Installer.ps1`; its output is in `dist/`. `Package-Addon.ps1` builds the source ZIP. The embedded payload contains source; installation downloads pinned dependencies and checks their hashes. The EXE is currently unsigned. See [validation](validation.md) for tests and remaining clean-machine limitations.

Never publish credentials, cookies, pairing URLs, music, private screenshots or ignored local state. The add-on is independent of the upstream rbxport application; installer scripts do not push source or publish releases.
