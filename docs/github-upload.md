# Upload this add-on to GitHub

The repository’s README is the installation page. There is no separate website to host or deploy.

1. Run `Package-Addon.ps1` from the add-on folder. It creates `playlist-sync-0.10.4-windows-setup.zip` using an allowlist that excludes personal data, music, tools, runtimes and caches.
2. Extract that ZIP into a new folder. Use its **contents** as the standalone add-on repository root. Do not upload the original working folder or the entire rbxport checkout.
3. Create an empty public repository on GitHub, for example `rbxport-playlist-sync`. Keep the included README and GPL license. Upload the extracted files, keeping their folder structure. GitHub Desktop or Git can include hidden files such as `.github` and `.gitignore`.
4. Open **Releases → Draft a new release**, use tag `v0.10.4`, describe the experimental Windows release, and attach the setup ZIP as a release asset. Publish when your release checks are complete.
5. Visit the repository’s main page. GitHub displays the README automatically, including the installation and first-sync instructions.

Before publishing, follow [the release checklist](releasing.md) and inspect [validation](validation.md). A clean-machine internet installation and live Spotify account sign-in still need release testing. Never publish `.local-data`, `.tools`, `.runtime`, `.install-cache`, `.installer-test`, `installed.json`, cookies, tokens, music, private screenshots or launch pairing URLs.

The existing `chrisle/rbxport` remote belongs to the host application; this add-on is published separately at [ElmoTuisk/rbxport-playlist-sync](https://github.com/ElmoTuisk/rbxport-playlist-sync). Setup scripts never publish repositories or releases automatically.
