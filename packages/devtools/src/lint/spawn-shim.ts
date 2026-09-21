// The lint session's early fork, started at PLUGIN LOAD while the host process is still small: a host that
// runs the Rust linter in-process (oxlint) reserves tens of GB of address space once linting starts, after
// which fork() fails with ENOMEM on Linux, so the resolver can never be spawned lazily. Protocol: ONE
// newline-terminated JSON control line on stdin, `{"exec": "<binary>", "args": [...]}`, names the target to
// spawn with inherited stdio, so responses flow straight to the session; later stdin bytes are forwarded to
// it and its exit is mirrored. EOF before that line: the session went away, exit.

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
  // Bytes that arrived behind the control line must not be lost.
  if (rest.length > 0) child.stdin.write(rest);
  process.stdin.pipe(child.stdin);
}

process.stdin.on('data', onData);
process.stdin.on('end', () => process.exit(0));
