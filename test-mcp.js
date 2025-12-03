#!/usr/bin/env node
/**
 * Simple test to verify MCP server works
 */

import { spawn } from 'child_process';

const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

// Send initialize request
const initRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'test-client',
      version: '1.0.0',
    },
  },
};

server.stdin.write(JSON.stringify(initRequest) + '\n');

// Send list tools request
setTimeout(() => {
  const listToolsRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  };
  server.stdin.write(JSON.stringify(listToolsRequest) + '\n');
}, 1000);

// Collect output
let output = '';
server.stdout.on('data', (data) => {
  output += data.toString();
  console.log('Received:', data.toString());
});

// Exit after 3 seconds
setTimeout(() => {
  console.log('\n=== Test Complete ===');
  console.log('Full output:', output);
  server.kill();
  process.exit(0);
}, 3000);
