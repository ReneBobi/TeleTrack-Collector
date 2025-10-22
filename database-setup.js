#!/usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');

// Create database file
const dbPath = path.join(__dirname, 'teletrack.db');
const db = new Database(dbPath);

console.log('🔧 Setting up TeleTrack database...');

// Create tables
try {
  // Organizations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      apiKey TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Collectors table
  db.exec(`
    CREATE TABLE IF NOT EXISTS collectors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      hostname TEXT NOT NULL,
      ipAddress TEXT NOT NULL,
      version TEXT NOT NULL,
      lastSeen DATETIME DEFAULT CURRENT_TIMESTAMP,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Call history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS call_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uniqueId TEXT NOT NULL,
      organizationId TEXT NOT NULL,
      collectorId INTEGER,
      timestamp TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT,
      destination TEXT,
      callerName TEXT,
      direction TEXT NOT NULL,
      callType TEXT NOT NULL,
      sourceRaw TEXT,
      destRaw TEXT,
      duration INTEGER DEFAULT 0,
      billableSeconds INTEGER DEFAULT 0,
      disposition TEXT,
      lastApp TEXT,
      context TEXT,
      destinationContext TEXT,
      lastData TEXT,
      phoneNumber TEXT,
      rawEvent TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organizationId) REFERENCES organizations (id),
      FOREIGN KEY (collectorId) REFERENCES collectors (id)
    )
  `);

  // Create indexes for better performance
  db.exec(`CREATE INDEX IF NOT EXISTS idx_call_history_uniqueId ON call_history(uniqueId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_call_history_timestamp ON call_history(timestamp)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_call_history_organization ON call_history(organizationId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_call_history_source ON call_history(source)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_call_history_destination ON call_history(destination)`);

  console.log('✅ Database tables created successfully');

  // Insert default organization
  const insertOrg = db.prepare(`
    INSERT OR REPLACE INTO organizations (id, name, apiKey) 
    VALUES (?, ?, ?)
  `);
  
  insertOrg.run('0531ee6d-630b-4639-b606-c8cb70641363', 'Gigaset', '0992ce42-fff3-4d45-a12a-793477ce88f5');
  console.log('✅ Default organization inserted');

} catch (error) {
  console.error('Error setting up database:', error);
} finally {
  db.close();
  console.log('🎉 Database setup completed!');
  console.log(`📁 Database file: ${dbPath}`);
}
