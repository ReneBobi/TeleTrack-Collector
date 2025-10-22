#!/usr/bin/env node

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Collector-Name, X-Organization-Id');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - ${JSON.stringify(req.headers.authorization ? '[AUTH]' : 'No Auth')}`);
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'TeleTrack Mock API',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
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
    
    // Store call data to file for persistence
    const dataFile = 'received-calls.json';
    let calls = [];
    
    if (fs.existsSync(dataFile)) {
      try {
        const existingData = fs.readFileSync(dataFile, 'utf8');
        calls = JSON.parse(existingData);
      } catch (e) {
        console.warn('Failed to read existing calls, starting fresh');
        calls = [];
      }
    }
    
    const record = {
      id: Date.now().toString(),
      timestamp: timestamp,
      uniqueId: callData.uniqueId,
      callData: callData,
      collectorInfo: collectorInfo,
      receivedAt: timestamp
    };
    
    calls.push(record);
    fs.writeFileSync(dataFile, JSON.stringify(calls, null, 2));
    
    console.log(`✅ Stored call: ${callData.source || '?'} → ${callData.destination || '?'} (${callData.status || '?'})`);
    
    res.status(201).json({
      success: true,
      message: 'Call data received and stored successfully',
      id: record.id,
      timestamp: timestamp,
      action: 'created'
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

// Heartbeat endpoint
app.post('/api/calls/heartbeat', (req, res) => {
  try {
    const timestamp = new Date().toISOString();
    const heartbeatData = req.body;
    
    console.log(`[${timestamp}] Heartbeat received from: ${heartbeatData.collectorName || 'Unknown'}`);
    
    res.json({
      success: true,
      message: 'Heartbeat received',
      timestamp: timestamp,
      status: 'active'
    });
    
  } catch (error) {
    console.error('Error processing heartbeat:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get stored calls (for debugging)
app.get('/api/calls', (req, res) => {
  try {
    const dataFile = 'received-calls.json';
    
    if (!fs.existsSync(dataFile)) {
      return res.json({
        calls: [],
        count: 0,
        message: 'No calls received yet'
      });
    }
    
    const calls = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    
    res.json({
      calls: calls,
      count: calls.length,
      latest: calls[calls.length - 1] || null
    });
    
  } catch (error) {
    console.error('Error retrieving calls:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 TeleTrack Mock API Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📞 Call ingestion: POST http://localhost:${PORT}/api/calls/ingest`);
  console.log(`💓 Heartbeat: POST http://localhost:${PORT}/api/calls/heartbeat`);
  console.log(`📋 View calls: GET http://localhost:${PORT}/api/calls`);
  console.log('');
  console.log('To use this server, update your config.json endpoint to:');
  console.log(`"endpoint": "http://localhost:${PORT}/api/calls/ingest"`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Mock API Server...');
  process.exit(0);
});

module.exports = app;
