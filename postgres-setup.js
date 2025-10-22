#!/usr/bin/env node

const { Pool } = require('pg');
const path = require('path');

// Database connection configuration
const dbConfig = {
  host: 'localhost',
  port: 5432,
  database: 'postgres',
  user: 'teletrack_admin',
  password: 'Solatar03$',
  ssl: false,
  connectionTimeoutMillis: 10000,
};

const pool = new Pool(dbConfig);

console.log('🔧 Setting up TeleTrack PostgreSQL database...');

async function setupDatabase() {
  const client = await pool.connect();
  
  try {
    // Create database if it doesn't exist
    await client.query('CREATE DATABASE teletrack');
    console.log('✅ Database "teletrack" created');
  } catch (error) {
    if (error.code === '42P04') {
      console.log('ℹ️ Database "teletrack" already exists');
    } else {
      console.error('Error creating database:', error.message);
    }
  } finally {
    client.release();
  }

  // Connect to the teletrack database
  const teletrackConfig = { ...dbConfig, database: 'teletrack' };
  const teletrackPool = new Pool(teletrackConfig);
  const teletrackClient = await teletrackPool.connect();

  try {
    // Create organizations table
    await teletrackClient.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        apiKey TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create collectors table
    await teletrackClient.query(`
      CREATE TABLE IF NOT EXISTS collectors (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        hostname TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        version TEXT NOT NULL,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create call_history table
    await teletrackClient.query(`
      CREATE TABLE IF NOT EXISTS call_history (
        id SERIAL PRIMARY KEY,
        unique_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        collector_id INTEGER,
        timestamp TEXT NOT NULL,
        status TEXT NOT NULL,
        source TEXT,
        destination TEXT,
        caller_name TEXT,
        direction TEXT NOT NULL,
        call_type TEXT NOT NULL,
        source_raw TEXT,
        dest_raw TEXT,
        duration INTEGER DEFAULT 0,
        billable_seconds INTEGER DEFAULT 0,
        disposition TEXT,
        last_app TEXT,
        context TEXT,
        destination_context TEXT,
        last_data TEXT,
        phone_number TEXT,
        raw_event JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations (id),
        FOREIGN KEY (collector_id) REFERENCES collectors (id)
      )
    `);

    // Create indexes for better performance
    await teletrackClient.query('CREATE INDEX IF NOT EXISTS idx_call_history_unique_id ON call_history(unique_id)');
    await teletrackClient.query('CREATE INDEX IF NOT EXISTS idx_call_history_timestamp ON call_history(timestamp)');
    await teletrackClient.query('CREATE INDEX IF NOT EXISTS idx_call_history_organization ON call_history(organization_id)');
    await teletrackClient.query('CREATE INDEX IF NOT EXISTS idx_call_history_source ON call_history(source)');
    await teletrackClient.query('CREATE INDEX IF NOT EXISTS idx_call_history_destination ON call_history(destination)');
    await teletrackClient.query('CREATE INDEX IF NOT EXISTS idx_call_history_created_at ON call_history(created_at)');

    console.log('✅ Database tables created successfully');

    // Insert default organization
    await teletrackClient.query(`
      INSERT INTO organizations (id, name, apiKey) 
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        apiKey = EXCLUDED.apiKey,
        updated_at = CURRENT_TIMESTAMP
    `, ['0531ee6d-630b-4639-b606-c8cb70641363', 'Gigaset', '0992ce42-fff3-4d45-a12a-793477ce88f5']);
    
    console.log('✅ Default organization inserted');

  } catch (error) {
    console.error('Error setting up database:', error);
  } finally {
    teletrackClient.release();
    await teletrackPool.end();
  }
}

setupDatabase()
  .then(() => {
    console.log('🎉 PostgreSQL database setup completed!');
    console.log('📁 Database: teletrack');
    console.log('👤 User: teletrack_admin');
    console.log('🔗 Connection: postgresql://teletrack_admin:Solatar03$@localhost:5432/teletrack');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
