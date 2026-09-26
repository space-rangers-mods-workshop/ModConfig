#!/usr/bin/env node
// Deterministic run of the "mod" scenario (workshop/ModConfig/path_mod.md):
//   1. kill Rangers.exe
//   2. clear  <game>\Mods\ModConfig  and copy  workshop/ModConfig/mod  into it
//   3. start the game, wait for the menu
//   4. click LOAD   -> press Enter (first entry is "Test Save")
//   5. wait for the save to load, click the panel button in the top-left corner
//   6. save the screenshot to result.png
//
// Coordinates are pixels in the game window's frame (1280x1032 -> SDK frame 1278x1030), not the
// desktop; the menu buttons sit at x = 0.704*W, and LOAD is one row above OPTIONS.
//
// Usage:  node workshop/ModConfig/run_mod.mjs
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const SDK_URL =
  'file:///C:/Users/ringill/AppData/Roaming/npm/node_modules/@qwen-code/cua-sdk/computer-use/index.js';
const GAME_DIR = 'C:\\Games\\Steam\\steamapps\\common\\Space Rangers HD A War Apart';
const APP_ID = 'C:\\Games\\Space Rangers HD A War Apart\\Rangers.exe'; // the SDK's id (junction target)
const MOD_SRC = 'C:\\Users\\ringill\\repo\\space_rangers\\workshop\\ModConfig\\mod';
const MOD_DST = GAME_DIR + '\\Mods\\Miscellaneous\\ModConfig';
const OUT = 'C:\\Users\\ringill\\repo\\space_rangers\\workshop\\ModConfig\\result.png';

const AFTER_KILL_MS = 2_000;
const BOOT_WAIT_MS = 12_000;
const AFTER_ENTER_MS = 8_000;
const AFTER_ICON_MS = 3_000;

const MENU_X = 0.704; // the menu button column
const LOAD_Y = 0.464; // 2nd of 7 buttons (OPTIONS is the 3rd at 0.512)
const ICON_X = 0.010; // the panel button, top-left corner (19x13 at screen 0,0)
const ICON_Y = 0.010;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[mod-scenario]', ...a);
const tryRun = (cmd, args) => {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

async function main() {
  log('1/6 kill Rangers.exe');
  tryRun('taskkill', ['/F', '/IM', 'Rangers.exe']);
  await sleep(AFTER_KILL_MS);

  log('2/6 deploy mod -> Mods\\ModConfig');
  tryRun('cmd', ['/c', 'rmdir', '/s', '/q', MOD_DST]);
  if (!tryRun('cmd', ['/c', 'xcopy', MOD_SRC, MOD_DST, '/e', '/i', '/y'])) {
    throw new Error('xcopy failed: ' + MOD_SRC + ' -> ' + MOD_DST);
  }

  log('3/6 start the game, wait', BOOT_WAIT_MS, 'ms');
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
  log('frame', W + 'x' + H, 'window=' + s.window);

  log('4/6 click LOAD + Enter (Test Save)');
  await app.click({ x: Math.round(W * MENU_X), y: Math.round(H * LOAD_Y) });
  await sleep(1_500);
  await app.pressKey('Return');
  await sleep(AFTER_ENTER_MS);

  log('5/6 click the panel button (top-left)');
  await app.click({ x: Math.round(W * ICON_X), y: Math.round(H * ICON_Y) });
  await sleep(AFTER_ICON_MS);

  s = await app.getState({ includeScreenshot: true });
  buf = Buffer.from(s.screenshot.images[0].dataBase64, 'base64');
  fs.writeFileSync(OUT, buf);
  log('6/6 saved', OUT, '(' + buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20) + ')');

  await computer.close();
}

main().catch((e) => {
  console.error('[mod-scenario] ERROR:', e && e.message ? e.message : e);
  process.exitCode = 1;
});
