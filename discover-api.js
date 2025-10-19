#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');

// Load config
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

async function discoverAPI() {
  console.log('🔍 Discovering TeleTrack API Structure...\n');
  
  const baseUrl = 'https://teletrack.vercel.app';
  
  // Common API endpoint patterns to test
  const endpoints = [
    '/api/calls',
    '/api/call',
    '/api/ingest',
    '/api/data',
    '/api/collect',
    '/api/collector',
    '/api/webhook',
    '/api/events',
    '/api/cdr',
    '/api/v1/calls',
    '/api/v1/ingest',
    '/calls',
    '/ingest',
    '/webhook',
    '/api/calls/create',
    '/api/calls/add',
    '/api/calls/submit'
  ];
  
  console.log('Testing common API endpoints...\n');
  
  for (const endpoint of endpoints) {
    try {
      console.log(`Testing: ${baseUrl}${endpoint}`);
      
      // Try POST first (most likely for data ingestion)
      const response = await axios.post(baseUrl + endpoint, {
        test: true,
        organizationId: config.organization.id
      }, {
        headers: {
          'Authorization': `Bearer ${config.organization.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000,
        validateStatus: function (status) {
          // Accept any status code to see what we get
          return status < 500;
        }
      });
      
      if (response.status === 200 || response.status === 201) {
        console.log(`  ✅ SUCCESS: ${response.status} - ${JSON.stringify(response.data)}`);
      } else if (response.status === 400 || response.status === 422) {
        console.log(`  🎯 FOUND (validation error): ${response.status} - ${JSON.stringify(response.data)}`);
      } else if (response.status === 401 || response.status === 403) {
        console.log(`  🔑 FOUND (auth required): ${response.status} - ${JSON.stringify(response.data)}`);
      } else if (response.status === 405) {
        console.log(`  ⚠️ Method not allowed: ${response.status}`);
      } else if (response.status === 404) {
        console.log(`  ❌ Not found: ${response.status}`);
      } else {
        console.log(`  ❓ Unexpected: ${response.status} - ${JSON.stringify(response.data)}`);
      }
      
    } catch (error) {
      if (error.response) {
        if (error.response.status === 404) {
          console.log(`  ❌ Not found: ${error.response.status}`);
        } else if (error.response.status === 405) {
          console.log(`  ⚠️ Method not allowed: ${error.response.status}`);
        } else {
          console.log(`  ❓ Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
      } else {
        console.log(`  💥 Network error: ${error.message}`);
      }
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n🎯 API Discovery completed!');
  console.log('\nRecommendation: Check the TeleTrack documentation or contact the API provider');
  console.log('for the correct endpoint structure and authentication method.');
}

discoverAPI().catch(console.error);
