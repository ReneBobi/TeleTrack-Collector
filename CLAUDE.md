# CLAUDE.md

<!-- crew:start (maintained by the Agent Office crew council; edits inside are read by the council) -->
## Crew lessons

## Crew notes (teletrack-collector)

### What this repo is
- **Binary-only distribution repo.** It holds `TeleTrackSetup.exe` (full server, v2.0.x), `TeleTrackCollectorSetup.exe` (collector-only, v1.0.0), `README.md` and `.gitattributes`.
- There is no source code here. The installer source and build tooling live elsewhere.
- Ask the maintainer where they live before assuming. Do not invent build scripts.

### Removed and missing files
- Do not reintroduce `TeleTrackServerSetup.exe`. It was deliberately removed in favor of the full installer.
- `update-teletrack.ps1` is referenced in the README but is not in the repo. Do not claim it exists here, and do not add it without asking.

### Replacing an installer binary
- Note the new version in the commit message, e.g. `Update TeleTrackSetup.exe to v2.0.2: <what changed>`. Use short descriptive sentences.
- Update `README.md` in the same change if the binary changes any of the following:
  - wizard fields
  - service names
  - install path
  - URLs or ports
  - update steps

### README facts that must stay accurate
- Services: `TeleTrackWeb`, `TeleTrackAMIProxy`, `TeleTrackCollector`, `TeleTrackApache`.
- Install path: `C:\Program Files\TeleTrack\`. Paths with spaces were a past bug, so keep examples quoted.
- Access: `https://localhost`. The self-signed certificate warning is expected.
- AMI integration with Grandstream UCM6301 uses port 5038.
- PostgreSQL 16 is auto-installed or detected.
- Update command: `update-teletrack.ps1 -Force`, run in an Administrator PowerShell.

### README style
- Keep the field-by-field configuration guide style.
- User-facing docs may need English and Slovenian versions. Check with the owner.

### Tests
- There are none. Verification means checking the README against the installer's actual behavior, as described by the maintainer.
<!-- crew:end -->
