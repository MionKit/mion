/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

const {spawn} = require('child_process');
const path = require('path');

/** Ports used by test-publish tests */
const TEST_SERVER_PORT_JSON = 8086;
const TEST_SERVER_PORT_BINARY = 8087;

let jsonServerProcess = null;
let binaryServerProcess = null;

/** Wait for server to be ready by polling */
async function waitForServer(port, timeoutMs = 30000) {
  const startTime = Date.now();
  const checkInterval = 200;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`http://localhost:${port}/`);
      if (response.ok || response.status === 404) {
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, checkInterval));
  }

  throw new Error(`Server failed to start on port ${port} within ${timeoutMs}ms`);
}

/** Kill any process using the specified port */
async function killProcessOnPort(port) {
  try {
    const {exec} = require('child_process');
    const {promisify} = require('util');
    const execAsync = promisify(exec);
    await execAsync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`);
    await new Promise((r) => setTimeout(r, 500));
  } catch {
    // Ignore errors
  }
}

/** Start a test server process */
async function startServer(port, serverScript, label) {
  const testServerPackage = path.resolve(__dirname, '../test-server');
  const viteConfig = path.join(testServerPackage, 'vite.config.ts');

  const serverProcess = spawn('npx', ['vite-node', '--config', viteConfig, serverScript, port.toString()], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: testServerPackage,
    env: {...process.env, MION_TEST_SERVER_AUTO_START: 'true'},
    detached: true,
  });

  serverProcess.stdout?.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[${label}] ${msg}`);
  });

  serverProcess.stderr?.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[${label} ERROR] ${msg}`);
  });

  serverProcess.on('error', (error) => {
    console.error(`[${label}] Failed to start:`, error);
  });

  return serverProcess;
}

/** Stop a server process */
async function stopServer(serverProcess, port) {
  if (serverProcess && !serverProcess.killed) {
    const pid = serverProcess.pid;

    if (pid) {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        serverProcess.kill('SIGTERM');
      }
    } else {
      serverProcess.kill('SIGTERM');
    }

    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (serverProcess && !serverProcess.killed) {
          if (pid) {
            try {
              process.kill(-pid, 'SIGKILL');
            } catch {
              serverProcess.kill('SIGKILL');
            }
          } else {
            serverProcess.kill('SIGKILL');
          }
        }
        resolve();
      }, 5000);

      serverProcess.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  await killProcessOnPort(port);
}

/** Jest globalSetup - starts test servers before all tests */
module.exports = async function globalSetup() {
  const testServerPackage = path.resolve(__dirname, '../test-server');
  const jsonScript = path.join(testServerPackage, 'src/test-server-json.ts');
  const binaryScript = path.join(testServerPackage, 'src/test-server-binary.ts');

  console.log(`\n🚀 Starting test servers...`);

  // Clean up any existing processes
  await Promise.all([killProcessOnPort(TEST_SERVER_PORT_JSON), killProcessOnPort(TEST_SERVER_PORT_BINARY)]);

  // Start both servers
  jsonServerProcess = await startServer(TEST_SERVER_PORT_JSON, jsonScript, 'JSON-SERVER');
  binaryServerProcess = await startServer(TEST_SERVER_PORT_BINARY, binaryScript, 'BINARY-SERVER');

  // Wait for both servers to be ready
  try {
    await Promise.all([waitForServer(TEST_SERVER_PORT_JSON), waitForServer(TEST_SERVER_PORT_BINARY)]);
    console.log(`✅ JSON server ready on port ${TEST_SERVER_PORT_JSON}`);
    console.log(`✅ Binary server ready on port ${TEST_SERVER_PORT_BINARY}\n`);
  } catch (error) {
    // Kill processes if startup failed
    await Promise.all([
      stopServer(jsonServerProcess, TEST_SERVER_PORT_JSON),
      stopServer(binaryServerProcess, TEST_SERVER_PORT_BINARY),
    ]);
    throw error;
  }

  // Store processes globally for teardown
  global.__TEST_SERVERS__ = {
    jsonServerProcess,
    binaryServerProcess,
    TEST_SERVER_PORT_JSON,
    TEST_SERVER_PORT_BINARY,
  };
};
