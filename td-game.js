/* ============================================================
 * 修仙护宗塔防（td-game.js）— 完整版
 * 妖怪攻山，布阵守护宗门。Canvas 2D 程序绘制，无外部素材。
 * 功能：3 张地图 / 5 种法宝塔（可升级）/ 5 类妖怪 / Boss 波 /
 *       道具 / 天赋研究 / 三星评价 / 关卡选择 / 音效 /
 *       本地存档 + 云端 game_saves 同步 + 全服排行榜
 * 依赖 index.html 全局：currentUser、supabaseRest、supabaseRpc、
 *       showToast、esc（均已在主页面定义，本文件后加载）
 * ============================================================ */
(function () {
'use strict';

/* ================= 样式注入 ================= */
var TD_CSS = [
'#tdView{--td-bg:#0d0f14;--td-card:#1c2030;--td-border:#2a2f42;--td-accent:#6c5ce7;--td-gold:#f1c40f;--td-red:#ff6b81;--td-green:#00b894;}',
'#tdView *{box-sizing:border-box;margin:0;padding:0;}',
'.td-wrap{width:100%;max-width:840px;margin:0 auto;font-family:-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#eef0f5;}',
'.td-hud{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:var(--td-card);border:1px solid var(--td-border);border-radius:12px;padding:8px 12px;margin-bottom:10px;font-size:13px;}',
'.td-hud .hud-item{display:flex;align-items:center;gap:5px;white-space:nowrap;}',
'.td-hud .hud-val{font-weight:700;font-size:14px;}',
'.td-hud .hud-btn{background:#2a2f42;border:1px solid var(--td-border);color:#eef0f5;border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;white-space:nowrap;}',
'.td-hud .hud-btn:hover{border-color:var(--td-accent);}',
'.td-hud .hud-btn:disabled{opacity:.4;cursor:not-allowed;}',
'.td-hud .hud-btn.gold{background:linear-gradient(135deg,#f0932b,#e67e22);color:#fff;border:none;font-weight:700;}',
'.td-stage{position:relative;width:100%;background:#10131c;border:1px solid var(--td-border);border-radius:12px;overflow:hidden;}',
'.td-stage canvas{display:block;width:100%;height:auto;touch-action:manipulation;}',
'.td-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(13,15,20,.88);z-index:5;padding:16px;text-align:center;pointer-events:none;}',
'.td-overlay .td-btn{pointer-events:auto;}',
'.td-overlay h2{font-size:20px;margin-bottom:2px;}',
'.td-overlay .sub{color:#8a8fa3;font-size:13px;margin-bottom:8px;}',
'.td-btn{background:linear-gradient(135deg,#6c5ce7,#8b7cf7);border:none;color:#fff;border-radius:10px;padding:10px 22px;font-size:14px;font-weight:700;cursor:pointer;}',
'.td-btn:hover{filter:brightness(1.1);}',
'.td-btn.ghost{background:#2a2f42;border:1px solid var(--td-border);color:#eef0f5;}',
'.td-bar{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}',
'.td-tower{display:flex;flex-direction:column;align-items:center;gap:2px;background:var(--td-card);border:1px solid var(--td-border);border-radius:10px;padding:8px 10px;cursor:pointer;min-width:86px;font-size:12px;transition:border-color .15s,transform .15s;}',
'.td-tower:hover{border-color:var(--td-accent);transform:translateY(-2px);}',
'.td-tower.sel{border-color:var(--td-gold);background:#252a3d;box-shadow:0 0 0 1px var(--td-gold);}',
'.td-tower .ic{font-size:22px;line-height:1;}',
'.td-tower .nm{font-weight:700;font-size:12px;}',
'.td-tower .cs{color:var(--td-gold);font-size:11px;}',
'.td-tower .tg{color:#8a8fa3;font-size:10px;line-height:1.3;text-align:center;}',
'.td-tower.off{opacity:.35;cursor:not-allowed;}',
'.td-modal{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(13,15,20,.9);z-index:10;padding:16px;overflow-y:auto;}',
'.td-modal.show{display:flex;}',
'.td-modal .box{background:var(--td-card);border:1px solid var(--td-border);border-radius:14px;padding:20px;max-width:640px;width:fit-content;min-width:280px;max-height:86vh;overflow-y:auto;}',
'.td-modal .box h3{font-size:18px;margin-bottom:4px;}',
'.td-modal .box .sub{color:#8a8fa3;font-size:12px;margin-bottom:12px;}',
'.td-lv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;}',
'.td-lv-card{background:#161922;border:1px solid var(--td-border);border-radius:10px;padding:12px;cursor:pointer;text-align:left;}',
'.td-lv-card:hover{border-color:var(--td-accent);}',
'.td-lv-card.lock{opacity:.45;cursor:not-allowed;}',
'.td-lv-card .lv-name{font-weight:700;font-size:14px;}',
'.td-lv-card .lv-meta{color:#8a8fa3;font-size:11px;margin-top:4px;}',
'.td-lv-card .stars{color:var(--td-gold);font-size:14px;margin-top:6px;}',
'.td-talent{display:flex;justify-content:space-between;align-items:center;gap:10px;background:#161922;border:1px solid var(--td-border);border-radius:10px;padding:10px 12px;margin-bottom:8px;}',
'.td-talent .t-name{font-weight:700;font-size:13px;}',
'.td-talent .t-desc{color:#8a8fa3;font-size:11px;margin-top:2px;}',
'.td-talent .t-lv{color:var(--td-gold);font-size:12px;white-space:nowrap;}',
'.td-rank-row{display:flex;align-items:center;gap:10px;padding:7px 10px;border-bottom:1px solid var(--td-border);font-size:13px;}',
'.td-rank-row.head{color:#8a8fa3;font-size:12px;}',
'.td-rank-row.me{background:rgba(108,92,231,.14);}',
'.td-rank-row .r-n{width:28px;text-align:center;font-weight:700;}',
'.td-rank-row .r-u{flex:1;word-break:break-all;}',
'.td-rank-row .r-s{color:var(--td-gold);font-weight:700;min-width:64px;text-align:right;}',
'.td-toast{position:fixed;left:50%;bottom:70px;transform:translateX(-50%);background:rgba(20,24,36,.96);border:1px solid var(--td-border);color:#eef0f5;padding:8px 16px;border-radius:10px;font-size:13px;z-index:999;opacity:0;transition:opacity .2s;pointer-events:none;}',
'.td-toast.show{opacity:1;}',
'.td-inspect{position:absolute;background:var(--td-card);border:1px solid var(--td-gold);border-radius:10px;padding:10px 12px;z-index:6;font-size:12px;min-width:150px;}',
'.td-inspect .i-t{font-weight:700;font-size:13px;margin-bottom:4px;}',
'.td-inspect .i-row{display:flex;justify-content:space-between;gap:10px;margin-top:4px;font-size:11px;}',
'.td-inspect .i-btn{background:var(--td-accent);border:none;color:#fff;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:11px;}',
'.td-inspect .i-btn.sell{background:#e17055;}',
'@media(max-width:560px){.td-hud{font-size:12px;}.td-tower{min-width:72px;padding:6px 8px;}.td-tower .ic{font-size:18px;}}'
].join('\n');
var st = document.getElementById('td-style');
if (!st) { st = document.createElement('style'); st.id = 'td-style'; document.head.appendChild(st); }
st.textContent = TD_CSS;

/* ================= 配置 ================= */
var COLS = 12, ROWS = 8, CELL = 64;
var CW = COLS * CELL, CH = ROWS * CELL;

/* 关卡：path 为格子坐标序列，入口 x=-1 左外，出口 x=12 右外 */
var LEVELS = [
  {
    id: 1, name: '青石山道', desc: '妖潮初起，守住山门！', startCoins: 150, hp: 10,
    path: [[-1,2],[2,2],[2,5],[5,5],[5,1],[8,1],[8,4],[11,4],[12,4]],
    waves: [
      { t:'normal', n:6,  i:1.1, hp:1.0, spd:1.0, c:8  },
      { t:'normal', n:8,  i:0.9, hp:1.1, spd:1.0, c:8  },
      { t:'normal', n:7,  i:0.8, hp:1.2, spd:1.05,c:9  },
      { t:'fast',   n:6,  i:0.9, hp:0.9, spd:1.0, c:10 },
      { t:'normal', n:10, i:0.7, hp:1.3, spd:1.05,c:9  },
      { t:'fast',   n:8,  i:0.8, hp:1.0, spd:1.0, c:10 },
      { t:'tank',   n:5,  i:1.6, hp:1.0, spd:1.0, c:15 },
      { t:'normal', n:12, i:0.6, hp:1.4, spd:1.1, c:9  },
      { t:'tank',   n:6,  i:1.4, hp:1.2, spd:1.0, c:15 },
      { t:'boss',   n:1,  i:0,   hp:1.0, spd:1.0, c:100}
    ]
  },
  {
    id: 2, name: '幽谷栈道', desc: '山道蜿蜒，妖速如风！', startCoins: 200, hp: 10,
    path: [[-1,1],[4,1],[4,3],[1,3],[1,6],[7,6],[7,2],[10,2],[10,5],[12,5]],
    waves: [
      { t:'normal', n:8,  i:0.9, hp:1.1, spd:1.0, c:9  },
      { t:'fast',   n:7,  i:0.8, hp:1.0, spd:1.0, c:11 },
      { t:'normal', n:10, i:0.7, hp:1.3, spd:1.05,c:9  },
      { t:'fast',   n:10, i:0.7, hp:1.1, spd:1.0, c:11 },
      { t:'tank',   n:6,  i:1.5, hp:1.0, spd:1.0, c:16 },
      { t:'boom',   n:6,  i:1.1, hp:1.0, spd:1.0, c:12 },
      { t:'fast',   n:12, i:0.6, hp:1.2, spd:1.0, c:11 },
      { t:'tank',   n:7,  i:1.3, hp:1.2, spd:1.0, c:16 },
      { t:'boom',   n:8,  i:1.0, hp:1.1, spd:1.0, c:12 },
      { t:'fast',   n:14, i:0.55,hp:1.3, spd:1.05,c:11 },
      { t:'tank',   n:8,  i:1.2, hp:1.4, spd:1.0, c:16 },
      { t:'boom',   n:10, i:0.9, hp:1.2, spd:1.0, c:13 },
      { t:'normal', n:16, i:0.5, hp:1.6, spd:1.1, c:10 },
      { t:'boss',   n:1,  i:0,   hp:1.0, spd:1.0, c:150},
      { t:'fast',   n:10, i:0.6, hp:1.4, spd:1.1, c:12 }
    ]
  },
  {
    id: 3, name: '天柱峰', desc: '妖王亲征，终极守护！', startCoins: 260, hp: 12,
    path: [[-1,5],[3,5],[3,2],[6,2],[6,6],[10,6],[10,3],[12,3]],
    waves: [
      { t:'normal', n:10, i:0.8, hp:1.3, spd:1.0, c:10 },
      { t:'fast',   n:10, i:0.7, hp:1.2, spd:1.0, c:12 },
      { t:'tank',   n:7,  i:1.3, hp:1.2, spd:1.0, c:17 },
      { t:'boom',   n:8,  i:1.0, hp:1.1, spd:1.0, c:13 },
      { t:'fast',   n:14, i:0.55,hp:1.4, spd:1.05,c:12 },
      { t:'boss',   n:1,  i:0,   hp:0.9, spd:1.0, c:180},
      { t:'tank',   n:9,  i:1.1, hp:1.5, spd:1.0, c:17 },
      { t:'boom',   n:10, i:0.8, hp:1.3, spd:1.0, c:14 },
      { t:'normal', n:18, i:0.45,hp:1.8, spd:1.15,c:11 },
      { t:'fast',   n:16, i:0.5, hp:1.6, spd:1.1, c:13 },
      { t:'tank',   n:10, i:1.0, hp:1.7, spd:1.0, c:18 },
      { t:'boom',   n:12, i:0.8, hp:1.4, spd:1.0, c:14 },
      { t:'fast',   n:18, i:0.4, hp:1.7, spd:1.15,c:13 },
      { t:'boss',   n:1,  i:0,   hp:1.3, spd:1.0, c:220},
      { t:'tank',   n:12, i:0.9, hp:1.9, spd:1.0, c:18 },
      { t:'boom',   n:14, i:0.7, hp:1.5, spd:1.0, c:15 },
      { t:'normal', n:22, i:0.4, hp:2.0, spd:1.2, c:12 },
      { t:'fast',   n:20, i:0.4, hp:1.8, spd:1.2, c:14 },
      { t:'boss',   n:2,  i:6,   hp:1.5, spd:1.0, c:250},
      { t:'boss',   n:1,  i:8,   hp:2.2, spd:0.9, c:500}
    ]
  }
];

/* 塔：lv 最大 3 级；dmg/rng/rate 为 1 级基值，升级乘子见升级表 */
var TOWERS = [
  { id:'sword', name:'青锋剑阵', ic:'⚔', cost:60,  dmg:16, rng:2.6, rate:0.55, col:'#a29bfe', desc:'单体快攻，射程中等' },
  { id:'thunder', name:'天雷阵', ic:'⚡', cost:90, dmg:26, rng:2.4, rate:1.25, col:'#74b9ff', desc:'范围落雷，攻速较慢' },
  { id:'ice', name:'玄冰阵', ic:'❄', cost:70,  dmg:8,  rng:2.5, rate:0.75, col:'#00cec9', desc:'冰冻减速 40%' },
  { id:'fire', name:'离火阵', ic:'🔥', cost:80, dmg:7,  rng:1.9, rate:0.9,  col:'#ff9f43', desc:'灼烧持续伤害 3 秒' },
  { id:'array', name:'八卦剑域', ic:'☯', cost:120, dmg:20, rng:2.8, rate:0.8, col:'#f1c40f', desc:'光环：友塔攻速 +25%' }
];
var TOWER_UP = { dmg: [1, 1.5, 2.2, 3.2], rate: [1, 0.9, 0.8, 0.7], rng: [1, 1.08, 1.16, 1.26] };
var UP_COST = [0, 50, 100, 180];
var SELL_RATE = 0.7;

/* 怪物：hp/spd 基值，随波次缩放 */
var MONSTERS = {
  normal: { name:'小妖',  hp:40,  spd:1.15, coin:8,  col:'#55efc4', r:11 },
  fast:   { name:'疾风妖',hp:26,  spd:2.30, coin:11, col:'#fdcb6e', r:9 },
  tank:   { name:'铁甲妖',hp:150, spd:0.75, coin:16, col:'#b2bec3', r:13 },
  boom:   { name:'自爆妖',hp:55,  spd:1.55, coin:13, col:'#ff7675', r:10 },
  boss:   { name:'妖王',  hp:1600,spd:0.62, coin:120,col:'#a29bfe', r:17 }
};

/* 道具 */
var ITEMS = [
  { id:'freeze', name:'定身符', ic:'🧊', cost:50,  desc:'全场妖怪定身 3 秒' },
  { id:'storm',  name:'雷暴符', ic:'🌩', cost:80,  desc:'全场造成 260 点伤害' },
  { id:'gold',   name:'灵石雨', ic:'💎', cost:60,  desc:'立即获得 150 灵石' }
];

/* 天赋：level 上限 + 每级消耗 + 效果函数（作用于战斗参数） */
var TALENTS = [
  { id:'income', name:'聚灵阵', ic:'💰', max:3, cost:[0,200,400,700], desc:'每局初始灵石 +25/级', apply:function(t){ return 0; }, init:function(){ return 25; } },
  { id:'dmg', name:'剑气淬炼', ic:'🗡', max:5, cost:[0,150,300,500,800,1200], desc:'所有塔伤害 +8%/级', apply:function(t){ return 1 + 0.08 * t; } },
  { id:'spd', name:'阵法加速', ic:'🌀', max:5, cost:[0,150,300,500,800,1200], desc:'所有塔攻速 +6%/级', apply:function(t){ return 1 + 0.06 * t; } },
  { id:'slow', name:'玄冰强化', ic:'❄️', max:3, cost:[0,200,400,700], desc:'玄冰阵减速效果 +15%/级', apply:function(t){ return 0.40 + 0.15 * t; } },
  { id:'boss', name:'镇妖诀', ic:'🐉', max:3, cost:[0,250,500,900], desc:'对妖王(Boss)伤害 +15%/级', apply:function(t){ return 1 + 0.15 * t; } }
];

/* ================= 全局状态 ================= */
var G = {
  view: null, canvas: null, ctx: null,
  lv: null,           // 当前关卡配置
  path: [],           // 像素路径点
  waveIdx: -1, waveState: 'idle', // idle|spawning|fighting|win|lose
  spawnQueue: [], spawnTimer: 0,
  hp: 0, coins: 0,
  speed: 1, paused: false, running: false,
  towers: [], monsters: [], bullets: [], fxs: [],
  selTower: null, placing: null, inspect: null,
  mouse: { x: -1, y: -1, gx: -1, gy: -1 },
  time: 0, kills: 0, waveCleared: 0, freezeUntil: 0,
  raf: 0, lastTs: 0, ring: 0,
  overlay: null, overlayMode: 'menu', // menu|result|paused
  resultStars: 0, resultScore: 0, resultWave: 0
};

var SAVE = { game:'td', stars:[0,0,0], bestWave:[0,0,0], bestScore:[0,0,0], coins:0, talents:{income:0,dmg:0,spd:0,slow:0,boss:0}, totalKills:0, unlocked:1, runs:{} };

/* ================= 工具 ================= */
function tdfmt(n) { return n >= 100000 ? (n/10000).toFixed(1) + '万' : String(Math.floor(n)); }
function tdLname() {
  try { var u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null; return u ? (u.lname || u.name.toLowerCase()) : ''; } catch(e) { return ''; }
}
function tdToast(msg) {
  var el = document.getElementById('tdToast');
  if (!el) { el = document.createElement('div'); el.id = 'tdToast'; el.className = 'td-toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove('show'); }, 1800);
}
function px(gx, gy) { return { x: (gx + 0.5) * CELL, y: (gy + 0.5) * CELL }; }
function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
function cellOf(x, y) { return { gx: Math.floor(x / CELL), gy: Math.floor(y / CELL) }; }
function isPathCell(gx, gy) { return G.path.some(function (p) { return p.gx === gx && p.gy === gy; }); }
function hasTower(gx, gy) { return G.towers.some(function (t) { return t.gx === gx && t.gy === gy; }); }
function talentLv(id) { return SAVE.talents[id] || 0; }
function bonusDmg() { return TALENTS[1].apply(talentLv('dmg')); }
function bonusRate() { return TALENTS[2].apply(talentLv('spd')); }
function bonusSlow() { return TALENTS[3].apply(talentLv('slow')); }
function bonusBoss() { return TALENTS[4].apply(talentLv('boss')); }
function startCoins() { return (G.lv ? G.lv.startCoins : 150) + TALENTS[0].init() * talentLv('income'); }

/* ================= 音效（WebAudio 合成，无素材） ================= */
var AC = null;
function audio() {
  try {
    if (!AC) { var C = window.AudioContext || window.webkitAudioContext; if (C) AC = new C(); }
    if (AC && AC.state === 'suspended') AC.resume();
    return AC;
  } catch (e) { return null; }
}
function tone(freq, dur, type, vol, delay) {
  var ac = audio(); if (!ac) return;
  var t0 = ac.currentTime + (delay || 0);
  var o = ac.createOscillator(), g = ac.createGain();
  o.type = type || 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(vol || 0.08, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
var SFX = {
  click: function () { tone(660, 0.08, 'triangle', 0.06); },
  place: function () { tone(520, 0.12, 'triangle', 0.09); tone(780, 0.1, 'triangle', 0.06, 0.06); },
  upgrade: function () { tone(440, 0.1, 'triangle', 0.08); tone(660, 0.1, 'triangle', 0.08, 0.07); tone(880, 0.12, 'triangle', 0.08, 0.14); },
  sell: function () { tone(300, 0.12, 'square', 0.05); },
  shoot: function () { tone(880 + Math.random() * 200, 0.05, 'square', 0.03); },
  boom: function () { tone(120, 0.25, 'sawtooth', 0.09); tone(60, 0.3, 'sine', 0.1, 0.02); },
  freeze: function () { tone(1400, 0.3, 'sine', 0.06); tone(1000, 0.35, 'sine', 0.05, 0.05); },
  coin: function () { tone(1000, 0.07, 'triangle', 0.05); tone(1330, 0.09, 'triangle', 0.05, 0.05); },
  wave: function () { tone(392, 0.15, 'triangle', 0.08); tone(523, 0.18, 'triangle', 0.08, 0.12); },
  win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.09, i * 0.13); }); },
  lose: function () { [392, 330, 262, 196].forEach(function (f, i) { tone(f, 0.25, 'sawtooth', 0.07, i * 0.16); }); },
  error: function () { tone(180, 0.15, 'square', 0.06); }
};

/* ================= 战斗核心 ================= */
function resetLevel() {
  G.towers = []; G.monsters = []; G.bullets = []; G.fxs = [];
  G.waveIdx = -1; G.waveState = 'idle'; G.spawnQueue = []; G.spawnTimer = 0;
  G.hp = G.lv.hp; G.coins = startCoins();
  G.kills = 0; G.waveCleared = 0; G.freezeUntil = 0;
  G.selTower = null; G.placing = null; G.inspect = null; G.speed = 1; G.paused = false; G.running = false;
  G.path = G.lv.path.map(function (pt) { var c = px(pt[0], pt[1]); return { x: c.x, y: c.y, gx: pt[0], gy: pt[1] }; });
  // 入口与出口像素点
  G.path[0].x = -20;
  G.path[G.path.length - 1].x = CW + 20;
  G.ring = 0;
}
function startLevel(id) {
  var lv = LEVELS.find(function (l) { return l.id === id; });
  if (!lv) return;
  if (id > SAVE.unlocked) { tdToast('请先通关上一关'); SFX.error(); return; }
  if (hasRun(id)) { askContinue(id); return; }
  beginLevel(id);
}
function beginLevel(id) {
  var lv = LEVELS.find(function (l) { return l.id === id; });
  if (!lv) return;
  G.lv = lv;
  resetLevel();
  showHud();
  showCanvasOverlay('levelReady');
  SFX.click();
}
function askContinue(id) {
  var r = SAVE.runs[id];
  if (!r) { beginLevel(id); return; }
  var lv = LEVELS.find(function (l) { return l.id === id; });
  var m = showModal('tdCtnModal');
  m.innerHTML = '<h3>⏳ 未完成的护宗战斗</h3>' +
    '<div class="sub">上次进度：第 ' + (r.waveIdx + 1) + ' / ' + lv.waves.length + ' 波 · 灵石 ' + tdfmt(r.coins) + ' · 阵法 ' + (r.towers || []).length + ' 座</div>' +
    '<div style="display:flex;gap:10px;justify-content:center;margin-top:12px;">' +
    '<button class="td-btn" id="tdCtnYes">▶ 继续战斗</button>' +
    '<button class="td-btn" id="tdCtnNo" style="background:#2a2f42;border:1px solid var(--td-border);color:#eef0f5;">重新开始</button></div>';
  document.getElementById('tdCtnYes').onclick = function () {
    closeModal('tdCtnModal');
    restoreRun(id);
  };
  document.getElementById('tdCtnNo').onclick = function () {
    closeModal('tdCtnModal');
    clearRun(id);
    saveProgress();
    beginLevel(id);
  };
}
function startWave() {
  if (G.waveState !== 'idle') return;
  // 续战场景：最后一波已是 idle（上次打到最后一波）→ 重打该波；否则推进到下一波
  if (G.waveIdx < G.lv.waves.length - 1) G.waveIdx++;
  var w = G.lv.waves[G.waveIdx];
  G.spawnQueue = [];
  for (var i = 0; i < w.n; i++) G.spawnQueue.push({ t: w.t, hpMul: w.hp, spdMul: w.spd, coin: w.c, at: i * w.i });
  G.spawnTimer = 0;
  G.waveState = 'spawning';
  G.running = true;
  snapshotRun();
  saveProgress();
  SFX.wave();
  updateHud();
}
function spawnMonster(type, hpMul, spdMul, coin) {
  var cfg = MONSTERS[type];
  var hpBase = cfg.hp * (1 + G.waveIdx * 0.22) * (hpMul || 1);
  var spd = cfg.spd * (spdMul || 1);
  G.monsters.push({
    type: type, cfg: cfg, hp: hpBase, maxHp: hpBase, spd: spd, coin: coin || cfg.coin,
    pathIdx: 0, x: G.path[0].x, y: G.path[0].y,
    slowUntil: 0, slowFactor: 1, dotUntil: 0, dotDps: 0, dotTick: 0,
    r: cfg.r, dead: false
  });
}
function towerDmg(t) {
  var cfg = TOWERS.find(function (x) { return x.id === t.id; });
  var d = cfg.dmg * TOWER_UP.dmg[t.lv] * bonusDmg();
  if (t.type === 'boss' && t.target && t.target.type === 'boss') d *= bonusBoss();
  return d;
}
function towerRate(t) {
  var cfg = TOWERS.find(function (x) { return x.id === t.id; });
  var base = cfg.rate * TOWER_UP.rate[t.lv];
  // 八卦剑域光环
  var aura = 1;
  G.towers.forEach(function (o) {
    if (o.id === 'array' && o !== t && dist(o, t) <= TOWERS[4].rng * CELL * 1.0) aura *= 1.25;
  });
  return base / (bonusRate() * aura);
}
function placeTower(id, gx, gy) {
  var cfg = TOWERS.find(function (x) { return x.id === id; });
  if (!cfg || !G.lv || G.waveState === 'lose') return;
  if (isPathCell(gx, gy)) { tdToast('不能建在山路上'); SFX.error(); return; }
  if (hasTower(gx, gy)) { tdToast('这里已有阵法'); SFX.error(); return; }
  if (G.coins < cfg.cost) { tdToast('灵石不足'); SFX.error(); return; }
  var c = px(gx, gy);
  G.coins -= cfg.cost;
  G.towers.push({ id: id, gx: gx, gy: gy, x: c.x, y: c.y, lv: 1, cd: 0, target: null, dead: false });
  G.fxs.push({ type: 'ring', x: c.x, y: c.y, t: 0, dur: 0.4, col: cfg.col });
  SFX.place();
  G.placing = null;
  updateHud();
  snapshotRun();
  saveProgress();
}
function upgradeTower(t) {
  if (t.lv >= 3) { tdToast('已达最高等级'); return; }
  var cost = UP_COST[t.lv + 1];
  if (G.coins < cost) { tdToast('灵石不足'); SFX.error(); return; }
  G.coins -= cost; t.lv++;
  G.fxs.push({ type: 'ring', x: t.x, y: t.y, t: 0, dur: 0.5, col: '#f1c40f' });
  SFX.upgrade();
  updateHud(); renderInspect();
  snapshotRun();
  saveProgress();
}
function sellTower(t) {
  var cfg = TOWERS.find(function (x) { return x.id === t.id; });
  var back = Math.floor((cfg.cost + (t.lv > 1 ? UP_COST[2] : 0) + (t.lv > 2 ? UP_COST[3] : 0)) * SELL_RATE);
  G.coins += back;
  G.towers = G.towers.filter(function (x) { return x !== t; });
  G.inspect = null;
  SFX.sell();
  tdToast('出售获得 ' + back + ' 灵石');
  updateHud();
  snapshotRun();
  saveProgress();
}
function useItem(id) {
  if (G.waveState !== 'spawning' && G.waveState !== 'fighting') return;
  var it = ITEMS.find(function (x) { return x.id === id; });
  if (!it || G.coins < it.cost) { tdToast('灵石不足'); SFX.error(); return; }
  G.coins -= it.cost;
  if (id === 'freeze') {
    G.freezeUntil = G.time + 3;    G.fxs.push({ type: 'snow', t: 0, dur: 3 });
    SFX.freeze();
    tdToast('定身符生效：妖怪定身 3 秒');
  } else if (id === 'storm') {
    G.monsters.forEach(function (m) { damageMonster(m, 260, null, '#fff'); });
    G.fxs.push({ type: 'flash', t: 0, dur: 0.5 });
    SFX.boom();
    tdToast('雷暴符：全场造成 260 伤害');
  } else if (id === 'gold') {
    G.coins += 150;
    SFX.coin();
    tdToast('灵石雨：+150 灵石');
  }
  updateHud();
  snapshotRun();
  saveProgress();
}
function damageMonster(m, dmg, tower, col) {
  if (m.dead) return;
  m.hp -= dmg;
  if (col) G.fxs.push({ type: 'hit', x: m.x, y: m.y, t: 0, dur: 0.18, col: col });
  if (m.hp <= 0) {
    m.dead = true;
    var isBoss = m.type === 'boss';
    G.kills++;
    G.coins += m.coin;
    SAVE.totalKills++;
    G.fxs.push({ type: 'text', x: m.x, y: m.y - 14, t: 0, dur: 0.7, text: '+' + m.coin, col: '#f1c40f' });
    if (isBoss) { SFX.boom(); G.fxs.push({ type: 'boom', x: m.x, y: m.y, t: 0, dur: 0.6, col: '#a29bfe' }); }
    else SFX.coin();
    // 自爆妖死亡：对周围妖怪造成 90 伤害（敌我不分的爆炸）
    if (m.type === 'boom') {
      G.monsters.forEach(function (o) { if (!o.dead && o !== m && dist(o, m) <= CELL * 1.8) damageMonster(o, 90, null, '#ff7675'); });
      G.fxs.push({ type: 'boom', x: m.x, y: m.y, t: 0, dur: 0.45, col: '#ff7675' });
    }
  }
}
function monsterReachEnd(m) {
  m.dead = true;
  var loss = m.type === 'boss' ? 3 : 1;
  G.hp = Math.max(0, G.hp - loss);
  G.fxs.push({ type: 'text', x: m.x - 10, y: m.y, t: 0, dur: 0.8, text: '破阵-' + loss, col: '#ff6b81' });
  SFX.error();
  if (G.hp <= 0) { loseLevel(); }
}
function towerAttack(t, dt) {
  t.cd -= dt;
  if (t.cd > 0) return;
  var cfg = TOWERS.find(function (x) { return x.id === t.id; });
  var rng = cfg.rng * CELL * TOWER_UP.rng[t.lv];
  var target = null, best = -1;
  G.monsters.forEach(function (m) {
    if (m.dead) return;
    var d = dist(t, m);
    if (d <= rng && m.pathIdx > best) { best = m.pathIdx; target = m; }
  });
  if (!target) return;
  t.cd = towerRate(t);
  t.target = target;
  if (t.id === 'sword') {
    G.bullets.push({ kind: 'sword', x: t.x, y: t.y, tx: target, dmg: towerDmg(t), spd: 520, col: cfg.col });
    SFX.shoot();
  } else if (t.id === 'thunder') {
    damageMonster(target, towerDmg(t), t, '#74b9ff');
    G.fxs.push({ type: 'bolt', x: target.x, y: target.y, t: 0, dur: 0.25 });
    // 溅射：周围 0.9 格
    G.monsters.forEach(function (m) { if (!m.dead && m !== target && dist(m, target) <= CELL * 0.9) damageMonster(m, towerDmg(t) * 0.45, t, '#74b9ff'); });
    SFX.boom();
  } else if (t.id === 'ice') {
    var slowF = bonusSlow();
    target.slowUntil = G.time + 1.6; target.slowFactor = Math.max(0.15, 1 - slowF);
    target.hp -= towerDmg(t);
    if (target.hp <= 0) target.dead = true;
    G.fxs.push({ type: 'snowhit', x: target.x, y: target.y, t: 0, dur: 0.3 });
    SFX.freeze();
  } else if (t.id === 'fire') {
    target.dotUntil = G.time + 3; target.dotDps = towerDmg(t) * 0.55; target.dotTick = 0;
    G.fxs.push({ type: 'firehit', x: target.x, y: target.y, t: 0, dur: 0.3 });
    SFX.shoot();
  } else if (t.id === 'array') {
    G.bullets.push({ kind: 'array', x: t.x, y: t.y, tx: target, dmg: towerDmg(t), spd: 420, col: cfg.col });
    SFX.shoot();
  }
}
function update(dt) {
  G.time += dt;
  if (G.time < G.freezeUntil) {
    G.monsters.forEach(function (m) { if (m.slowFactor > 0.05) m.slowFactor = 0.02; });
  }
  // 波次生成
  if (G.waveState === 'spawning') {
    G.spawnTimer += dt;
    while (G.spawnQueue.length && G.spawnQueue[0].at <= G.spawnTimer) {
      var s = G.spawnQueue.shift();
      spawnMonster(s.t, s.hpMul, s.spdMul, s.coin);
    }
    if (!G.spawnQueue.length && !G.monsters.some(function (m) { return !m.dead; })) {
      G.waveState = 'fighting';
      waveCleared();
    }
  }
  // 怪物移动
  G.monsters.forEach(function (m) {
    if (m.dead) return;
    var spd = m.spd * CELL * (m.slowFactor) * (G.time < G.freezeUntil ? 0.02 : 1);
    var target = G.path[m.pathIdx];
    if (!target) { monsterReachEnd(m); return; }
    var dx = target.x - m.x, dy = target.y - m.y, d = Math.sqrt(dx * dx + dy * dy);
    var step = spd * dt;
    if (d <= step) { m.x = target.x; m.y = target.y; m.pathIdx++; }
    else { m.x += dx / d * step; m.y += dy / d * step; }
    if (m.slowUntil < G.time) m.slowFactor = 1;
    // 灼烧 DOT
    if (m.dotUntil > G.time) {
      m.dotTick += dt;
      while (m.dotTick >= 0.5) { m.dotTick -= 0.5; damageMonster(m, m.dotDps * 0.5, null, '#ff9f43'); }
    }
  });
  // 塔攻击
  G.towers.forEach(function (t) { towerAttack(t, dt); });
  // 弹道
  G.bullets.forEach(function (b) {
    if (b.done) return;
    var tx = b.tx, d = dist(b, tx);
    var step = b.spd * dt;
    if (!tx.dead && d > step) { b.x += (tx.x - b.x) / d * step; b.y += (tx.y - b.y) / d * step; }
    else {
      if (!tx.dead) { damageMonster(tx, b.dmg, null, b.col); if (b.kind === 'sword') SFX.shoot(); }
      b.done = true;
    }
  });
  G.bullets = G.bullets.filter(function (b) { return !b.done; });
  G.monsters = G.monsters.filter(function (m) { return !m.dead; });
  // 特效
  G.fxs.forEach(function (f) { f.t += dt; });
  G.fxs = G.fxs.filter(function (f) { return f.t < f.dur; });
  // 结算检查（fighting 且无怪 → 下一波按钮）
  if (G.waveState === 'fighting' && !G.monsters.some(function (m) { return !m.dead; })) {
    if (G.waveIdx >= G.lv.waves.length - 1) { winLevel(); }
    else { G.waveState = 'idle'; G.running = false; updateHud(); }
  }
}
function waveCleared() {
  G.waveCleared = G.waveIdx + 1;
  var bonus = 30 + G.waveIdx * 8;
  G.coins += bonus;
  G.fxs.push({ type: 'text', x: CW / 2, y: 90, t: 0, dur: 1.2, text: '第 ' + (G.waveIdx + 1) + ' 波击退！灵石 +' + bonus, col: '#00b894' });
  SFX.coin();
  snapshotRun();
  saveProgress();
  updateHud();
}
function winLevel() {
  if (G.waveState === 'win') return;
  G.waveState = 'win'; G.running = false;
  var stars = G.hp >= G.lv.hp * 0.7 ? 3 : G.hp >= G.lv.hp * 0.4 ? 2 : 1;
  var score = G.kills * 10 + G.waveCleared * 50 + stars * 150;
  var idx = G.lv.id - 1;
  var newBest = false;
  if (stars > SAVE.stars[idx]) { SAVE.stars[idx] = stars; newBest = true; }
  if (G.waveCleared > SAVE.bestWave[idx]) SAVE.bestWave[idx] = G.waveCleared;
  if (score > SAVE.bestScore[idx]) { SAVE.bestScore[idx] = score; newBest = true; }
  if (G.lv.id >= SAVE.unlocked && G.lv.id < LEVELS.length) { SAVE.unlocked = G.lv.id + 1; }
  G.resultStars = stars; G.resultScore = score; G.resultWave = G.waveCleared;
  // 通关：本局灵石全部转为永久灵石（可买天赋），并清除本关续战快照
  SAVE.coins += G.coins;
  clearRun(G.lv.id);
  SFX.win();
  saveLocal();
  cloudSave();
  showCanvasOverlay('result');
}
function loseLevel() {
  if (G.waveState === 'lose') return;
  G.waveState = 'lose'; G.running = false;
  // 失败：本局灵石折半保留为永久灵石（鼓励重试而非归零），清除续战快照
  SAVE.coins += Math.floor(G.coins * 0.5);
  clearRun(G.lv.id);
  SFX.lose();
  saveLocal();
  cloudSave();
  showCanvasOverlay('lose');
}

/* ================= 渲染 ================= */
function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function render() {
  var ctx = G.ctx; if (!ctx) return;
  // 背景草地
  ctx.fillStyle = '#18221c';
  ctx.fillRect(0, 0, CW, CH);
  for (var gx = 0; gx < COLS; gx++) {
    for (var gy = 0; gy < ROWS; gy++) {
      var shade = (gx + gy) % 2 === 0 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.03)';
      ctx.fillStyle = shade;
      ctx.fillRect(gx * CELL, gy * CELL, CELL, CELL);
    }
  }
  // 装饰树丛（固定伪随机位置，避开路径）
  var seed = 7;
  function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
  for (var i = 0; i < 26; i++) {
    var tx = Math.floor(rnd() * COLS), ty = Math.floor(rnd() * ROWS);
    if (isPathCell(tx, ty) || hasTower(tx, ty)) continue;
    var cxp = tx * CELL + CELL / 2, cyp = ty * CELL + CELL / 2;
    ctx.fillStyle = 'rgba(46,74,58,0.5)';
    ctx.beginPath(); ctx.arc(cxp, cyp, 6 + rnd() * 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(34,56,44,0.45)';
    ctx.beginPath(); ctx.arc(cxp + 5, cyp + 3, 4 + rnd() * 4, 0, Math.PI * 2); ctx.fill();
  }
  // 路径
  ctx.strokeStyle = '#8d6e4c'; ctx.lineWidth = CELL * 0.62; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  G.path.forEach(function (p, i) { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = CELL * 0.66;
  ctx.stroke();
  ctx.strokeStyle = '#c8a06a'; ctx.lineWidth = CELL * 0.46;
  ctx.stroke();
  // 宗门（终点）
  var end = G.path[G.path.length - 1];
  if (end) drawSect(ctx, end.x - CELL * 0.7, end.y - CELL * 0.55);
  // 放置预览
  if (G.placing && G.mouse.gx >= 0 && G.mouse.gy >= 0) {
    var pgx = G.mouse.gx, pgy = G.mouse.gy;
    var ok = !isPathCell(pgx, pgy) && !hasTower(pgx, pgy) && pgx >= 0 && pgx < COLS && pgy >= 0 && pgy < ROWS;
    var pcfg = TOWERS.find(function (x) { return x.id === G.placing; });
    ctx.fillStyle = ok ? 'rgba(0,184,148,0.22)' : 'rgba(255,107,129,0.25)';
    ctx.fillRect(pgx * CELL, pgy * CELL, CELL, CELL);
    if (ok && pcfg) {
      ctx.strokeStyle = pcfg.col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pgx * CELL + CELL / 2, pgy * CELL + CELL / 2, pcfg.rng * CELL, 0, Math.PI * 2); ctx.stroke();
    }
  }
  // 塔
  G.towers.forEach(function (t) {
    var cfg = TOWERS.find(function (x) { return x.id === t.id; });
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(t.x + 2, t.y + 3, 16, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#141a24';
    ctx.beginPath(); ctx.arc(t.x, t.y, 16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = cfg.col; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(t.x, t.y, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = cfg.col; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(t.x, t.y, 21, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(cfg.ic, t.x, t.y + 1);
    // 等级星
    for (var s = 0; s < t.lv; s++) {
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath(); ctx.arc(t.x - 9 + s * 9, t.y + 21, 3, 0, Math.PI * 2); ctx.fill();
    }
    // 冷却
    if (t.cd > 0) {
      var pct = 1 - Math.min(1, t.cd / towerRate(t));
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath(); ctx.arc(t.x, t.y, 16, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2); ctx.fill();
    }
    // 八卦光环
    if (t.id === 'array') {
      ctx.strokeStyle = 'rgba(241,196,15,0.12)'; ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.arc(t.x, t.y, TOWERS[4].rng * CELL, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  });
  // 怪物
  G.monsters.forEach(function (m) {
    var wob = Math.sin(G.time * 6 + m.x) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(m.x + 1, m.y + m.r * 0.8 + 2, m.r * 0.8, m.r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    // 身体
    var grad = ctx.createRadialGradient(m.x - 3, m.y - 4 - wob, 2, m.x, m.y - wob, m.r);
    grad.addColorStop(0, '#ffffff44'); grad.addColorStop(1, m.cfg.col);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(m.x, m.y - wob, m.r, 0, Math.PI * 2); ctx.fill();
    // 角
    ctx.fillStyle = m.cfg.col;
    ctx.beginPath();
    ctx.moveTo(m.x - m.r * 0.5, m.y - wob - m.r * 0.55);
    ctx.lineTo(m.x - m.r * 0.2, m.y - wob - m.r * 1.15);
    ctx.lineTo(m.x + m.r * 0.05, m.y - wob - m.r * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(m.x + m.r * 0.45, m.y - wob - m.r * 0.5);
    ctx.lineTo(m.x + m.r * 0.75, m.y - wob - m.r * 1.05);
    ctx.lineTo(m.x + m.r * 1.0, m.y - wob - m.r * 0.45);
    ctx.closePath(); ctx.fill();
    // 眼睛
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath(); ctx.arc(m.x - m.r * 0.35, m.y - wob - m.r * 0.1, m.r * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(m.x + m.r * 0.35, m.y - wob - m.r * 0.1, m.r * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(m.x - m.r * 0.3, m.y - wob - m.r * 0.16, m.r * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(m.x + m.r * 0.4, m.y - wob - m.r * 0.16, m.r * 0.06, 0, Math.PI * 2); ctx.fill();
    // 冰冻
    if (m.slowFactor < 0.9 || G.time < G.freezeUntil) {
      ctx.strokeStyle = 'rgba(0,206,201,0.75)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(m.x, m.y - wob, m.r + 2, 0, Math.PI * 2); ctx.stroke();
    }
    // 灼烧
    if (m.dotUntil > G.time) {
      ctx.fillStyle = 'rgba(255,159,67,0.85)';
      ctx.beginPath(); ctx.arc(m.x + m.r * 0.4, m.y - wob - m.r * 1.1, 3, 0, Math.PI * 2); ctx.fill();
    }
    // 血条
    if (m.hp < m.maxHp) {
      var bw = m.r * 2.4, bx = m.x - bw / 2, by = m.y - wob - m.r - 9;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      drawRoundRect(ctx, bx - 1, by - 1, bw + 2, 6, 3); ctx.fill();
      ctx.fillStyle = m.type === 'boss' ? '#a29bfe' : '#00b894';
      drawRoundRect(ctx, bx, by, bw * Math.max(0, m.hp / m.maxHp), 4, 2); ctx.fill();
    }
    // Boss 名
    if (m.type === 'boss') {
      ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('妖王', m.x, m.y - wob - m.r - 14);
    }
  });
  // 弹道
  G.bullets.forEach(function (b) {
    if (b.kind === 'array') {
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = b.col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + (b.tx.x - b.x) * 0.6, b.y + (b.tx.y - b.y) * 0.6); ctx.stroke();
      ctx.fillStyle = b.col;
      ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
    }
  });
  // 特效
  G.fxs.forEach(function (f) {
    var p = f.t / f.dur;
    if (f.type === 'ring') {
      ctx.strokeStyle = f.col; ctx.globalAlpha = 1 - p; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(f.x, f.y, 10 + p * 26, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (f.type === 'boom') {
      ctx.fillStyle = f.col; ctx.globalAlpha = 0.8 * (1 - p);
      ctx.beginPath(); ctx.arc(f.x, f.y, 8 + p * 30, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (f.type === 'hit') {
      ctx.strokeStyle = f.col; ctx.globalAlpha = 1 - p; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, 3 + p * 8, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (f.type === 'bolt') {
      ctx.strokeStyle = '#74b9ff'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y - 30);
      ctx.lineTo(f.x - 6, f.y);
      ctx.lineTo(f.x + 4, f.y + 8);
      ctx.lineTo(f.x, f.y + 26);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(f.x, f.y, 8 * (1 - p), 0, Math.PI * 2); ctx.fill();
    } else if (f.type === 'snow') {
      ctx.strokeStyle = 'rgba(0,206,201,0.5)'; ctx.globalAlpha = 0.6;
      for (var i = 0; i < 8; i++) {
        var a = (i / 8) * Math.PI * 2 + f.t * 2;
        ctx.beginPath(); ctx.arc(CW / 2 + Math.cos(a) * 30, CH / 2 + Math.sin(a) * 30, 2 + Math.sin(f.t * 5 + i) * 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (f.type === 'flash') {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * (1 - p)) + ')';
      ctx.fillRect(0, 0, CW, CH);
    } else if (f.type === 'snowhit' || f.type === 'firehit') {
      ctx.fillStyle = f.type === 'snowhit' ? '#00cec9' : '#ff9f43';
      ctx.globalAlpha = 1 - p;
      for (var j = 0; j < 5; j++) {
        var a2 = j * 1.26 + f.t * 4;
        ctx.beginPath(); ctx.arc(f.x + Math.cos(a2) * 6 * p, f.y + Math.sin(a2) * 6 * p, 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (f.type === 'text') {
      ctx.fillStyle = f.col; ctx.globalAlpha = 1 - p; ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center'; ctx.fillText(f.text, f.x, f.y - p * 22);
      ctx.globalAlpha = 1;
    }
  });
  // 选中塔范围
  if (G.inspect) {
    var it = G.inspect;
    var icfg = TOWERS.find(function (x) { return x.id === it.id; });
    ctx.strokeStyle = 'rgba(108,92,231,0.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(it.x, it.y, icfg.rng * CELL * TOWER_UP.rng[it.lv], 0, Math.PI * 2); ctx.stroke();
  }
}
function drawSect(ctx, x, y) {
  // Q版宗门：红墙 + 金顶 + 门
  ctx.save();
  ctx.translate(x + CELL / 2, y + CELL / 2);
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(-18, -6, 36, 26);
  ctx.fillStyle = '#f1c40f';
  ctx.beginPath(); ctx.moveTo(-22, -6); ctx.lineTo(0, -20); ctx.lineTo(22, -6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2d1b0e';
  ctx.fillRect(-7, 6, 14, 14);
  ctx.fillStyle = '#ff6b81';
  ctx.fillRect(-4, 9, 8, 11);
  ctx.fillStyle = '#f1c40f';
  ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('宗门', 0, -28);
  ctx.restore();
}

/* ================= 主循环 ================= */
function loop(ts) {
  G.raf = requestAnimationFrame(loop);
  if (!G.lastTs) G.lastTs = ts;
  var raw = Math.min(0.05, (ts - G.lastTs) / 1000);
  G.lastTs = ts;
  if (!G.paused && G.running && G.waveState !== 'lose' && G.waveState !== 'win') {
    update(raw * G.speed);
  }
  render();
  // 云端续战：战斗进行中每 5 秒自动保存快照（本地 + 云端）
  if (G.lv && G.waveIdx >= 0 && G.waveState !== 'win' && G.waveState !== 'lose') {
    if (!G._autot || G._autot <= G.time) {
      G._autot = G.time + 5;
      snapshotRun();
      saveProgress();
    }
  }
}
function startLoop() { if (!G.raf) { G.lastTs = 0; G.raf = requestAnimationFrame(loop); } }

/* ================= 存档（本地 + 云端） ================= */
function saveKey() { var l = tdLname(); return l ? 'gh_td_save_' + l : 'gh_td_save_guest'; }
function saveLocal() {
  var k = saveKey(); if (!k) return;
  try { localStorage.setItem(k, JSON.stringify(SAVE)); } catch (e) {}
}
function loadLocal() {
  var k = saveKey(); if (!k) return;
  try {
    var raw = localStorage.getItem(k);
    if (raw) {
      var d = JSON.parse(raw);
      if (d && d.game === 'td') mergeSave(d);
    }
  } catch (e) {}
}
function mergeSave(d) {
  if (!d) return;
  if (Array.isArray(d.stars)) d.stars.forEach(function (v, i) { if (typeof v === 'number' && v > (SAVE.stars[i] || 0)) SAVE.stars[i] = v; });
  if (Array.isArray(d.bestWave)) d.bestWave.forEach(function (v, i) { if (typeof v === 'number' && v > (SAVE.bestWave[i] || 0)) SAVE.bestWave[i] = v; });
  if (Array.isArray(d.bestScore)) d.bestScore.forEach(function (v, i) { if (typeof v === 'number' && v > (SAVE.bestScore[i] || 0)) SAVE.bestScore[i] = v; });
  if (typeof d.coins === 'number' && d.coins > SAVE.coins) SAVE.coins = d.coins;
  if (typeof d.totalKills === 'number' && d.totalKills > SAVE.totalKills) SAVE.totalKills = d.totalKills;
  if (typeof d.unlocked === 'number' && d.unlocked > SAVE.unlocked) SAVE.unlocked = Math.min(d.unlocked, LEVELS.length);
  if (d.talents) Object.keys(d.talents).forEach(function (k) { if (typeof d.talents[k] === 'number' && d.talents[k] > (SAVE.talents[k] || 0)) SAVE.talents[k] = d.talents[k]; });
  // 续战快照：取"最新"（ts 最大），不做取大合并
  if (d.runs) Object.keys(d.runs).forEach(function (k) {
    if (d.runs[k] && (!SAVE.runs[k] || d.runs[k].ts > SAVE.runs[k].ts)) SAVE.runs[k] = d.runs[k];
  });
}
function snapshotRun() {
  if (!G.lv || G.waveIdx < 0 || G.waveState === 'win' || G.waveState === 'lose') return;
  SAVE.runs[G.lv.id] = {
    waveIdx: G.waveIdx, hp: G.hp, coins: G.coins, kills: G.kills,
    towers: G.towers.map(function (t) { return { id: t.id, gx: t.gx, gy: t.gy, lv: t.lv }; }),
    ts: Date.now()
  };
}
function clearRun(id) { if (id) delete SAVE.runs[id]; }
function hasRun(id) { return !!(SAVE.runs && SAVE.runs[id]); }
function restoreRun(id) {
  var r = SAVE.runs[id]; if (!r) return false;
  var lv = LEVELS.find(function (l) { return l.id === id; });
  if (!lv) return false;
  G.lv = lv;
  resetLevel();
  G.waveIdx = r.waveIdx;
  G.hp = r.hp; G.coins = r.coins; G.kills = r.kills;
  (r.towers || []).forEach(function (t) {
    var c = px(t.gx, t.gy);
    var cfg = TOWERS.find(function (x) { return x.id === t.id; });
    if (cfg) G.towers.push({ id: t.id, gx: t.gx, gy: t.gy, x: c.x, y: c.y, lv: t.lv || 1, cd: 0, target: null, dead: false });
  });
  G.waveState = 'idle'; // 恢复为波间待命，由玩家点击"开始下一波"继续
  G.running = false;
  showHud();
  tdToast('已恢复进度：第 ' + (r.waveIdx + 1) + ' 波 · 阵法 ' + (r.towers || []).length + ' 座');
  return true;
}
function saveProgress() { saveLocal(); cloudSave(); }
/* 登录后：把未登录期间的本机访客存档并入账号，并拉取云端（账号优先保留最强值） */
function mergeGuest() {
  try {
    var g = localStorage.getItem('gh_td_save_guest');
    if (g) {
      var d = JSON.parse(g);
      if (d && d.game === 'td') {
        mergeSave(d);
        saveLocal();
      }
      localStorage.removeItem('gh_td_save_guest');
    }
    cloudSave();
    cloudLoad(function () { saveLocal(); if (G.view) updateHud(); });
  } catch (e) {}
}
function tdSaveToken() { try { return localStorage.getItem('gh_td_token_' + tdLname()) || ''; } catch (e) { return ''; } }
function tdSetSaveToken(t) { try { if (t) localStorage.setItem('gh_td_token_' + tdLname(), t); } catch (e) {} }
function cloudSave() {
  if (!tdLname() || typeof supabaseRpc === 'undefined') return;
  try {
    var payload = JSON.parse(JSON.stringify(SAVE));
    supabaseRpc('save_game', { p_user_name: 'td_' + tdLname(), p_token: tdSaveToken(), p_save_data: payload })
      .then(function (r) { if (r && r.token) tdSetSaveToken(r.token); })
      .catch(function () {});
  } catch (e) {}
}
function cloudLoad(cb) {
  if (!tdLname() || typeof supabaseRest === 'undefined') { if (cb) cb(); return; }
  supabaseRest('GET', 'game_saves', 'user_name=eq.' + encodeURIComponent('td_' + tdLname()) + '&limit=1')
    .then(function (rows) {
      if (rows && rows[0] && rows[0].save_data) {
        var d = rows[0].save_data;
        if (d && d.game === 'td') mergeSave(d);
        saveLocal();
      }
      if (cb) cb();
    })
    .catch(function () { if (cb) cb(); });
}

/* ================= 排行榜 ================= */
function openRank() {
  SFX.click();
  var m = showModal('tdRankModal');
  if (!tdLname()) {
    m.innerHTML = '<h3>🏆 护宗全服榜</h3><div class="sub">需要先登录账号，才能查看和使用云端排行榜</div>';
    return;
  }
  m.innerHTML = '<h3>🏆 护宗全服榜</h3><div class="sub">按总分排名（每关得分 = 击杀×10 + 波数×50 + 星级×150）</div><div style="max-height:46vh;overflow-y:auto;" id="tdRankList"><div class="sub">加载中…</div></div>';
  var list = m.querySelector('#tdRankList');
  var meL = 'td_' + tdLname();
  if (typeof supabaseRest === 'undefined') { list.innerHTML = '<div class="sub">云端不可用，无法加载排行榜</div>'; return; }
  supabaseRest('GET', 'game_saves', 'select=user_name,save_data&limit=1000')
    .then(function (rows) {
      var recs = [];
      (rows || []).forEach(function (r) {
        if (!r.user_name || r.user_name.indexOf('td_') !== 0) return;
        var d = r.save_data;
        if (!d || d.game !== 'td') return;
        var stars = Array.isArray(d.stars) ? d.stars.reduce(function (a, b) { return a + (b || 0); }, 0) : 0;
        var score = Array.isArray(d.bestScore) ? d.bestScore.reduce(function (a, b) { return a + (b || 0); }, 0) : 0;
        var wave = Array.isArray(d.bestWave) ? Math.max.apply(null, d.bestWave) : 0;
        recs.push({ name: r.user_name.slice(3), score: score, stars: stars, wave: wave, me: r.user_name === meL });
      });
      recs.sort(function (a, b) { return b.score - a.score; });
      if (!recs.length) { list.innerHTML = '<div class="sub">还没有人上榜，快来抢占第一！</div>'; return; }
      var html = '<div class="td-rank-row head"><span class="r-n">#</span><span class="r-u">玩家</span><span class="r-s">总分</span><span style="min-width:80px;text-align:right;">⭐/最高波</span></div>';
      recs.slice(0, 20).forEach(function (r, i) {
        var medal = i < 3 ? ['🥇', '🥈', '🥉'][i] : (i + 1);
        html += '<div class="td-rank-row' + (r.me ? ' me' : '') + '"><span class="r-n">' + medal + '</span><span class="r-u">' + esc(r.name) + (r.me ? '（我）' : '') + '</span><span class="r-s">' + tdfmt(r.score) + '</span><span style="min-width:80px;text-align:right;color:#8a8fa3;">' + r.stars + ' ⭐ / ' + r.wave + ' 波</span></div>';
      });
      list.innerHTML = html;
    })
    .catch(function () { list.innerHTML = '<div class="sub">排行榜加载失败，请检查网络</div>'; });
}

/* ================= Modal 工具 ================= */
function showModal(id) {
  var stage = document.querySelector('#tdView .td-stage');
  var old = document.getElementById(id);
  if (old) old.parentNode.removeChild(old);
  var m = document.createElement('div');
  m.id = id; m.className = 'td-modal show';
  var box = document.createElement('div'); box.className = 'box';
  m.appendChild(box);
  m.addEventListener('click', function (e) { if (e.target === m) closeModal(id); });
  stage.appendChild(m);
  return box;
}
function closeModal(id) {
  var m = document.getElementById(id);
  if (m) m.parentNode.removeChild(m);
}

/* ================= Overlay（初始/准备/结算/失败） ================= */
function showCanvasOverlay(mode) {
  var ov = document.getElementById('tdOverlay');
  if (!ov) return;
  ov.style.display = 'flex';
  var html = '';
  if (mode === 'menu') {
    html =
      '<h2>🏯 修仙护宗塔防</h2>' +
      '<div class="sub">妖怪攻山，布阵守护宗门！点击进入关卡，在路边布下法宝阵法。</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">' +
      '<button class="td-btn" id="tdBtnLv">🗺 选择关卡</button>' +
      '<button class="td-btn ghost" id="tdBtnRank">🏆 全服排行</button>' +
      '<button class="td-btn ghost" id="tdBtnTalent">📜 天赋研究</button>' +
      '</div>' +
      '<div class="sub" style="margin-top:8px;color:var(--td-gold);">灵石 <b id="tdMenuCoins">' + tdfmt(SAVE.coins) + '</b> · 总击杀 <b>' + tdfmt(SAVE.totalKills) + '</b> · 星级 <b>' + starsTotal() + '</b>/9</div>';
  } else if (mode === 'levelReady') {
    html =
      '<h2>' + esc(G.lv.name) + '</h2>' +
      '<div class="sub">' + esc(G.lv.desc) + ' · 共 ' + G.lv.waves.length + ' 波 · 护山大阵耐久 ' + G.lv.hp + '</div>' +
      '<div class="sub" style="color:var(--td-gold);">当前灵石 ' + tdfmt(G.coins) + '（含聚灵阵加成）——先布阵，再开战！</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">' +
      '<button class="td-btn" id="tdBtnStart">⚔ 开始第 1 波</button>' +
      '<button class="td-btn ghost" id="tdBtnBack">返回选关</button>' +
      '</div>';
  } else if (mode === 'result') {
    var starsStr = '';
    for (var i = 0; i < 3; i++) starsStr += (i < G.resultStars ? '⭐' : '☆');
    html =
      '<h2>🎉 守山成功！</h2>' +
      '<div style="font-size:30px;margin:6px 0;">' + starsStr + '</div>' +
      '<div class="sub">击退 ' + G.resultWave + ' 波 · 击杀 ' + G.kills + ' · 得分 <b style="color:var(--td-gold);">' + tdfmt(G.resultScore) + '</b></div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">' +
      (G.lv.id < LEVELS.length ? '<button class="td-btn" id="tdBtnNext">下一关 ➡</button>' : '<button class="td-btn" id="tdBtnNext">全部通关！再来一次</button>') +
      '<button class="td-btn ghost" id="tdBtnRetry">重玩本关</button>' +
      '<button class="td-btn ghost" id="tdBtnMenu">选关</button>' +
      '</div>';
  } else if (mode === 'lose') {
    html =
      '<h2>💔 宗门失守…</h2>' +
      '<div class="sub">护山大阵被攻破，练好阵法再来！已击退 ' + G.waveCleared + '/' + G.lv.waves.length + ' 波</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">' +
      '<button class="td-btn" id="tdBtnRetry">重试本关</button>' +
      '<button class="td-btn ghost" id="tdBtnMenu">返回选关</button>' +
      '</div>';
  }
  ov.innerHTML = html;
  G.overlayMode = mode;
  bindOverlay(mode);
  updateHud();
}
function bindOverlay(mode) {
  var q = function (id) { var el = document.getElementById(id); return el; };
  if (mode === 'menu') {
    var b1 = q('tdBtnLv'); if (b1) b1.onclick = function () { SFX.click(); openLevelSelect(); };
    var b2 = q('tdBtnRank'); if (b2) b2.onclick = function () { openRank(); };
    var b3 = q('tdBtnTalent'); if (b3) b3.onclick = function () { openTalents(); };
  } else if (mode === 'levelReady') {
    var b4 = q('tdBtnStart'); if (b4) b4.onclick = function () { SFX.click(); hideOverlay(); startWave(); };
    var b5 = q('tdBtnBack'); if (b5) b5.onclick = function () { SFX.click(); openLevelSelect(); };
  } else if (mode === 'result') {
    var b6 = q('tdBtnNext'); if (b6) b6.onclick = function () { SFX.click(); if (G.lv.id < LEVELS.length) startLevel(G.lv.id + 1); else startLevel(1); };
    var b7 = q('tdBtnRetry'); if (b7) b7.onclick = function () { SFX.click(); startLevel(G.lv.id); };
    var b8 = q('tdBtnMenu'); if (b8) b8.onclick = function () { SFX.click(); showCanvasOverlay('menu'); };
  } else if (mode === 'lose') {
    var b9 = q('tdBtnRetry'); if (b9) b9.onclick = function () { SFX.click(); startLevel(G.lv.id); };
    var b10 = q('tdBtnMenu'); if (b10) b10.onclick = function () { SFX.click(); showCanvasOverlay('menu'); };
  }
}
function hideOverlay() {
  var ov = document.getElementById('tdOverlay');
  if (ov) ov.style.display = 'none';
  G.overlayMode = null;
}

/* ================= 关卡选择 ================= */
function starsTotal() { return SAVE.stars.reduce(function (a, b) { return a + (b || 0); }, 0); }
function openLevelSelect() {
  SFX.click();
  var m = showModal('tdLvModal');
  m.innerHTML = '<h3>🗺 选择关卡</h3><div class="sub">通关解锁下一关 · 按剩余耐久评星（≥70% 三星 / ≥40% 两星 / 通关一星）</div><div class="td-lv-grid">' +
    LEVELS.map(function (l, i) {
      var locked = l.id > SAVE.unlocked;
      var stars = '';
      var cont = hasRun(l.id) ? ' · ▶ 续战第 ' + (SAVE.runs[l.id].waveIdx + 1) + ' 波' : '';
      for (var s = 0; s < 3; s++) stars += (s < (SAVE.stars[i] || 0) ? '⭐' : '☆');
      return '<div class="td-lv-card' + (locked ? ' lock' : '') + '" data-lv="' + l.id + '">' +
        '<div class="lv-name">' + (locked ? '🔒 ' : '') + esc(l.name) + '</div>' +
        '<div class="lv-meta">' + esc(l.desc) + '</div>' +
        '<div class="lv-meta">共 ' + l.waves.length + ' 波 · 最高波次 ' + (SAVE.bestWave[i] || 0) + cont + '</div>' +
        '<div class="stars">' + stars + '</div></div>';
    }).join('') +
    '</div>';
  m.querySelectorAll('.td-lv-card').forEach(function (card) {
    card.addEventListener('click', function () {
      if (card.classList.contains('lock')) { tdToast('请先通关上一关'); SFX.error(); return; }
      closeModal('tdLvModal');
      startLevel(Number(card.getAttribute('data-lv')));
    });
  });
}

/* ================= 天赋研究 ================= */
function openTalents() {
  SFX.click();
  var m = showModal('tdTalentModal');
  m.innerHTML = '<h3>📜 天赋研究</h3><div class="sub">消耗灵石永久强化，全关卡生效 · 灵石 <b style="color:var(--td-gold);">' + tdfmt(SAVE.coins) + '</b></div><div id="tdTalentList"></div>';
  renderTalents(m);
}
function renderTalents(m) {
  var list = m.querySelector('#tdTalentList');
  list.innerHTML = TALENTS.map(function (t) {
    var lv = talentLv(t.id);
    var maxed = lv >= t.max;
    var cost = maxed ? 0 : t.cost[lv + 1];
    var can = !maxed && SAVE.coins >= cost;
    return '<div class="td-talent">' +
      '<div style="flex:1;"><div class="t-name">' + t.ic + ' ' + esc(t.name) + '</div><div class="t-desc">' + esc(t.desc) + '</div></div>' +
      '<div class="t-lv">' + lv + '/' + t.max + '</div>' +
      '<button class="td-btn' + (maxed ? ' ghost' : '') + '" style="padding:6px 12px;font-size:12px;' + (can ? '' : 'opacity:.45;') + '" data-tid="' + t.id + '"' + (maxed ? ' disabled' : '') + '>' + (maxed ? '已满级' : '升级 ' + tdfmt(cost)) + '</button>' +
      '</div>';
  }).join('');
  list.querySelectorAll('button[data-tid]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var t = TALENTS.find(function (x) { return x.id === btn.getAttribute('data-tid'); });
      var lv = talentLv(t.id);
      if (lv >= t.max) return;
      var cost = t.cost[lv + 1];
      if (SAVE.coins < cost) { tdToast('灵石不足'); SFX.error(); return; }
      SAVE.coins -= cost;
      SAVE.talents[t.id] = lv + 1;
      SFX.upgrade();
      tdToast('「' + t.name + '」升至 ' + (lv + 1) + ' 级');
      saveLocal(); cloudSave();
      var cur = document.getElementById('tdTalentModal');
      if (cur) renderTalents(cur);
      var menuCoins = document.getElementById('tdMenuCoins');
      if (menuCoins) menuCoins.textContent = tdfmt(SAVE.coins);
    });
  });
}

/* ================= HUD / 塔栏 / 道具栏 ================= */
function showHud() {
  var hud = document.getElementById('tdHud');
  hud.style.display = 'flex';
  document.getElementById('tdLvName').textContent = esc(G.lv.name);
  updateHud();
  renderBar();
}
function updateHud() {
  var w = G.waveIdx + 1;
  var el = document.getElementById('tdWave');
  if (el) el.textContent = G.lv ? ((G.waveState === 'idle' && G.waveIdx < 0 ? 0 : Math.min(w, G.lv.waves.length)) + '/' + G.lv.waves.length) : '—';
  var hp = document.getElementById('tdHp');
  if (hp) { hp.textContent = G.lv ? G.hp : '—'; hp.style.color = G.lv && G.hp <= 3 ? '#ff6b81' : '#00b894'; }
  var c = document.getElementById('tdCoins');
  if (c) c.textContent = tdfmt(G.coins);
  var k = document.getElementById('tdKills');
  if (k) k.textContent = tdfmt(G.kills);
  var sb = document.getElementById('tdSpeedBtn');
  if (sb) sb.textContent = G.speed + 'x';
  var pb = document.getElementById('tdPauseBtn');
  if (pb) pb.textContent = G.paused ? '▶' : '⏸';
  var nb = document.getElementById('tdNextWaveBtn');
  if (nb) {
    var show = G.lv && G.waveState === 'idle' && G.waveIdx >= 0 && !G.paused && !G.inspect;
    nb.style.display = show ? 'inline-block' : 'none';
    if (show) nb.textContent = G.waveIdx >= G.lv.waves.length - 1 ? '⚔ 重打第 ' + (G.waveIdx + 1) + ' 波' : '⚔ 开始第 ' + (G.waveIdx + 2) + ' 波';
  }
  renderBar();
}
function renderBar() {
  var bar = document.getElementById('tdBar');
  if (!bar) return;
  bar.innerHTML = TOWERS.map(function (t) {
    var can = G.coins >= t.cost;
    return '<div class="td-tower' + (G.placing === t.id ? ' sel' : '') + (can ? '' : ' off') + '" data-tid="' + t.id + '" title="' + esc(t.desc) + '">' +
      '<div class="ic">' + t.ic + '</div><div class="nm">' + esc(t.name) + '</div><div class="cs">💎' + t.cost + '</div><div class="tg">' + esc(t.desc) + '</div></div>';
  }).join('');
  bar.querySelectorAll('.td-tower').forEach(function (el) {
    el.addEventListener('click', function () {
      var id = el.getAttribute('data-tid');
      if (G.coins < TOWERS.find(function (t) { return t.id === id; }).cost) { tdToast('灵石不足'); SFX.error(); return; }
      if (G.placing === id) { G.placing = null; } else { G.placing = id; }
      SFX.click();
      renderBar();
    });
  });
  var items = document.getElementById('tdItems');
  if (!items) return;
  items.innerHTML = ITEMS.map(function (it) {
    var can = G.coins >= it.cost;
    return '<div class="td-tower' + (can ? '' : ' off') + '" data-iid="' + it.id + '" title="' + esc(it.desc) + '">' +
      '<div class="ic">' + it.ic + '</div><div class="nm">' + esc(it.name) + '</div><div class="cs">💎' + it.cost + '</div><div class="tg">' + esc(it.desc) + '</div></div>';
  }).join('');
  items.querySelectorAll('.td-tower').forEach(function (el) {
    el.addEventListener('click', function () { useItem(el.getAttribute('data-iid')); });
  });
}

/* ================= 塔检查面板 ================= */
function renderInspect() {
  var box = document.getElementById('tdInspect');
  if (!G.inspect) { box.style.display = 'none'; return; }
  var t = G.inspect, cfg = TOWERS.find(function (x) { return x.id === t.id; });
  var upCost = t.lv < 3 ? UP_COST[t.lv + 1] : 0;
  box.style.display = 'block';
  var scale = canvasScale();
  box.style.left = Math.min(t.x * scale + 12, (G.canvas.parentElement.clientWidth - 170)) + 'px';
  box.style.top = Math.max(4, t.y * scale - 40) + 'px';
  box.innerHTML =
    '<div class="i-t">' + cfg.ic + ' ' + esc(cfg.name) + ' Lv.' + t.lv + '</div>' +
    '<div class="i-row"><span>伤害</span><span>' + tdfmt(towerDmg(t)) + '</span></div>' +
    '<div class="i-row"><span>攻速</span><span>' + (1 / towerRate(t)).toFixed(2) + '/秒</span></div>' +
    '<div class="i-row"><span>射程</span><span>' + (cfg.rng * TOWER_UP.rng[t.lv]).toFixed(1) + ' 格</span></div>' +
    (t.lv < 3 ? '<div style="margin-top:8px;"><button class="i-btn" id="tdBtnUp">升级 💎' + upCost + '</button></div>' : '<div style="margin-top:8px;color:#8a8fa3;font-size:11px;">已满级</div>') +
    '<div style="margin-top:6px;"><button class="i-btn sell" id="tdBtnSell">出售 💎' + tdfmt(Math.floor((cfg.cost + (t.lv > 1 ? UP_COST[2] : 0) + (t.lv > 2 ? UP_COST[3] : 0)) * SELL_RATE)) + '</button></div>';
  var bu = document.getElementById('tdBtnUp');
  if (bu) bu.onclick = function () { upgradeTower(t); };
  var bs = document.getElementById('tdBtnSell');
  if (bs) bs.onclick = function () { sellTower(t); };
}
function canvasScale() {
  var c = G.canvas;
  return c.clientWidth / c.width;
}

/* ================= 事件绑定 ================= */
function bindEvents() {
  var c = G.canvas;
  var stage = c.parentElement;
  c.addEventListener('click', function (e) {
    if (G.waveState === 'win' || G.waveState === 'lose' || !G.lv) return;
    var rect = c.getBoundingClientRect();
    var x = (e.clientX - rect.left) / rect.width * CW;
    var y = (e.clientY - rect.top) / rect.height * CH;
    var cc = cellOf(x, y);
    if (G.placing) {
      if (cc.gx >= 0 && cc.gx < COLS && cc.gy >= 0 && cc.gy < ROWS) placeTower(G.placing, cc.gx, cc.gy);
      return;
    }
    var t = G.towers.find(function (tw) { return tw.gx === cc.gx && tw.gy === cc.gy; });
    if (t) { G.inspect = t; renderInspect(); }
    else { G.inspect = null; var ib = document.getElementById('tdInspect'); if (ib) ib.style.display = 'none'; }
  });
  c.addEventListener('mousemove', function (e) {
    var rect = c.getBoundingClientRect();
    var x = (e.clientX - rect.left) / rect.width * CW;
    var y = (e.clientY - rect.top) / rect.height * CH;
    var cc = cellOf(x, y);
    G.mouse.x = x; G.mouse.y = y; G.mouse.gx = cc.gx; G.mouse.gy = cc.gy;
  });
  c.addEventListener('mouseleave', function () { G.mouse.gx = -1; G.mouse.gy = -1; });
  var sp = document.getElementById('tdSpeedBtn');
  sp.addEventListener('click', function () { G.speed = G.speed === 1 ? 2 : G.speed === 2 ? 3 : 1; SFX.click(); updateHud(); });
  var pa = document.getElementById('tdPauseBtn');
  pa.addEventListener('click', function () { G.paused = !G.paused; SFX.click(); updateHud(); });
  var fu = document.getElementById('tdFullBtn');
  fu.addEventListener('click', function () {
    SFX.click();
    var el = document.getElementById('tdView') || stage;
    try {
      if (document.fullscreenElement) { document.exitFullscreen(); }
      else if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else tdToast('当前浏览器不支持全屏');
    } catch (err) { tdToast('全屏失败'); }
  });
  var rk = document.getElementById('tdRankBtn');
  rk.addEventListener('click', function () { openRank(); });
  var tl = document.getElementById('tdTalentBtn');
  tl.addEventListener('click', function () { openTalents(); });
  var ex = document.getElementById('tdExitBtn');
  ex.addEventListener('click', function () {
    // 退出前保存进度（本地 + 云端），之后可"继续上次战斗"
    if (G.lv && G.waveIdx >= 0 && G.waveState !== 'win' && G.waveState !== 'lose') {
      snapshotRun();
      saveProgress();
      tdToast('进度已云端保存，随时可继续');
    }
    SFX.click();
    G.running = false; G.paused = false; G.lv = null;
    showCanvasOverlay('menu');
  });
  var nw = document.getElementById('tdNextWaveBtn');
  nw.addEventListener('click', function () { SFX.click(); startWave(); });
}

/* ================= 挂载与启动 ================= */
function mount() {
  var host = document.getElementById('tdView');
  if (!host) return false;
  if (host.getAttribute('data-td-mounted')) return true;
  host.setAttribute('data-td-mounted', '1');
  host.innerHTML =
    '<div class="td-wrap">' +
      '<div class="td-hud" id="tdHud" style="display:none;">' +
        '<span class="hud-item">🗺 <b id="tdLvName">—</b></span>' +
        '<span class="hud-item">🌊 波次 <b id="tdWave" style="color:#74b9ff;">0/0</b></span>' +
        '<span class="hud-item">🏯 耐久 <b id="tdHp">—</b></span>' +
        '<span class="hud-item">💎 <b id="tdCoins">0</b></span>' +
        '<span class="hud-item">⚔ <b id="tdKills">0</b></span>' +
        '<button class="hud-btn" id="tdSpeedBtn">1x</button>' +
        '<button class="hud-btn" id="tdPauseBtn">⏸</button>' +
        '<button class="hud-btn" id="tdFullBtn">⛶ 全屏</button>' +
        '<button class="hud-btn" id="tdRankBtn">🏆 排行</button>' +
        '<button class="hud-btn" id="tdTalentBtn">📜 天赋</button>' +
        '<button class="hud-btn" id="tdExitBtn">退出</button>' +
      '</div>' +
      '<div class="td-stage">' +
        '<canvas id="tdCanvas" width="768" height="512"></canvas>' +
        '<div class="td-overlay" id="tdOverlay" style="display:none;"></div>' +
        '<div class="td-inspect" id="tdInspect" style="display:none;"></div>' +
        '<button class="td-btn" id="tdNextWaveBtn" style="position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:4;display:none;padding:8px 18px;font-size:13px;">⚔ 开始下一波</button>' +
      '</div>' +
      '<div class="td-bar" id="tdBar"></div>' +
      '<div class="td-bar" id="tdItems"></div>' +
    '</div>';
  G.view = host;
  G.canvas = document.getElementById('tdCanvas');
  G.ctx = G.canvas.getContext('2d');
  loadLocal();
  // 先显示主菜单，云端数据后台合并（避免网络慢时白屏）
  showCanvasOverlay('menu');
  updateHud();
  cloudLoad(function () { updateHud(); });
  bindEvents();
  startLoop();
  return true;
}

window.TDGame = {
  start: function () {
    if (mount()) {
      SFX.click();
      // 每次进入游戏都重新拉取云端进度（登录状态可能已变化）
      loadLocal();
      cloudLoad(function () { saveLocal(); if (G.view) updateHud(); });
    }
    return !!G.view;
  },
  mounted: function () { return !!document.getElementById('tdView') && document.getElementById('tdView').getAttribute('data-td-mounted'); },
  /* 登录/切换账号成功后调用：访客本地进度并入账号 + 云端拉取 */
  onLogin: function () { mergeGuest(); }
};

/* 关闭页面/刷新前保存进行中的快照（本地即时写入；云端靠 5 秒自动保存兜底） */
window.addEventListener('beforeunload', function () {
  snapshotRun();
  saveLocal();
});

/* 自动挂载（页面已含 #tdView 时直接初始化，显示与否由主页面控制） */
if (document.getElementById('tdView')) { mount(); }
})();
