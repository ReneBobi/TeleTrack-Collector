#!/usr/bin/env node

const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
  name: 'TeleTrack Collector',
  description: 'TeleTrack AMI Data Collector Service - Collects call data from Asterisk and sends to TeleTrack cloud platform',
  script: path.join(__dirname, 'collector.js'),
  nodeOptions: [
    '--max_old_space_size=4096'
  ],
  env: [
    {
      name: "NODE_ENV",
      value: "production"
    }
  ]
});

// Listen for the "install" event, which indicates the process is available as a service.
svc.on('install', function() {
  console.log('✅ TeleTrack Collector service installed successfully!');
  console.log('');
  console.log('Service Details:');
  console.log('  Name: TeleTrack Collector');
  console.log('  Status: Installed');
  console.log('  Auto-start: Yes');
  console.log('');
  console.log('Starting the service...');
  svc.start();
});

svc.on('start', function() {
  console.log('✅ TeleTrack Collector service started successfully!');
  console.log('');
  console.log('The service is now running in the background.');
  console.log('You can manage it through Windows Services (services.msc) or use:');
  console.log('  - Start: net start "TeleTrack Collector"');
  console.log('  - Stop: net stop "TeleTrack Collector"');
  console.log('  - Uninstall: node uninstall-service.js');
  console.log('');
  console.log('Logs are written to: collector.log');
});

svc.on('error', function(err) {
  console.error('❌ Service installation failed:', err.message);
  process.exit(1);
});

// Check if already installed
svc.on('alreadyinstalled', function() {
  console.log('⚠️  TeleTrack Collector service is already installed.');
  console.log('');
  console.log('To reinstall:');
  console.log('  1. Run: node uninstall-service.js');
  console.log('  2. Wait for uninstall to complete');
  console.log('  3. Run: node install-service.js');
  process.exit(0);
});

console.log('Installing TeleTrack Collector as Windows Service...');
console.log('');
console.log('This will:');
console.log('  - Install the service to run automatically on system startup');
console.log('  - Configure the service to restart on failure');
console.log('  - Set up logging to collector.log');
console.log('');

// Install the service
svc.install();
