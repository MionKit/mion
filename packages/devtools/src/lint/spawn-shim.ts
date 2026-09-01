// spawn-shim: a tiny pre-spawned launcher the lint session starts at PLUGIN
// LOAD time, while the host process is still small. Some lint hosts (oxlint
// runs the Rust linter inside the Node process via napi) reserve tens of GB
// of virtual address space once linting starts; Node's child_process uses
// fork() on Linux, and forking a process whose VSZ exceeds physical memory
// fails with ENOMEM under the kernel's default overcommit heuristic — so the
// resolver could never be spawned lazily. This shim IS the early fork: it
// idles until the session knows which binary to run (settings arrive with
// the first linted file), then starts it and gets out of the data path where
// it can.
//
// Protocol: ONE newline-terminated JSON control line arrives on stdin —
// `{"exec": "<binary>", "args": [...]}`. The shim spawns the target with its
// OWN stdout/stderr (inherited — responses flow straight to the session),
// forwards every later stdin byte to the target, and mirrors the target's
// exit. stdin EOF before the control line means the session went away: exit.

import {spawn} from 'node:child_process';

let buffer = Buffer.alloc(0);

function onData(chunk: Buffer): void {
  buffer = Buffer.concat([buffer, chunk]);
  const newline = buffer.indexOf(0x0a);
  if (newline < 0) return;
  process.stdin.off('data', onData);

  const control = JSON.parse(buffer.subarray(0, newline).toString('utf8')) as {exec: string; args: string[]};
  const rest = buffer.subarray(newline + 1);
  const child = spawn(control.exec, control.args, {stdio: ['pipe', 'inherit', 'inherit']});
  child.on('error', (error) => {
    console.error(`[runtypes] spawn-shim could not start ${control.exec}: ${error.message}`);
    process.exit(1);
  });
  child.on('exit', (code) => process.exit(code ?? 0));
  // Protocol bytes that rode in behind the control line must not be lost.
  if (rest.length > 0) child.stdin.write(rest);
  process.stdin.pipe(child.stdin);
}

process.stdin.on('data', onData);
process.stdin.on('end', () => process.exit(0));
