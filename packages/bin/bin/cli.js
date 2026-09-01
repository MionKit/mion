#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {getExePath} from '../lib/index.js';

const exe = getExePath();

// On POSIX with Node >= 22.15, replace this process so signals and the exit
// code pass through transparently. Fall back to a child process otherwise.
if (process.platform !== 'win32' && typeof process.execve === 'function') {
  try {
    process.execve(exe, [exe, ...process.argv.slice(2)]);
  } catch {
    // execve unavailable on this build — fall through to execFileSync.
  }
}

try {
  execFileSync(exe, process.argv.slice(2), {stdio: 'inherit'});
} catch (err) {
  if (err && typeof err.status === 'number') process.exitCode = err.status;
  else throw err;
}
