// 사용법: node tools/bake_fx.mjs  (PFX 경로의 pixelfx 체크아웃 필요)
// pixelfx 이펙트를 색 바꿔 스프라이트 시트로 구워서 볼파이트 assets/fx 로 복사 + src/fxsheets.js 생성
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PFX = 'E:/마기 TRPG/pixelfx';
const GAME = 'E:/볼파이트';
const PAL = {
  gold: ["#1e1206", "#4a2c08", "#86520c", "#c48412", "#f0b424", "#ffe066", "#fff6c4", "#ffffff"],
  arcane: ["#140a26", "#2b1252", "#481c88", "#6b2cc0", "#9a48ec", "#c684ff", "#ecc8ff", "#ffffff"],
  ice: ["#0c1430", "#162c5c", "#1f4f94", "#2f7fcc", "#58b4ec", "#9bdcff", "#d8f4ff", "#ffffff"],
  water: ["#081830", "#0e2e5a", "#14508c", "#1c76bc", "#36a2e0", "#78ccf4", "#c4ecff", "#ffffff"],
  blood: ["#14040a", "#3a0a14", "#6a101c", "#a01824", "#d42a30", "#ff5a50", "#ff9a8a"],
  fire: ["#1f0b10", "#4a1118", "#8c1d1c", "#cc3a1a", "#f2701f", "#ffae35", "#ffe27a", "#fff8d6"],
};
const LIST = [
  ['smash_gold', 'mku/weapon-smash', { palette: PAL.gold }],
  ['blast_gold', 'mku/first-law-blast', { palette: PAL.gold }],
  ['blast_grape', 'mku/first-law-blast', { palette: PAL.arcane }],
  ['orb_grape', 'mku/weapon-orb', { palette: PAL.arcane }],
  ['coin', 'pickups/coin-spin', {}],
  ['crit', 'impacts/crit-hit', {}],
  ['pow', 'explosions/cartoon-pow', {}],
  ['burst_blue', 'arcane/mana-burst', { palette: PAL.ice }],
  ['strike_red', 'lightning/lightning-strike', { palette: PAL.blood }],
  ['heal_water', 'holy/heal-aoe', { palette: PAL.water }],
  ['rune_gold', 'arcane/rune-circle', { palette: PAL.gold }],
  ['rune_red', 'arcane/rune-circle', { palette: PAL.blood }],
  ['implode', 'explosions/implosion', {}],
  ['firework', 'explosions/firework-burst', {}],
  ['smash_red', 'mku/weapon-smash', { palette: PAL.fire }],
];
const out = path.join(GAME, 'assets/fx'); fs.mkdirSync(out, { recursive: true });
const tmp = path.join(PFX, 'records/_ballfight'); fs.mkdirSync(tmp, { recursive: true });
const meta = {};
for (const [name, id, opts] of LIST) {
  const dir = path.join(tmp, name);
  execFileSync('node', ['tools/render.mjs', id, '--sheet', '--opts', JSON.stringify(opts), '--out', dir], { cwd: PFX, stdio: 'pipe' });
  const base = id.split('/')[1];
  const find = (ext) => {   // --out 구조가 버전마다 달라서 찾아봄
    const cands = [path.join(dir, base + ext), path.join(dir, id, base + ext), path.join(dir, id.split('/')[0], base, base + ext)];
    return cands.find(f => fs.existsSync(f));
  };
  const png = find('.png'), json = find('.json');
  if (!png || !json) throw new Error('not found ' + name + ' in ' + dir);
  fs.copyFileSync(png, path.join(out, name + '.png'));
  const m = JSON.parse(fs.readFileSync(json, 'utf8')).meta.pixelfx;
  meta[name] = { src: 'assets/fx/' + name + '.png', fps: m.fps, n: m.frames, w: m.frameSize[0], h: m.frameSize[1], cols: m.columns, px: m.pivot[0], py: m.pivot[1], loop: !!m.loop };
  console.log(name, id, m.frames + 'f', m.frameSize.join('x'));
}
fs.writeFileSync(path.join(GAME, 'src/fxsheets.js'),
  '// pixelfx(https://github.com/patch-gg/pixelfx)로 구운 스프라이트 시트 정보. 다시 구우려면 bake_fx 스크립트\n' +
  'var FX_SHEETS = ' + JSON.stringify(meta, null, 1) + ';\n');
console.log('done', Object.keys(meta).length);
