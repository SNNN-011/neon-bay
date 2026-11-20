// Neon Bay entry program — Node 22+, standard library only.
// The game itself is the static game/ folder next to this file: plain HTML +
// ES modules a desktop browser runs fully offline (vendored three.js, no
// network calls). This program's job is delivery, not gameplay: it copies
// game/ and screenshots/ into the grader's output directory and writes
// dossier.json, the file-by-file summary the judge reads, using the vendored
// make.fun library. Run it with:
//   node serve.ts            -> play locally at http://localhost:8080
//   MAKEFUN_OUTPUT_DIR=out node main.ts   -> produce a submission folder

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Ship the playable game and its cover screenshots side by side in output/.
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
const shotsDir = join(repoRoot, 'screenshots');
if (existsSync(shotsDir)) cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });

// Mirror the scorer's gate caps exactly so the dossier never describes an
// entry the scorer would refuse: 160 KiB of source text, at most 4 screenshots
// of 256 KiB each, and a game/ tree within 993 files / 48 MiB / 1000-byte paths.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
