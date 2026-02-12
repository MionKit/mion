/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

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

/** Jest globalTeardown - stops test servers after all tests */
module.exports = async function globalTeardown() {
  console.log(`\n🛑 Stopping test servers...`);

  const servers = global.__TEST_SERVERS__;
  if (servers) {
    await Promise.all([
      stopServer(servers.jsonServerProcess, servers.TEST_SERVER_PORT_JSON),
      stopServer(servers.binaryServerProcess, servers.TEST_SERVER_PORT_BINARY),
    ]);
  }

  console.log('✅ Test servers stopped\n');
};
