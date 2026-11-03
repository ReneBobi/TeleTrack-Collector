# CLAUDE.md

<!-- crew:start (maintained by the Agent Office crew council; edits inside are read by the council) -->
## How this crew works
- **Recall first.** Before you start, ask the office's memory what it already knows (lessons, past tasks and their reviews, dossiers, docs from all projects): `node .agent-office/badge.mjs recall "<your question>"` (on a laptop install: `node ~/.agent-office/bin/badge.mjs recall "…"`).
- **Look it up.** When unsure about a library, API, version or error, search the web (WebSearch / WebFetch) for current docs before guessing, and say which source you used.
- **Hand work on.** Delegate to the specialists in `.claude/agents/` when their description fits; after changing code another specialist owns, ask them to check it (e.g. backend change → tests specialist → reviewer).
- **Leave crew notes.** End your final message with a short `Crew notes:` list: anything a future agent on this repo should know (a command that works, a pitfall, something you found on the web). The crew council reads them and keeps the useful ones here.

## Crew lessons

## Crew notes (teletrack-collector)

### What this repo is
- **Binary-only distribution repo.** It holds:
  - `TeleTrackSetup.exe` (full server, v2.0.x)
  - `TeleTrackCollectorSetup.exe` (collector-only, v1.0.0)
  - `README.md` and `.gitattributes`
- There is no source code or build tooling here, and no tests.
- The installer source is probably in the main `teletrack` repo (Inno Setup and NSSM; `output-test/` there holds installers). This is unverified, so ask the maintainer before using it. Do not invent build scripts.
- Do not edit or replace either `.exe` without installer source and a build from the maintainer.

### Removed and missing files
- Do not reintroduce `TeleTrackServerSetup.exe`. It was deliberately removed in favor of the full installer.
- `update-teletrack.ps1` is referenced in the README but is not in the repo.
  - Do not claim it exists here.
  - Do not add it without asking.

### Replacing an installer binary
- Put the new version in the commit message, e.g. `Update TeleTrackSetup.exe to v2.0.2: <what changed>`. Use short descriptive sentences.
- Update `README.md` in the same change if the binary changes any of these:
  - wizard fields
  - service names
  - install path
  - URLs or ports
  - update steps
  - bundled component versions

### README facts that must stay accurate
- Services: `TeleTrackWeb`, `TeleTrackAMIProxy`, `TeleTrackCollector`, `TeleTrackApache`.
- Install path: `C:\Program Files\TeleTrack\`. Paths with spaces were a past bug (fixed in v2.0.x), so keep examples quoted.
- Access is `https://localhost`. The self-signed certificate warning is expected.
- AMI integration with Grandstream UCM6301 uses port 5038.
- PostgreSQL 16 is auto-installed or detected.
- Update: run `update-teletrack.ps1 -Force` in an Administrator PowerShell.

### Bundled component versions and advisories
- Which Next.js, PostgreSQL and Apache versions the installers bundle is unknown. Ask the maintainer before claiming any version.
- Only treat a version bump or security advisory as applicable after checking official sources:
  - Next.js releases and security advisories
  - PostgreSQL 16 release notes
  - Apache httpd 2.4 changelog
- If a bundled component changes, bump the installer version and update the README to match.

### README style
- Keep the field-by-field configuration guide style.
- User-facing docs may need English and Slovenian versions. Check with the owner.

### Working with the owner
- Answer briefly and concretely, in Slovenian.
- When something is blocked (missing installer source, unknown versions), say so plainly and list what the owner must do in numbered steps.
- Verification here means checking the README against the installer's real behavior as described by the maintainer.

### Crew roster and handoffs
- No specialists yet. Work here is rare and README-only, so the main agent handles it.
- Installer or code changes belong in the source repo (likely `teletrack`), not here.
<!-- crew:end -->
