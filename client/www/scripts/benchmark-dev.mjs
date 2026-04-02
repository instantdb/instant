#!/usr/bin/env node

/**
 * Benchmark script for Next.js dev server compile times.
 *
 * Usage:
 *   node scripts/benchmark-dev.mjs [--port 3100] [--pages /,/about] [--rounds 3] [--warmup]
 *
 * This script:
 *   1. Starts a fresh Next.js dev server (or connects to an existing one)
 *   2. Requests each page and measures server-side compile + render time (TTFB)
 *   3. Prints a detailed report
 */

import { spawn } from 'child_process';
import http from 'http';

const args = process.argv.slice(2);

function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return args[idx + 1];
}

const PORT = parseInt(getArg('port', '3100'), 10);
const PAGES = getArg('pages', '/,/about,/pricing,/docs').split(',');
const ROUNDS = parseInt(getArg('rounds', '1'), 10);
const WARMUP = args.includes('--warmup');
const EXTERNAL = args.includes('--external'); // connect to already-running server

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    let ttfb = null;
    const req = http.get(url, (res) => {
      ttfb = performance.now() - start;
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        const total = performance.now() - start;
        resolve({ ttfb, total, status: res.statusCode, bodySize: body.length });
      });
    });
    req.on('error', reject);
    req.setTimeout(120_000, () => {
      req.destroy();
      reject(new Error('Request timed out after 120s'));
    });
  });
}

function waitForServer(port, timeoutMs = 120_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function attempt() {
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('Server did not start within timeout'));
      }
      const req = http.get(`http://localhost:${port}/__nextjs_original-stack-frame`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => setTimeout(attempt, 500));
      req.setTimeout(2000, () => {
        req.destroy();
        setTimeout(attempt, 500);
      });
    }
    attempt();
  });
}

async function startServer(port) {
  console.log(`Starting Next.js dev server on port ${port}...`);
  const child = spawn('npx', ['next', 'dev', '--port', String(port)], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Capture output for debugging
  let serverOutput = '';
  child.stdout.on('data', (d) => (serverOutput += d.toString()));
  child.stderr.on('data', (d) => (serverOutput += d.toString()));

  child.on('error', (err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });

  // Wait for server to be ready
  try {
    await waitForServer(port);
  } catch (e) {
    console.error('Server failed to start. Output:\n', serverOutput.slice(-2000));
    child.kill('SIGTERM');
    process.exit(1);
  }

  console.log(`Server ready on port ${port}\n`);
  return child;
}

function formatMs(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

async function run() {
  let serverProcess = null;

  if (!EXTERNAL) {
    serverProcess = await startServer(PORT);
  } else {
    console.log(`Connecting to existing server on port ${PORT}...`);
    try {
      await waitForServer(PORT, 5000);
      console.log('Connected.\n');
    } catch {
      console.error(`No server found on port ${PORT}. Start one or remove --external.`);
      process.exit(1);
    }
  }

  const results = {};

  try {
    // Warmup: hit each page once to ensure initial compilation
    if (WARMUP) {
      console.log('=== Warmup (first compile) ===');
      for (const page of PAGES) {
        const url = `http://localhost:${PORT}${page}`;
        process.stdout.write(`  ${page} ... `);
        try {
          const r = await fetchPage(url);
          console.log(`TTFB: ${formatMs(r.ttfb)} | Total: ${formatMs(r.total)} | ${r.status}`);
        } catch (e) {
          console.log(`ERROR: ${e.message}`);
        }
      }
      console.log('');
    }

    // Cold compile: fresh server, first hit per page
    console.log(`=== Benchmark (${ROUNDS} round${ROUNDS > 1 ? 's' : ''}) ===`);

    for (let round = 1; round <= ROUNDS; round++) {
      if (ROUNDS > 1) console.log(`\n--- Round ${round} ---`);

      for (const page of PAGES) {
        const url = `http://localhost:${PORT}${page}`;
        process.stdout.write(`  ${page.padEnd(20)} `);
        try {
          const r = await fetchPage(url);
          if (!results[page]) results[page] = [];
          results[page].push(r);
          console.log(
            `TTFB: ${formatMs(r.ttfb).padStart(8)} | Total: ${formatMs(r.total).padStart(8)} | Status: ${r.status} | Size: ${(r.bodySize / 1024).toFixed(0)}KB`,
          );
        } catch (e) {
          console.log(`ERROR: ${e.message}`);
        }
      }
    }

    // Summary
    console.log('\n=== Summary ===');
    console.log(
      `${'Page'.padEnd(20)} ${'Avg TTFB'.padStart(10)} ${'Min TTFB'.padStart(10)} ${'Max TTFB'.padStart(10)} ${'Avg Total'.padStart(10)}`,
    );
    console.log('-'.repeat(62));

    for (const page of PAGES) {
      const rs = results[page] || [];
      if (rs.length === 0) continue;
      const avgTtfb = rs.reduce((s, r) => s + r.ttfb, 0) / rs.length;
      const minTtfb = Math.min(...rs.map((r) => r.ttfb));
      const maxTtfb = Math.max(...rs.map((r) => r.ttfb));
      const avgTotal = rs.reduce((s, r) => s + r.total, 0) / rs.length;
      console.log(
        `${page.padEnd(20)} ${formatMs(avgTtfb).padStart(10)} ${formatMs(minTtfb).padStart(10)} ${formatMs(maxTtfb).padStart(10)} ${formatMs(avgTotal).padStart(10)}`,
      );
    }
  } finally {
    if (serverProcess) {
      console.log('\nStopping server...');
      serverProcess.kill('SIGTERM');
      // Give it a moment to clean up
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
