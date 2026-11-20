// Neon Bay — submission packager. Node 22+, standard library only.
// Gameplay ships as the static game/ tree beside this file: plain HTML and
// ES modules that a desktop browser runs fully offline (three.js is vendored,
// nothing is fetched at play time). This program only packages the entry:
// it mirrors game/ and screenshots/ into the grader's output directory and
// writes dossier.json, the file-by-file digest the judge reads, through the
// vendored make.fun helper.
//   node serve.ts                          -> play at http://localhost:8080
//   MAKEFUN_OUTPUT_DIR=out node main.ts    -> build the submission folder

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Mirror one repo folder into the output tree, skipping it when absent.
function ship(folder: string) {
  const src = join(repoRoot, folder);
  if (!existsSync(src)) return;
  cpSync(src, join(outputDir, folder), { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
ship('game');
ship('screenshots');

// Keep the dossier inside the scorer's gate caps so it never describes an
// entry the scorer would refuse: 160 KiB of source text, up to 4 screenshots
// at 256 KiB each, and a game/ tree within 993 files / 48 MiB / 1000-byte paths.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);