#!/usr/bin/env node

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3001;

// Database setup
const dbPath = path.join(__dirname, 'teletrack.db');
const db = new Database(dbPath);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'TeleTrack API Server',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: 'SQLite'
  });
});

// Call data ingestion endpoint
app.post('/api/calls/ingest', (req, res) => {
  try {
    const timestamp = new Date().toISOString();
    const payload = req.body;
    
    console.log(`[${timestamp}] Received call data from collector: ${payload.collectorInfo?.name || 'Unknown'}`);
    
    // Extract data from payload structure
    const callData = payload.callData || {};
    const collectorInfo = payload.collectorInfo || {};
    
    // Validate required fields
    if (!callData.uniqueId) {
      return res.status(400).json({
        error: 'Missing required field: uniqueId',
        message: 'uniqueId is required'
      });
    }
    
    // Insert or update collector info
    db.run(`
      INSERT OR REPLACE INTO collectors (name, hostname, ipAddress, version, lastSeen)
      VALUES (?, ?, ?, ?, ?)
    `, [
      collectorInfo.name || 'unknown',
      collectorInfo.hostname || 'unknown',
      collectorInfo.ipAddress || 'unknown',
      collectorInfo.version || 'unknown',
      timestamp
    ], function(err) {
      if (err) {
        console.error('Error inserting collector:', err);
        return res.status(500).json({
          error: 'Database error',
          message: err.message
        });
      }
      
      const collectorId = this.lastID;
      
      // Insert call data
      db.run(`
        INSERT INTO call_history (
          uniqueId, organizationId, collectorId, timestamp, status, source, destination,
          callerName, direction, callType, sourceRaw, destRaw, duration, billableSeconds,
          disposition, lastApp, context, destinationContext, lastData, phoneNumber, rawEvent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        callData.uniqueId,
        '0531ee6d-630b-4639-b606-c8cb70641363', // Default organization ID
        collectorId,
        callData.timestamp,
        callData.status,
        callData.source,
        callData.destination,
        callData.callerName,
        callData.direction,
        callData.callType,
        callData.source_raw,
        callData.dest_raw,
        callData.duration || 0,
        callData.billableSeconds || 0,
        callData.disposition,
        callData.lastApp,
        callData.context,
        callData.destinationContext,
        callData.lastData,
        callData.phoneNumber,
        JSON.stringify(callData.rawEvent)
      ], function(err) {
        if (err) {
          console.error('Error inserting call data:', err);
          return res.status(500).json({
            error: 'Database error',
            message: err.message
          });
        }
        
        console.log(`✅ Stored call: ${callData.source || '?'} → ${callData.destination || '?'} (${callData.status || '?'}) - ID: ${this.lastID}`);
        
        res.status(201).json({
          success: true,
          message: 'Call data received and stored successfully',
          id: this.lastID,
          timestamp: timestamp,
          action: 'created'
        });
      });
    });
    
  } catch (error) {
    console.error('Error processing call data:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      details: error.stack
    });
  }
});

// Get call history endpoint
app.get('/api/calls', (req, res) => {
  const limit = req.query.limit || 100;
  const offset = req.query.offset || 0;
  
  db.all(`
    SELECT 
      ch.*,
      c.name as collectorName,
      c.hostname as collectorHostname,
      o.name as organizationName
    FROM call_history ch
    LEFT JOIN collectors c ON ch.collectorId = c.id
    LEFT JOIN organizations o ON ch.organizationId = o.id
    ORDER BY ch.createdAt DESC
    LIMIT ? OFFSET ?
  `, [limit, offset], (err, rows) => {
    if (err) {
      console.error('Error retrieving calls:', err);
      return res.status(500).json({
        error: 'Database error',
        message: err.message
      });
    }
    
    res.json({
      calls: rows,
      count: rows.length,
      limit: limit,
      offset: offset
    });
  });
});

// Get call statistics
app.get('/api/calls/stats', (req, res) => {
  db.all(`
    SELECT 
      COUNT(*) as totalCalls,
      COUNT(DISTINCT source) as uniqueSources,
      COUNT(DISTINCT destination) as uniqueDestinations,
      COUNT(DISTINCT collectorId) as activeCollectors,
      AVG(duration) as avgDuration,
      SUM(billableSeconds) as totalBillableSeconds
    FROM call_history
  `, (err, rows) => {
    if (err) {
      console.error('Error retrieving stats:', err);
      return res.status(500).json({
        error: 'Database error',
        message: err.message
      });
    }
    
    res.json(rows[0]);
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 TeleTrack API Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📞 Call ingestion: POST http://localhost:${PORT}/api/calls/ingest`);
  console.log(`📋 View calls: GET http://localhost:${PORT}/api/calls`);
  console.log(`📈 Statistics: GET http://localhost:${PORT}/api/calls/stats`);
  console.log(`🗄️ Database: ${dbPath}`);
  console.log('');
  console.log('To use this server, update your config.json endpoint to:');
  console.log(`"endpoint": "http://localhost:${PORT}/api/calls/ingest"`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down API Server...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('✅ Database connection closed');
    }
    process.exit(0);
  });
});

module.exports = app;
