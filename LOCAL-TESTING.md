# TeleTrack Collector - Local Testing Setup

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install express
   ```

2. **Start local testing environment:**
   ```bash
   node start-local-testing.js
   ```

   This will start both the mock API server and the collector.

## Manual Setup

### Option A: Start components separately

1. **Start Mock API Server:**
   ```bash
   node mock-api-server.js
   ```
   Server will run on http://localhost:3001

2. **Start Collector (in another terminal):**
   ```bash
   node collector.js
   ```
   Make sure to use config.local.json or update config.json endpoint to: `http://localhost:3001/api/calls/ingest`

### Option B: Update existing config

Update your `config.json` endpoint:
```json
{
  "cloud": {
    "endpoint": "http://localhost:3001/api/calls/ingest"
  }
}
```

## Testing

1. **Check API health:**
   ```bash
   curl http://localhost:3001/api/health
   ```

2. **View received calls:**
   ```bash
   curl http://localhost:3001/api/calls
   ```

3. **Test call ingestion:**
   ```bash
   node test-connection.js
   ```

## Files Created

- `mock-api-server.js` - Local API server that mimics TeleTrack cloud service
- `config.local.json` - Configuration for local testing
- `start-local-testing.js` - Startup script for complete testing environment
- `received-calls.json` - File where call data is stored (created automatically)

## Troubleshooting

- **Port 3001 in use:** Change PORT in mock-api-server.js and update config
- **Connection refused:** Make sure mock API server is running first
- **No calls received:** Check AMI connection and ensure calls are being made

## Production Setup

For production, you'll need to:
1. Set up a proper database (PostgreSQL, MySQL, etc.)
2. Deploy the API server to a cloud platform
3. Update the endpoint in config.json to your production URL
4. Implement proper authentication and security measures
