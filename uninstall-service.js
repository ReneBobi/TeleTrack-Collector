#!/usr/bin/env node

const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
  name: 'TeleTrack Collector',
  script: path.join(__dirname, 'collector.js')
});

// Listen for the "uninstall" event so we know when it's done.
svc.on('uninstall', function() {
  console.log('✅ TeleTrack Collector service uninstalled successfully!');
  console.log('');
  console.log('The service has been removed from Windows Services.');
  console.log('You can reinstall it later using: node install-service.js');
});

svc.on('error', function(err) {
  console.error('❌ Service uninstall failed:', err.message);
  process.exit(1);
});

// Check if not installed
svc.on('doesnotexist', function() {
  console.log('⚠️  TeleTrack Collector service is not installed.');
  console.log('');
  console.log('To install the service, run: node install-service.js');
  process.exit(0);
});

console.log('Uninstalling TeleTrack Collector Windows Service...');
console.log('');
console.log('This will:');
console.log('  - Stop the service if it\'s running');
console.log('  - Remove the service from Windows Services');
console.log('  - Clean up service registry entries');
console.log('');

// Uninstall the service
svc.uninstall();
