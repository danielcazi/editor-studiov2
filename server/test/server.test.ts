// Starts the real server on a spare port with a throw-away workspace.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4500 + Math.floor(Math.random() * 400);
let srv: ChildProcess;
const JSON_HDR = { 'content-type': 'application/json' };

before(async () => {
  srv = spawn('node', [join(import.meta.dirname, '../server.ts')], { env: { ...process.env, PORT: String(PORT), WORKSPACE: mkdtempSync(join(tmpdir(), 'editor-srv-')) } });
  await new Promise<void>((ok, ko) => { srv.stdout!.on('data', d => /server on/.test(String(d)) && ok()); srv.on('error', ko); srv.on('exit', () => ko(new Error('server exited'))); });
});
after(() => srv.kill());

const call = (method: string, path: string, headers: Record<string, string>, body?: string) => new Promise<{ status: number; body: string }>((ok, ko) => {
  const r = http.request({ host: '127.0.0.1', port: PORT, method, path, headers }, res => { let b = ''; res.setEncoding('utf8'); res.on('data', d => b += d); res.on('end', () => ok({ status: res.statusCode!, body: b })); });
  r.on('error', ko); r.end(body);
});

test('a page on another site cannot drive the server', async () => {
  const body = JSON.stringify({ id: 'evil', format: { name: 'x' } });
  const foreign = await call('POST', '/formats', { ...JSON_HDR, origin: 'https://evil.example' }, body);
  assert.equal(foreign.status, 400); assert.match(foreign.body, /forbidden origin/);
  const plain = await call('POST', '/formats', { 'content-type': 'text/plain' }, body);
  assert.equal(plain.status, 400); assert.match(plain.body, /application\/json/);
  const rebound = await call('POST', '/formats', { ...JSON_HDR, host: `evil.example:${PORT}` }, body);
  assert.equal(rebound.status, 400); assert.match(rebound.body, /forbidden host/);
  const ok = await call('POST', '/formats', { ...JSON_HDR, origin: `http://127.0.0.1:${PORT}` }, body);
  assert.equal(ok.status, 200);
});

test('a request body keeps its accents however many chunks it arrives in', async () => {
  const name = 'ç'.repeat(300_000);
  const res = await call('POST', '/formats', JSON_HDR, JSON.stringify({ id: 'utf8', format: { name } }));
  assert.equal(JSON.parse(res.body).name, name);
});

test('the format delete route refuses an id that climbs out of the folder', async () => {
  const res = await call('DELETE', '/formats/..%2Fprojects', JSON_HDR);
  assert.equal(res.status, 400); assert.match(res.body, /format id/);
});
