# TeleTrack Collector

A lightweight Windows service that connects to your Asterisk PBX via AMI (Asterisk Manager Interface) and sends call data to the TeleTrack cloud platform.

## Features

- **Lightweight**: Minimal resource usage (~10-20MB RAM)
- **Reliable**: Auto-reconnect, error handling, and retry logic
- **Windows Service**: Runs automatically on system startup
- **Real-time**: Processes call events as they happen
- **Secure**: API key authentication with TeleTrack cloud
- **Configurable**: Flexible configuration for different environments

## Installation

### Prerequisites

- Windows Server or Windows 10/11
- Node.js 18+ (if running from source)
- Asterisk PBX with AMI enabled
- Network access to TeleTrack cloud platform

### System Requirements

#### Minimum Requirements
- **OS**: Windows 10 (1903+) or Windows Server 2019+
- **CPU**: 1 vCPU / 1 GHz processor
- **RAM**: 512 MB available memory
- **Storage**: 100 MB free disk space
- **Network**: 1 Mbps internet connection

#### Recommended Requirements
- **OS**: Windows 11 or Windows Server 2022
- **CPU**: 2+ vCPU / 2+ GHz processor
- **RAM**: 2 GB available memory
- **Storage**: 1 GB free disk space (for logs)
- **Network**: 10+ Mbps internet connection

#### Network Requirements
- **Outbound HTTPS**: Port 443 to TeleTrack cloud
- **Inbound AMI**: Port 5038 from Asterisk server
- **Firewall**: Allow collector.exe through Windows Firewall
- **Latency**: <500ms to TeleTrack cloud (recommended <100ms)

### Quick Installation (Executable)

1. **Download** the `teletrack-collector.exe` and `config.example.json` files
2. **Copy** `config.example.json` to `config.json`
3. **Edit** `config.json` with your settings:
   ```json
   {
     "organization": {
       "id": "your-org-id",
       "name": "Your Company Name",
       "apiKey": "your-api-key-from-teletrack"
     },
     "ami": {
       "host": "192.168.1.100",
       "port": 5038,
       "username": "your-ami-user",
       "password": "your-ami-password"
     }
   }
   ```
4. **Install** as Windows Service:
   ```cmd
   teletrack-collector.exe --install-service
   ```
5. **Start** the service:
   ```cmd
   net start "TeleTrack Collector"
   ```

### Installation from Source

1. **Clone** or download the collector files
2. **Install** dependencies:
   ```cmd
   npm install
   ```
3. **Configure** the service (copy and edit config.json)
4. **Install** as Windows Service:
   ```cmd
   npm run install-service
   ```

## System Architecture

### Overview

TeleTrack Collector acts as a bridge between your Asterisk PBX and the TeleTrack cloud platform:

```
┌─────────────────┐    AMI     ┌──────────────────┐    HTTPS    ┌─────────────────┐
│   Asterisk PBX  │◄──────────►│ TeleTrack       │────────────►│ TeleTrack Cloud │
│                 │  Port 5038 │ Collector        │  Port 443   │ Platform        │
│ • Call Events   │            │ • Event Parser   │             │ • Database      │
│ • CDR Records   │            │ • Data Queue     │             │ • Analytics     │
│ • AMI Interface │            │ • Retry Logic    │             │ • Dashboard     │
└─────────────────┘            └──────────────────┘             └─────────────────┘
```

### Component Details

#### 1. AMI Connection Manager
- Maintains persistent connection to Asterisk
- Handles authentication and reconnection
- Processes real-time call events

#### 2. Event Parser
- Converts AMI events to standardized format
- Extracts call metadata (numbers, duration, etc.)
- Determines call type (inbound/outbound/internal)

#### 3. Data Queue & Batching
- Queues call events for efficient processing
- Batches multiple events to reduce API calls
- Implements retry logic for failed transmissions

#### 4. Cloud Connector
- Secure HTTPS communication with TeleTrack
- API key authentication
- Heartbeat monitoring for health checks

### Data Flow

1. **Call Event** → Asterisk generates AMI event
2. **Reception** → Collector receives event via AMI
3. **Parsing** → Event converted to standard format
4. **Queuing** → Data added to processing queue
5. **Batching** → Multiple events batched together
6. **Transmission** → Batch sent to TeleTrack cloud
7. **Confirmation** → Success/failure logged

## Configuration

### config.json Structure

```json
{
  "organization": {
    "id": "unique-org-identifier",
    "name": "Your Organization Name",
    "apiKey": "api-key-provided-by-teletrack-admin"
  },
  "ami": {
    "host": "127.0.0.1",
    "port": 5038,
    "username": "ami-username",
    "password": "ami-password"
  },
  "cloud": {
    "endpoint": "https://teletrack.vercel.app/api/calls/ingest",
    "timeout": 30000,
    "retryAttempts": 3,
    "retryDelay": 5000
  },
  "collector": {
    "name": "main-collector",
    "heartbeatInterval": 60000,
    "batchSize": 10,
    "batchTimeout": 5000
  },
  "logging": {
    "level": "info",
    "file": "collector.log",
    "maxSize": "10MB",
    "maxFiles": 5
  }
}
```

### Configuration Options

#### Organization Settings
- `id`: Unique identifier for your organization
- `name`: Display name for your organization
- `apiKey`: Authentication key provided by TeleTrack admin

#### AMI Settings
- `host`: IP address of your Asterisk server
- `port`: AMI port (usually 5038)
- `username`: AMI username configured in manager.conf
- `password`: AMI password for the username

#### Cloud Settings
- `endpoint`: TeleTrack cloud API endpoint
- `timeout`: HTTP request timeout in milliseconds
- `retryAttempts`: Number of retry attempts for failed requests
- `retryDelay`: Delay between retry attempts in milliseconds

#### Collector Settings
- `name`: Name identifier for this collector instance
- `heartbeatInterval`: How often to send heartbeat to cloud (ms)
- `batchSize`: Number of calls to batch before sending
- `batchTimeout`: Maximum time to wait before sending partial batch (ms)

#### Logging Settings
- `level`: Log level (debug, info, warn, error)
- `file`: Log file name
- `maxSize`: Maximum log file size before rotation
- `maxFiles`: Number of log files to keep

## Data Model & API

### Call Data Structure

Each call event processed by the collector contains the following data:

```json
{
  "uniqueId": "1641891234.567",
  "timestamp": "2025-01-10T14:30:45.123Z",
  "status": "completed",
  "phoneNumber": "12345678",
  "callType": "inbound",
  "source": "SIP/trunk-001",
  "destination": "1001",
  "caller": "12345678",
  "callee": "1001",
  "callerName": "John Doe",
  "duration": 125,
  "billableSeconds": 120,
  "disposition": "ANSWERED",
  "lastApp": "Dial",
  "channel": "SIP/trunk-001",
  "destChannel": "SIP/1001-002",
  "accountCode": "sales",
  "userField": "project-abc"
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `uniqueId` | String | Unique identifier from Asterisk |
| `timestamp` | ISO Date | When event was processed |
| `status` | Enum | Call status: ringing, connected, ended, completed |
| `phoneNumber` | String | Primary phone number for display |
| `callType` | Enum | Call direction: inbound, outbound, internal, external |
| `source` | String | Originating channel/number |
| `destination` | String | Destination channel/number |
| `caller` | String | Caller ID number |
| `callee` | String | Called number |
| `callerName` | String | Caller ID name |
| `duration` | Number | Total call duration in seconds |
| `billableSeconds` | Number | Billable duration in seconds |
| `disposition` | String | Call outcome: ANSWERED, BUSY, NOANSWER, etc. |
| `lastApp` | String | Last Asterisk application used |
| `channel` | String | Asterisk channel name |
| `destChannel` | String | Destination channel name |
| `accountCode` | String | Account code for billing |
| `userField` | String | Custom user field |

### Cloud API Payload

Data sent to TeleTrack cloud includes collector metadata:

```json
{
  "callData": {
    // Call data structure above
  },
  "collectorInfo": {
    "name": "main-collector",
    "version": "1.0.0",
    "hostname": "pbx-server-01",
    "ipAddress": "192.168.1.100"
  }
}
```

### API Endpoints

#### POST /api/calls/ingest
- **Purpose**: Submit call data to TeleTrack
- **Authentication**: Bearer token (API key)
- **Content-Type**: application/json
- **Response**: `{"success": true, "callId": "uuid", "action": "created"}`

#### GET /api/calls/health (Optional)
- **Purpose**: Health check endpoint
- **Authentication**: Bearer token (API key)
- **Response**: `{"status": "healthy", "timestamp": "ISO date"}`

### Event Types Processed

The collector processes these AMI events:

| AMI Event | Status | Description |
|-----------|--------|-------------|
| `Newchannel` | ringing | New call channel created |
| `Dial` | dialing | Outbound call initiated |
| `Bridge` | connected | Call answered and bridged |
| `DialEnd` | ended | Dial attempt completed |
| `Hangup` | ended | Call terminated |
| `Cdr` | completed | Call detail record generated |

## Asterisk Configuration

### Enable AMI in manager.conf

Add to `/etc/asterisk/manager.conf`:

```ini
[general]
enabled = yes
port = 5038
bindaddr = 0.0.0.0

[teletrack]
secret = your-secure-password
deny = 0.0.0.0/0.0.0.0
permit = 192.168.1.0/255.255.255.0  ; Adjust to your network
read = call,cdr
write = system,call,log,verbose,command,agent,user,config
```

### Reload Asterisk Configuration

```bash
asterisk -rx "manager reload"
```

## Service Management

### Windows Service Commands

```cmd
# Start service
net start "TeleTrack Collector"

# Stop service
net stop "TeleTrack Collector"

# Check service status
sc query "TeleTrack Collector"

# View service properties
services.msc
```

### NPM Scripts (if installed from source)

```cmd
# Install as Windows Service
npm run install-service

# Uninstall Windows Service
npm run uninstall-service

# Run in foreground (for testing)
npm start

# Build executable
npm run build
```

## Monitoring

### Log Files

The collector writes logs to `collector.log` by default. Log levels:

- **DEBUG**: Detailed AMI events and processing steps
- **INFO**: Normal operations, connections, call processing
- **WARN**: Recoverable errors, reconnection attempts
- **ERROR**: Serious errors that may affect functionality

### Health Monitoring

The collector sends heartbeat messages to the TeleTrack cloud platform every minute. You can monitor collector health through the TeleTrack admin dashboard.

### Common Log Messages

```
[INFO] TeleTrack Collector v1.0.0 starting...
[INFO] ✅ Connected to AMI
[INFO] ✅ AMI authentication successful
[INFO] Queued call data: 1641891234.567 (ringing)
[INFO] ✅ Sent call data: 1641891234.567 - created
[WARN] AMI connection closed
[INFO] Reconnecting in 1000ms... (attempt 1/10)
```

## Troubleshooting

### Common Issues

#### "Config file not found"
- Ensure `config.json` exists in the same directory as the executable
- Copy from `config.example.json` and customize

#### "AMI connection failed"
- Check Asterisk AMI configuration
- Verify network connectivity to Asterisk server
- Confirm AMI credentials are correct

#### "Cloud connection test failed"
- Check internet connectivity
- Verify TeleTrack cloud endpoint URL
- Confirm API key is valid

#### "Authentication failed"
- Verify AMI username and password in config.json
- Check Asterisk manager.conf configuration
- Ensure AMI user has proper permissions

### Debug Mode

Run in debug mode to see detailed logs:

1. Edit `config.json` and set `"level": "debug"`
2. Restart the service or run `npm start`
3. Check logs for detailed AMI events and processing

### Testing Connection

Test AMI connection manually:

```cmd
telnet your-asterisk-ip 5038
```

You should see:
```
Asterisk Call Manager/X.X.X
```

## Performance & Scalability

### Performance Metrics

#### Expected Load Capacity
- **Small Office**: Up to 50 concurrent calls, 500 calls/day
- **Medium Business**: Up to 200 concurrent calls, 2,000 calls/day  
- **Large Enterprise**: Up to 1,000 concurrent calls, 10,000 calls/day

#### Resource Usage
- **CPU**: <5% on modern hardware under normal load
- **Memory**: 50-200 MB depending on queue size and batch settings
- **Network**: ~1 KB per call event, ~10 KB per batch
- **Storage**: ~100 MB logs per 10,000 calls (with rotation)

#### Throughput Benchmarks
- **Event Processing**: 1,000+ events/second
- **API Calls**: Limited by network latency and batch size
- **Queue Capacity**: 10,000+ events in memory before batching

### Scalability Options

#### Vertical Scaling
- Increase `batchSize` for higher throughput
- Reduce `batchTimeout` for lower latency
- Add more CPU/RAM for larger queues

#### Horizontal Scaling
- Deploy multiple collectors for different Asterisk servers
- Use unique `collector.name` for each instance
- Load balance across multiple TeleTrack cloud endpoints

#### High Availability Setup
```
┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Asterisk 1  │───►│ Collector A     │───►│ TeleTrack Cloud │
└─────────────┘    │ (Primary)       │    │ (Load Balanced) │
                   └─────────────────┘    └─────────────────┘
┌─────────────┐    ┌─────────────────┐           │
│ Asterisk 2  │───►│ Collector B     │───────────┘
└─────────────┘    │ (Secondary)     │
                   └─────────────────┘
```

### Performance Tuning

#### For High Call Volume
```json
{
  "collector": {
    "batchSize": 50,
    "batchTimeout": 1000,
    "heartbeatInterval": 300000
  },
  "cloud": {
    "timeout": 15000,
    "retryAttempts": 5,
    "retryDelay": 2000
  }
}
```

#### For Low Latency
```json
{
  "collector": {
    "batchSize": 1,
    "batchTimeout": 100,
    "heartbeatInterval": 30000
  },
  "cloud": {
    "timeout": 5000,
    "retryAttempts": 2,
    "retryDelay": 1000
  }
}
```

### Monitoring & Alerts

#### Key Performance Indicators (KPIs)
- **Event Processing Rate**: Events/second processed
- **API Success Rate**: Successful vs failed API calls
- **Queue Depth**: Number of events waiting to be sent
- **Response Time**: Average API response time
- **Uptime**: Collector availability percentage

#### Log Monitoring
Monitor these log patterns for performance issues:
```
[WARN] Queue size growing: 150 events pending
[ERROR] API timeout after 30000ms
[INFO] Batch processing took 5234ms (high latency)
```

## Backup & Recovery

### Data Protection

#### Local Data Backup
- **Log Files**: Automatically rotated and archived
- **Configuration**: Backup `config.json` regularly
- **Failed Calls**: Stored in `failed-calls.json` for retry

#### Recovery Procedures

##### Service Recovery
1. **Service Crash**: Automatically restarts via Windows Service Manager
2. **Configuration Error**: Restore from backup config.json
3. **Network Outage**: Automatic reconnection with exponential backoff

##### Data Recovery
1. **Failed API Calls**: Automatically retried with backoff
2. **Lost Events**: AMI reconnection recovers real-time stream
3. **Corrupted Logs**: Log rotation prevents total loss

#### Disaster Recovery Plan

##### Complete System Failure
1. **Backup Requirements**:
   - `config.json` (essential)
   - `collector.log` (for troubleshooting)
   - `failed-calls.json` (pending data)

2. **Recovery Steps**:
   ```cmd
   # 1. Install collector on new system
   teletrack-collector.exe --install-service
   
   # 2. Restore configuration
   copy backup-config.json config.json
   
   # 3. Start service
   net start "TeleTrack Collector"
   
   # 4. Verify connectivity
   # Check logs for successful AMI and cloud connections
   ```

3. **Data Continuity**:
   - Real-time events: Resume from AMI connection
   - Historical data: Available in TeleTrack cloud
   - Pending events: Restored from `failed-calls.json`

##### Network Partition Recovery
- **AMI Disconnection**: Automatic reconnection preserves event stream
- **Cloud Disconnection**: Local queuing prevents data loss
- **Partial Connectivity**: Retry logic handles intermittent failures

#### Backup Automation

##### PowerShell Backup Script
```powershell
# backup-collector.ps1
$BackupPath = "C:\Backups\TeleTrack"
$CollectorPath = "C:\Program Files\TeleTrack Collector"

# Create backup directory
New-Item -ItemType Directory -Force -Path $BackupPath

# Backup configuration
Copy-Item "$CollectorPath\config.json" "$BackupPath\config-$(Get-Date -Format 'yyyyMMdd').json"

# Backup logs (last 7 days)
Get-ChildItem "$CollectorPath\*.log" | Where-Object {$_.LastWriteTime -gt (Get-Date).AddDays(-7)} | Copy-Item -Destination $BackupPath

# Backup failed calls
if (Test-Path "$CollectorPath\failed-calls.json") {
    Copy-Item "$CollectorPath\failed-calls.json" "$BackupPath\failed-calls-$(Get-Date -Format 'yyyyMMdd').json"
}
```

##### Scheduled Backup
```cmd
# Schedule daily backup at 2 AM
schtasks /create /tn "TeleTrack Backup" /tr "powershell.exe -File C:\Scripts\backup-collector.ps1" /sc daily /st 02:00
```

## Security Considerations

- **API Keys**: Keep API keys secure and rotate regularly
- **Network**: Use VPN or secure networks for AMI connections
- **Firewall**: Restrict AMI port (5038) access to collector only
- **Credentials**: Use strong AMI passwords
- **Updates**: Keep collector updated to latest version

## Support

For support and configuration assistance:
- Check the TeleTrack admin dashboard for collector status
- Review collector logs for error messages
- Contact your TeleTrack system administrator

## Advanced Topics

### Custom Event Processing

You can extend the collector to process custom AMI events by modifying the `handleAMIEvent` method:

```javascript
// Add custom event types to process
const customEvents = ['UserEvent', 'VarSet', 'QueueMember'];
if (customEvents.includes(event.Event)) {
  this.handleCustomEvent(event);
}
```

### Integration Examples

#### Webhook Integration
Configure collector to send data to multiple endpoints:

```json
{
  "cloud": {
    "endpoints": [
      "https://tele-track.vercel.app/api/calls/ingest",
      "https://your-webhook.com/asterisk-events"
    ]
  }
}
```

#### Database Direct Integration
For high-volume environments, consider direct database integration:

```javascript
// Example: Direct PostgreSQL integration
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async sendToDatabase(callData) {
  await pool.query(
    'INSERT INTO calls (unique_id, phone_number, call_type, duration) VALUES ($1, $2, $3, $4)',
    [callData.uniqueId, callData.phoneNumber, callData.callType, callData.duration]
  );
}
```

### Development & Testing

#### Local Development Setup
1. **Mock Asterisk Server**: Use `mock-api-server.js` for testing
2. **Debug Mode**: Set logging level to `debug`
3. **Test Data**: Generate synthetic AMI events

#### Unit Testing
```cmd
# Run tests (if available)
npm test

# Test specific components
npm run test:ami
npm run test:cloud
```

#### Load Testing
```javascript
// Example load test script
const TeleTrackCollector = require('./collector');

async function loadTest() {
  const collector = new TeleTrackCollector();
  
  // Generate 1000 test events
  for (let i = 0; i < 1000; i++) {
    const testEvent = generateTestEvent(i);
    collector.handleAMIEvent(testEvent);
  }
}
```

## Version History

### v1.2.0 (Planned)
- Multi-endpoint support
- Enhanced error handling
- Performance optimizations
- Custom event processing

### v1.1.0 (Current)
- Improved data model documentation
- Performance tuning options
- Backup/recovery procedures
- Security enhancements

### v1.0.0
- Initial release
- AMI connection and event processing
- Windows Service support
- Cloud API integration
- Heartbeat and health monitoring
