// `npm test` without a shell (Windows has no `WORKSPACE=$(mktemp -d)`): a fresh workspace, the node tests, then the Python tests.
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PYTHON } from '../host.ts';

const env = { ...process.env, WORKSPACE: mkdtempSync(join(tmpdir(), 'editor-test-')) };
const runs = [[process.execPath, ['--test', 'test/']],
  ...['test_transcribe', 'test_kit_lint', 'test_pace', 'test_joins'].map(t => [PYTHON, [`test/${t}.py`]])];
for (const [cmd, args] of runs) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
