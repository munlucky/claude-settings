#!/usr/bin/env node
import http from 'node:http';

const argValue = (name, fallback = '') => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
};

const host = argValue('--host', '127.0.0.1');
const port = Number(argValue('--port', '0'));

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end(`preview ok ${request.url || '/'}\n`);
});

server.on('error', (error) => {
  console.error(error.code || error.message);
  process.exit(1);
});

server.listen(port, host, () => {
  const address = server.address();
  console.log(`preview listening ${address.address}:${address.port}`);
  if (process.env.BROWSER_COMPLETION_SECRET) {
    console.log(`preview secret ${process.env.BROWSER_COMPLETION_SECRET}`);
  }
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
