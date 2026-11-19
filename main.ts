import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildBoard, buildRadar, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const projectScreenshots = join(here, 'screenshots');
const outputScreenshots = join(here, 'out', 'screenshots');
const outputScreenshotsAlt = join(here, 'out2', 'screenshots');
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && index + 1 < process.argv.length) return process.argv[index + 1]!;
  const equals = process.argv.find((value) => value.startsWith(`--${name}=`));
  return equals === undefined ? fallback : equals.slice(name.length + 3);
}

/** Return only this checkout's asset directory; never substitute a kit path. */
function assetSource(name: string): string | null {
  const local = join(here, name);
  return existsSync(local) && statSync(local).isDirectory() ? local : null;
}

function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const source = join(from, name);
    const target = join(to, name);
    const info = statSync(source);
    if (info.isDirectory()) copyTree(source, target);
    else if (info.isFile()) copyFileSync(source, target);
  }
}

function fail(message: string, code = 1): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile) || !statSync(inputFile).isFile()) {
  fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`, 2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const resolvedOut = join(process.cwd(), out);

try {
  const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
  const board = buildBoard(snapshot);
  const radar = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  const data = { rows: radar.rows, live: radar.live, model: 'conviction-weighted', as_of: radar.as_of };
  writeFileSync(join(out, 'data.js'), `window.RADAR = ${JSON.stringify(data)};\n`);

  for (const name of ['dashboard', 'screenshots']) {
    if (name === 'screenshots' && resolvedOut !== projectScreenshots) rmSync(join(out, name), { recursive: true, force: true });
    const source = assetSource(name);
    if (source === null) mkdirSync(join(out, name), { recursive: true });
    else copyTree(source, join(out, name));
  }

  writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }));
  process.stdout.write(`token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.live.length} live)\n`);
} catch (error) {
  if (error instanceof Error && error.message.startsWith('token radar:')) throw error;
  fail(error instanceof Error ? error.message : String(error));
}
