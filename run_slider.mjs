#!/usr/bin/env node
// Slider scenario: open the ModConfig form and exercise one BALANCE row's slider — the `-` and
// `+` buttons, and a click on the strip itself, which must set the value for that position.
//
// Coordinates are pixels inside the game window frame; the panel is centred by PosAutoCorrection
// at (188,200), so with row k at panel-local y = 95 + 40*(k-1):
//   `-`   panel-local (605, y)  -> screen x 793
//   `+`   panel-local (777, y)  -> screen x 965
//   cell c of 12 across the strip: panel-local x 625 + 12c -> screen 813 + 12c
//
// Usage:  node workshop/ModConfig/run_slider.mjs
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const SDK_URL =
  'file:///C:/Users/ringill/AppData/Roaming/npm/node_modules/@qwen-code/cua-sdk/computer-use/index.js';
const GAME_DIR = 'C:\\Games\\Steam\\steamapps\\common\\Space Rangers HD A War Apart';
const APP_ID = 'C:\\Games\\Space Rangers HD A War Apart\\Rangers.exe';
const MOD_SRC = 'C:\\Users\\ringill\\repo\\space_rangers\\workshop\\ModConfig\\mod';
const MOD_DST = GAME_DIR + '\\Mods\\Miscellaneous\\ModConfig';
const OUT_DIR = 'C:\\Users\\ringill\\repo\\space_rangers\\workshop\\ModConfig\\slider';

const AFTER_KILL_MS = 2_000;
const BOOT_WAIT_MS = 12_000;
const AFTER_ENTER_MS = 8_000;
const AFTER_CLICK_MS = 900;

const MENU_X = 0.704;
const LOAD_Y = 0.464;
const ICON_X = 0.010;
const ICON_Y = 0.010;
const PANEL_X = 188;
const PANEL_Y = 200;

const rowY = (k) => PANEL_Y + 95 + 40 * (k - 1);
const minus = (k) => ({ x: PANEL_X + 605, y: rowY(k) });
const plus = (k) => ({ x: PANEL_X + 777, y: rowY(k) });
const cell = (k, c) => ({ x: PANEL_X + 625 + 12 * c, y: rowY(k) });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[slider]', ...a);
const tryRun = (c, a) => {
  try {
    execFileSync(c, a, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

async function main() {
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
    fs.writeFileSync(OUT_DIR + '\\' + name + '.png', buf);
    log('saved', name);
  };
  const clickAt = async (p) => {
    await app.click(p);
    await sleep(AFTER_CLICK_MS);
  };

  log('4/5 click LOAD + Enter (Test Save)');
  await app.click({ x: Math.round(W * MENU_X), y: Math.round(H * LOAD_Y) });
  await sleep(1_500);
  await app.pressKey('Return');
  await sleep(AFTER_ENTER_MS);

  log('5/5 open the form and drive row 5 (CoalAggro) and row 1 (KlingStrength)');
  await app.click({ x: Math.round(W * ICON_X), y: Math.round(H * ICON_Y) });
  await sleep(AFTER_CLICK_MS + 600);
  await shot('0_open');

  // Drag the strip: press at the left end, move right, release — the value must follow the pointer,
  // not stay at the press cell.
  await app.drag({ fromX: 810, fromY: rowY(5), toX: 880, toY: rowY(5), steps: 24, durationMs: 700 });
  await sleep(AFTER_CLICK_MS);
  await shot('drag1');

  await app.drag({ fromX: 880, fromY: rowY(5), toX: 945, toY: rowY(5), steps: 24, durationMs: 700 });
  await sleep(AFTER_CLICK_MS);
  await shot('drag2');

  // A plain click (no movement) must set the value of the cell under the pointer.
  await clickAt({ x: 845, y: rowY(5) });
  await shot('click1');

  await clickAt({ x: 913, y: rowY(5) });
  await shot('click2');

  // After a drag the flag stays up until the pointer leaves the track: moving back over it (no
  // press) keeps writing, and once the pointer has left, moving over it again writes nothing.
  await app.rightClick({ x: 845, y: rowY(5) });
  await sleep(AFTER_CLICK_MS);
  await shot('hover_inside');

  await app.rightClick({ x: 400, y: 760 });
  await sleep(AFTER_CLICK_MS);

  await app.rightClick({ x: 880, y: rowY(5) });
  await sleep(AFTER_CLICK_MS);
  await shot('hover_after_leave');

  await computer.close();
}

main().catch((e) => {
  console.error('[slider] ERROR:', e && e.message ? e.message : e);
  process.exitCode = 1;
});
