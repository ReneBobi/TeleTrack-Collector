# TeleTrack Server Installer

All-in-one Windows installer for on-premises TeleTrack deployment.

## What is Included

The installer sets up everything on a single Windows server:

- **Next.js Web App** - TeleTrack dashboard and API (port 3000)
- **AMI Proxy** - WebSocket server for real-time call updates (port 3001)
- **Collector** - Connects to Grandstream UCM6301 AMI and collects call data
- **Apache** - HTTPS reverse proxy with self-signed SSL (ports 80/443)
- **PostgreSQL** - Auto-detected or installed automatically

## Requirements

- Windows 10/11 or Windows Server 2016+ (64-bit)
- 4 GB RAM minimum
- 2 GB disk space
- Network access to Grandstream UCM6301 (AMI port 5038)
- Administrator privileges

## Installation

1. Download TeleTrackServerSetup.exe from this repository
2. Run as Administrator
3. Follow the wizard pages below
4. Click **Install**
5. Open https://localhost in a browser, accept the SSL warning, and login

---

### Page 1: Organization

| Field | Description | Example |
|-------|-------------|---------|
| **Organization Name** | Your company or organization name | Acme Corp |
| **Organization Code** | Short unique code (uppercase, no spaces) | ACME |

The code is used internally to identify the organization. Pick something short and memorable.

---

### Page 2: Admin Account

| Field | Description | Default |
|-------|-------------|---------|
| **Username** | Admin login username | admin |
| **Password** | Admin login password (min 6 characters) | - |
| **Confirm Password** | Must match password | - |
| **Email** | Admin email address | admin@localhost |

This creates a Super Admin account with full access to TeleTrack.

---

### Page 3: AMI Connection

These settings connect TeleTrack to your Grandstream UCM6301 phone system.

| Field | Description | Default | Where to find it |
|-------|-------------|---------|------------------|
| **AMI Host** | IP address of the UCM6301 | - | UCM web UI > System Status > Network Status |
| **AMI Port** | AMI port number | 5038 | UCM > PBX Settings > AMI > AMI Port |
| **AMI Username** | AMI login username | - | UCM > PBX Settings > AMI > AMI Username |
| **AMI Password** | AMI login password | - | UCM > PBX Settings > AMI > AMI Password |
| **Use TLS** | Enable encrypted AMI connection | unchecked | Check only if AMI has TLS enabled |

**How to enable AMI on Grandstream UCM6301:**

1. Login to the UCM6301 web interface
2. Go to **PBX Settings** > **AMI**
3. Set **Enable AMI** to **Yes**
4. Set a username and password
5. Default port is 5038 - leave as-is unless changed
6. Click **Save** and **Apply Changes**

---

### Page 4: Database Configuration

| Field | Description | Default |
|-------|-------------|---------|
| **PostgreSQL Status** | Shows if PostgreSQL is already installed | - |
| **Install PostgreSQL** | Auto-install PostgreSQL 16 if not detected | checked |
| **PostgreSQL Admin Password** | Password for the postgres superuser | - |
| **Database Name** | Name of the TeleTrack database | teletrack |
| **Database User** | Database user for the app | teletrack |
| **Database Password** | Auto-generated password for the DB user | (random hex) |

- If PostgreSQL is already installed, enter the existing postgres superuser password
- If not installed and checkbox is checked, it will be installed automatically
- The Database Password is auto-generated - you do not need to remember it

---

### Page 5: Web Server Configuration

| Field | Description | Default |
|-------|-------------|---------|
| **HTTP Port** | Port for HTTP (redirects to HTTPS) | 80 |
| **HTTPS Port** | Port for HTTPS (main access) | 443 |
| **Server Hostname/IP** | How users access TeleTrack | (auto-detected LAN IP) |
| **Generate self-signed SSL** | Create an SSL certificate for HTTPS | checked |

- Use the server LAN IP (e.g. 192.168.1.100) or a hostname if DNS is configured
- If you have your own SSL cert, uncheck and place server.crt and server.key in certs folder after install

---

### Page 6: Collector Configuration

| Field | Description | Default |
|-------|-------------|---------|
| **Collector Name** | Name to identify this collector | (computer hostname) |
| **Collector HTTP Port** | Port for collector API | 3001 |

These defaults are fine for most installations.

---

### Page 7: Pre-Installation Verification

Click **Run Tests** to verify your settings before installing:

| Test | What it checks |
|------|---------------|
| **PostgreSQL** | Can connect to PostgreSQL on the configured port |
| **AMI Connection** | Can login to the Grandstream UCM6301 AMI |
| **Ports** | HTTP, HTTPS, and app ports are available (not in use) |

- Green = OK, Red = Problem
- You can proceed even if some tests fail

---

### What Happens During Install

After clicking Install, the installer automatically:

1. Installs PostgreSQL (if not detected)
2. Creates the database and user
3. Pushes the database schema
4. Seeds default roles and permissions
5. Creates your organization and admin user
6. Generates a self-signed SSL certificate
7. Configures Apache reverse proxy
8. Registers 4 Windows services
9. Starts all services

This takes 1-3 minutes.

---

## After Installation

### Access TeleTrack

1. Open https://localhost (or https://your-server-ip) in a browser
2. Accept the self-signed SSL certificate warning
3. Login with the admin credentials from the wizard

### Verify Services

Open services.msc and check these 4 services are running:

| Service | Description |
|---------|-------------|
| TeleTrackWeb | Next.js web application |
| TeleTrackAMIProxy | WebSocket proxy for live calls |
| TeleTrackCollector | AMI call data collector |
| TeleTrackApache | HTTPS reverse proxy |

### File Locations

All files are in `C:\Program Files\TeleTrack\`:

| Path | Contents |
|------|----------|
| `web\.env` | Web app configuration |
| `ami-proxy\.env` | AMI proxy configuration |
| `collector\config.json` | Collector configuration |
| `apache\conf\httpd.conf` | Apache configuration |
| `certs\` | SSL certificate and key |
| `logs\` | Log files |

### Using a Real SSL Certificate

1. Copy your certificate to `certs\server.crt`
2. Copy your private key to `certs\server.key`
3. Restart Apache: `net stop TeleTrackApache && net start TeleTrackApache`

## Updating TeleTrack

To update an existing TeleTrack installation to the latest version, run this command in **PowerShell as Administrator**:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Program Files\TeleTrack\update-teletrack.ps1" -Force
```

This will automatically download and apply the latest update while preserving your configuration and data.

## Uninstall

Run the uninstaller from Add/Remove Programs or `C:\Program Files\TeleTrack\unins000.exe`.

You will be asked whether to keep or delete config files and data. PostgreSQL is never uninstalled (it may be shared with other apps).

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Cannot reach https://localhost | Check TeleTrackApache is running, port 443 not blocked by firewall |
| SSL certificate error | Expected with self-signed cert, click Advanced > Proceed |
| No calls appearing | Check TeleTrackCollector is running, verify AMI credentials |
| Login fails | Check TeleTrackWeb is running, review `logs\web-stderr.log` |
| Database connection error | Verify PostgreSQL is running, check DATABASE_URL in `web\.env` |
| Services will not start | Check `logs\` folder for web-stderr.log, ami-proxy-stderr.log, apache-error.log |
