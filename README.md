# TeleTrack Server Installer

All-in-one Windows installer for on-premises TeleTrack deployment.

## What's Included

The installer sets up everything on a single Windows server:

- **Next.js Web App** — TeleTrack dashboard and API (port 3000)
- **AMI Proxy** — WebSocket server for real-time call updates (port 3001)
- **Collector** — Connects to Grandstream UCM6301 AMI and collects call data
- **Apache** — HTTPS reverse proxy with self-signed SSL (ports 80/443)
- **PostgreSQL** — Auto-detected or installed automatically

## Requirements

- Windows 10/11 or Windows Server 2016+ (64-bit)
- 4 GB RAM minimum
- 2 GB disk space
- Network access to Grandstream UCM6301 (AMI port 5038)
- Administrator privileges

## Installation

1. Download `TeleTrackServerSetup.exe` from this repository
2. Run as Administrator
3. Follow the wizard:

| Page | What to enter |
|------|---------------|
| **Organization** | Your company name and short code (e.g. "ACME") |
| **Admin Account** | Username, password, and email for the admin user |
| **AMI Connection** | Grandstream UCM6301 IP address, port (5038), AMI username and password |
| **Database** | PostgreSQL admin password, database name and credentials (auto-generated) |
| **Web Server** | HTTP/HTTPS ports (default 80/443), server hostname or IP |
| **Collector** | Collector name and port |
| **Verification** | Click "Run Tests" to verify connections before installing |

4. Click **Install** — the installer will:
   - Install PostgreSQL if not detected
   - Create the database and push the schema
   - Seed default roles and permissions
   - Create your organization and admin user
   - Generate a self-signed SSL certificate
   - Configure Apache reverse proxy
   - Register and start all Windows services

5. Open `https://localhost` (or your configured hostname) in a browser
6. Accept the SSL certificate warning
7. Login with the admin credentials you set during installation

## After Installation

### Verify Services

Open `services.msc` and check that these 4 services are running:

| Service | Description |
|---------|-------------|
| `TeleTrackWeb` | Next.js web application |
| `TeleTrackAMIProxy` | WebSocket proxy for live calls |
| `TeleTrackCollector` | AMI call data collector |
| `TeleTrackApache` | HTTPS reverse proxy |

### File Locations

| Path | Contents |
|------|----------|
| `C:\Program Files\TeleTrack\web\.env` | Web app configuration |
| `C:\Program Files\TeleTrack\ami-proxy\.env` | AMI proxy configuration |
| `C:\Program Files\TeleTrack\collector\config.json` | Collector configuration |
| `C:\Program Files\TeleTrack\apache\conf\httpd.conf` | Apache configuration |
| `C:\Program Files\TeleTrack\certs\` | SSL certificate and key |
| `C:\Program Files\TeleTrack\logs\` | Log files |

### Using a Real SSL Certificate

Replace the self-signed certificate with your own:

1. Copy your certificate to `C:\Program Files\TeleTrack\certs\server.crt`
2. Copy your private key to `C:\Program Files\TeleTrack\certs\server.key`
3. Restart the Apache service: `net stop TeleTrackApache && net start TeleTrackApache`

## Uninstall

Run the uninstaller from **Add/Remove Programs** or `C:\Program Files\TeleTrack\unins000.exe`.

You will be asked whether to keep or delete configuration files and data. PostgreSQL is never uninstalled (it may be shared with other applications).

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Can't reach `https://localhost` | Check that `TeleTrackApache` service is running. Check if port 443 is blocked by firewall. |
| SSL certificate error | This is expected with a self-signed cert. Click "Advanced" → "Proceed" in your browser. |
| No calls appearing | Verify `TeleTrackCollector` is running. Check AMI credentials in `collector\config.json`. |
| Login fails | Check that `TeleTrackWeb` is running. Review `logs\web-stderr.log` for errors. |
| Database connection error | Verify PostgreSQL is running. Check `DATABASE_URL` in `web\.env`. |
