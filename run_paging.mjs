#!/usr/bin/env node
// Paging scenario: open the ModConfig form, then click NEXT/BACK and sample both buttons after
// every step, so their enabled/disabled state can be checked.
//
// Coordinates are pixels inside the game window frame (1280x1032 -> SDK frame 1278x1030).
// The window is centred by PosAutoCorrection: panel origin lands at (188,200), so
// BACK = panel-local (30,8) 74x28 -> centre (255,222)
// NEXT = panel-local (799,8) 74x28 -> centre (1024,222)
//
// Usage:  node workshop/ModConfig/run_paging.mjs [steps]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const SDK_URL =
  'file:///C:/Users/ringill/AppData/Roaming/npm/node_modules/@qwen-code/cua-sdk/computer-use/index.js';
const GAME_DIR = 'C:\\Games\\Steam\\steamapps\\common\\Space Rangers HD A War Apart';
const APP_ID = 'C:\\Games\\Space Rangers HD A War Apart\\Rangers.exe';
const MOD_SRC = 'C:\\Users\\ringill\\repo\\space_rangers\\workshop\\ModConfig\\mod';
const MOD_DST = GAME_DIR + '\\Mods\\Miscellaneous\\ModConfig';
const OUT_DIR = 'C:\\Users\\ringill\\repo\\space_rangers\\workshop\\ModConfig\\paging';
const PYTHON = 'C:\\Users\\ringill\\repo\\space_rangers\\.venv\\Scripts\\python.exe';

const AFTER_KILL_MS = 2_000;
const BOOT_WAIT_MS = 12_000;
const AFTER_ENTER_MS = 8_000;
const AFTER_CLICK_MS = 1_500;

const MENU_X = 0.704;
const LOAD_Y = 0.464;
const ICON_X = 0.010;
const ICON_Y = 0.010;
const BACK = { x: 255, y: 222 };
const NEXT = { x: 1024, y: 222 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[paging]', ...a);
const tryRun = (c, a) => {
  try {
    execFileSync(c, a, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

// Samples BACK/NEXT with the project's own GI codec (no extra dependencies).
function sampleButtons(file) {
  const code =
    "import sys; sys.path.insert(0,'tools/SRHD-XenoModKit');" +
    "from pathlib import Path; from srhd_modkit.image_codec import decode_png;" +
    `im=decode_png(Path(r'${file}').read_bytes());` +
    "print('back', im.pixel(255,222), 'next', im.pixel(1024,222))";
  try {
    return execFileSync(PYTHON, ['-c', code], { encoding: 'utf8' }).trim();
  } catch (e) {
    return 'sample failed: ' + (e && e.message ? e.message : e);
  }
}

async function main() {
  const steps = Number(process.argv[2] || 6);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  log('1/5 kill Rangers.exe');
  tryRun('taskkill', ['/F', '/IM', 'Rangers.exe']);
  await sleep(AFTER_KILL_MS);

  log('2/5 deploy mod -> Mods\\Miscellaneous\\ModConfig');
  tryRun('cmd', ['/c', 'rmdir', '/s', '/q', MOD_DST]);
  if (!tryRun('cmd', ['/c', 'xcopy', MOD_SRC, MOD_DST, '/e', '/i', '/y'])) {
    throw new Error('xcopy failed: ' + MOD_SRC + ' -> ' + MOD_DST);
  }

  log('3/5 start the game, wait', BOOT_WAIT_MS, 'ms');
  if (!tryRun('cmd', ['/c', 'start', '', '/D', GAME_DIR, 'Rangers.exe'])) {
    throw new Error('failed to start Rangers.exe');
  }
  await sleep(BOOT_WAIT_MS);

  const { ComputerUse } = await import(SDK_URL);
  const computer = await ComputerUse.create();
  const app = await computer.getApp(APP_ID);
  let s = await app.getState({ includeScreenshot: true });
  let buf = Buffer.from(s.screenshot.images[0].dataBase64, 'base64');
  const W = buf.readUInt32BE(16);
  const H = buf.readUInt32BE(20);
  log('frame', W + 'x' + H);

  const shot = async (name) => {
    s = await app.getState({ includeScreenshot: true });
    buf = Buffer.from(s.screenshot.images[0].dataBase64, 'base64');
    const file = OUT_DIR + '\\' + name + '.png';
    fs.writeFileSync(file, buf);
    log(name, sampleButtons(file));
  };

  log('4/5 click LOAD + Enter (Test Save)');
  await app.click({ x: Math.round(W * MENU_X), y: Math.round(H * LOAD_Y) });
  await sleep(1_500);
  await app.pressKey('Return');
  await sleep(AFTER_ENTER_MS);

  log('5/5 open the form, then page');
  await app.click({ x: Math.round(W * ICON_X), y: Math.round(H * ICON_Y) });
  await sleep(AFTER_CLICK_MS);
  await shot('page_open');

  for (let i = 1; i <= steps; i += 1) {
    await app.click(NEXT);
    await sleep(AFTER_CLICK_MS);
    await shot('next_' + i);
  }
  for (let i = 1; i <= steps; i += 1) {
    await app.click(BACK);
    await sleep(AFTER_CLICK_MS);
    await shot('back_' + i);
  }

  await computer.close();
}

main().catch((e) => {
  console.error('[paging] ERROR:', e && e.message ? e.message : e);
  process.exitCode = 1;
});
