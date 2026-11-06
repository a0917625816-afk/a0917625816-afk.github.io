// 策略實驗室 第十五輪：實驗一 S2 流動性掃盪回收（4h 多方）；實驗二 空頭反彈到壓力再空（BTC 跌破 EMA50 時）。
// 資料載入、濾網、分級成本沿用第八／十四輪；過擬合審查（主要參數上下 20%）與 0.40% 成本壓力測試放在同一支腳本，不佔實驗名額。
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { ema, sma, atr } from "../scripts/ta-core.mjs";

let SPLIT = 0.65, N_COINS = +(process.env.N_COINS || 40), MONTHS = +(process.env.MONTHS || 30);
const M15 = 9e5, H4 = 144e5, D1 = 864e5, H1 = 36e5;
const EXCLUDE = new Set("MU MUU SKHYNIX TSM SOXL SNDK SNXX QQQ SPY NVDA TSLA AAPL AMZN META GOOGL MSFT COIN MSTR HOOD XAU XAG WDC AMD INTC CRCL PAXG XAUT USDC FDUSD USDE".split(" "));

async function binance15(base) {
  const sym = base + "USDT", out = [], now = new Date();
  for (let k = MONTHS; k >= 1; k--) {
    const ym = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1)).toISOString().slice(0, 7);
    const r = await fetch(`https://data.binance.vision/data/futures/um/monthly/klines/${sym}/15m/${sym}-15m-${ym}.zip`);
    if (r.status === 404) continue; if (!r.ok) throw new Error("HTTP " + r.status);
    const f = `/tmp/k-${sym}.zip`; await fs.writeFile(f, Buffer.from(await r.arrayBuffer()));
    const csv = execFileSync("unzip", ["-p", f], { maxBuffer: 1 << 28 }).toString();
    for (const line of csv.split("\n")) { const x = line.split(","); if (x.length < 6 || isNaN(+x[0])) continue; out.push({ t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] }); }
  }
  return out;
}
function agg(m, dt) { const out = []; let cur = null; for (const b of m) { const t = Math.floor(b.t / dt) * dt; if (!cur || cur.t !== t) { cur = { ...b, t }; out.push(cur); } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; } } return out; }
function mock(base) { let s = [...base].reduce((x, c) => x + c.charCodeAt(0), 7) * 13; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; const n = MONTHS * 30 * 96, out = []; let p = 100; const t0 = Math.floor(Date.now() / D1) * D1 - n * M15; for (let i = 0; i < n; i++) { const sg = 0.004, o = p, c = o * (1 + (rnd() - 0.5) * 2 * sg + Math.sin(i / 900 + s % 7) * sg * 0.15); out.push({ t: t0 + i * M15, o, h: Math.max(o, c) * (1 + rnd() * sg * 0.5), l: Math.min(o, c) * (1 - rnd() * sg * 0.5), c, v: 1000 * (1 + rnd()) }); p = c; } return out; }

const data = {};
const bx = JSON.parse(await fs.readFile("bingx.json", "utf8"));
const cands = process.env.MOCK ? ["BTC", "ETH", "SOL", "XRP"].slice(0, N_COINS).map(base => ({ base })) : [{ base: "BTC" }, ...bx.symbols.filter(x => x.base !== "BTC" && !EXCLUDE.has(x.base) && !/NCCO|USD$|^\d/.test(x.base)).sort((a, b) => b.qv - a.qv)];
for (const s of cands) {
  if (Object.keys(data).length >= N_COINS) break;
  try { const m = process.env.MOCK ? mock(s.base) : await binance15(s.base); console.log(s.base, m.length); if (m.length < 35000) continue; data[s.base] = { m, h: agg(m, H4), d: agg(m, D1) }; } catch (e) { console.log("失敗", s.base, e.message); }
}
const coins = Object.keys(data); console.log("幣種", coins.length);

// 濾網
const dk = t => Math.floor(t / D1);
const bD = data.BTC.d, bE = ema(bD.map(x => x.c), 50), btcUp = new Map(); bD.forEach((b, i) => btcUp.set(dk(b.t), b.c > bE[i]));
const dc = {}; coins.forEach(cn => { const m = new Map(); data[cn].d.forEach(b => m.set(dk(b.t), b.c)); dc[cn] = m; });
const rk = new Map();
function top(day) { if (rk.has(day)) return rk.get(day); const sc = []; for (const cn of coins) { const a = dc[cn].get(day), b = dc[cn].get(day - 20); if (a && b) sc.push([cn, a / b - 1]); } sc.sort((x, y) => y[1] - x[1]); const s = new Set(sc.slice(0, 10).filter(x => x[1] > 0).map(x => x[0])); rk.set(day, s); return s; }
const okF = (cn, t) => btcUp.get(dk(t) - 1) === true && top(dk(t) - 1).has(cn);

// 指標預先算好（4h）
const pre = {};
for (const cn of coins) { const c = data[cn].h; pre[cn] = { c, a: atr(c, 14), e50: ema(c.map(x => x.c), 50), e200: ema(c.map(x => x.c), 200) }; }

// 近30天日均成交額（USDT），以前一天為準
const LIQ = {}; for (const cn of coins) { const d = data[cn].d, m = new Map(); let s = 0; const q = d.map(b => b.c * b.v); for (let i = 0; i < d.length; i++) { s += q[i]; if (i >= 30) s -= q[i - 30]; if (i >= 29) m.set(dk(d[i].t), s / 30); } LIQ[cn] = m; }
const TIERS = [[2000e6, 0.0014], [500e6, 0.0025], [100e6, 0.0040], [0, 0.0070]];
function tieredCost(cn, t) { const v = LIQ[cn].get(dk(t) - 1); if (!(v >= 0)) return 0.0040; for (const [th, c] of TIERS) if (v >= th) return c; return 0.0070; }
const flat40 = () => 0.004;
const liqOk = (cn, t, min) => !min || (LIQ[cn].get(dk(t) - 1) >= min);
const LIQMIN = process.env.MOCK ? 0 : 100e6; // 實驗二的成交額門檻（MOCK 假資料成交額太小，本機試跑時不套）

// ---- 基準：波段A（分級成本），新策略的勝率／回撤要跟它比 ----
function swingA(cn, costFn) {
  const P = pre[cn], c = P.c, a = P.a, out = []; let pos = null; const N = 55, M = 27;
  for (let i = Math.max(N, 210); i < c.length - 1; i++) {
    const b = c[i];
    if (pos) { let ex = null; if (b.l <= pos.st) ex = Math.min(b.o, pos.st); else { let lo = Infinity; for (let j = i - M; j < i; j++) lo = Math.min(lo, c[j].l); if (b.c < lo) ex = b.c; }
      if (ex != null) { out.push({ cn, t: pos.t, tx: b.t + H4, R: (ex - pos.e) / pos.r - costFn(cn, pos.t) * pos.e / pos.r }); pos = null; } continue; }
    let hi = -Infinity; for (let j = i - N; j < i; j++) hi = Math.max(hi, c[j].h);
    if (!(b.c > hi) || !(b.c > P.e200[i])) continue;
    const t = c[i + 1].t; if (!okF(cn, t)) continue;
    const e = c[i + 1].o, r = 2 * a[i]; if (!(r > 0)) continue;
    pos = { e, r, st: e - r, t };
  }
  return out;
}

// ===================== 實驗一：S2 流動性掃盪回收（CTM 課程，4h 多方）=====================
// 佇列定義（照抄，不改）：4h K棒下影刺破前 20 根低點 ≥0.1ATR 且收回低點之上，次根開盤進場；停損為掃盪低點 −0.2ATR；目標為前 20 根高點，若報酬風險比 <1.5 則略過。
// 定義沒寫的部分：沒有 BTC 濾網、沒有成交額門檻、沒有時間停損（基準照定義；這三項各做一個變體當參考與審查）。
function s2Trades(cn, p, costFn) {
  const P = pre[cn], c = P.c, a = P.a, out = []; let pos = null;
  for (let i = Math.max(p.N, 210); i < c.length - 1; i++) {
    const b = c[i];
    if (pos) {
      let ex = null;
      if (b.l <= pos.st) ex = Math.min(b.o, pos.st);
      else if (b.h >= pos.tp) ex = Math.max(b.o, pos.tp);
      else if (p.T && i - pos.i >= p.T) ex = b.c;
      if (ex != null) { out.push({ cn, t: pos.t, tx: b.t + H4, R: (ex - pos.e) / pos.r - costFn(cn, pos.t) * pos.e / pos.r }); pos = null; }
      continue;
    }
    let lo = Infinity, hi = -Infinity; for (let j = i - p.N; j < i; j++) { lo = Math.min(lo, c[j].l); hi = Math.max(hi, c[j].h); }
    if (!(a[i] > 0) || !(b.l <= lo - p.pierce * a[i]) || !(b.c > lo)) continue;
    const t = c[i + 1].t;
    if (p.btc && btcUp.get(dk(t) - 1) !== true) continue;
    if (!liqOk(cn, t, p.liq)) continue;
    const e = c[i + 1].o, st = b.l - 0.2 * a[i], r = e - st; if (!(r > 0)) continue;
    if ((hi - e) / r < p.rr) continue;
    pos = { e, r, st, tp: hi, t, i: i + 1 };
  }
  return out;
}

// ===================== 實驗二：空頭反彈到壓力再空（做空研究員 11/06 定義，對應劇本單賺錢的 P7／P0 空單）=====================
// 啟動：BTC 日線前一天收盤 < EMA50。幣種：近 30 天日均成交額 ≥1 億U。結構：4h 收盤 < 4h EMA200。
// 反彈K：最高價觸及 4h EMA50 −0.3ATR 以上、收盤仍 < EMA50、收在本身區間下半（收盤強度 ≤0.4），且前 12 根內曾有收盤 < EMA50 −2ATR（確認是反彈不是黏著均線橫盤）。次根開盤做空。
// 停損＝反彈K高點 ＋0.3ATR（距離至少 1ATR）；目標＝前 20 根最低點，R:R <1.5 略過；失效＝4h 收盤站上 EMA50 ＋0.5ATR；時間停損 20 根 4h。B 版：1R 先平 1/3、停損移到成本。
function rallyShort(cn, p, costFn) {
  const P = pre[cn], c = P.c, a = P.a, e50 = P.e50, out = []; let pos = null;
  for (let i = 210; i < c.length - 1; i++) {
    const b = c[i];
    if (pos) {
      let ex = null, left = pos.took ? 2 / 3 : 1;
      if (b.h >= pos.st) ex = Math.max(b.o, pos.st);
      else {
        if (p.partial && !pos.took && b.l <= pos.e - pos.r) { pos.took = true; pos.real += 1 / 3; pos.st = Math.min(pos.st, pos.e - 0.05 * pos.r); left = 2 / 3; }
        if (b.l <= pos.tp) ex = Math.min(b.o, pos.tp);
        else if (b.c > e50[i] + 0.5 * a[i]) ex = b.c;
        else if (i - pos.i >= p.T) ex = b.c;
      }
      if (ex != null) { out.push({ cn, t: pos.t, tx: b.t + H4, R: pos.real + left * (pos.e - ex) / pos.r - costFn(cn, pos.t) * pos.e / pos.r }); pos = null; }
      continue;
    }
    const t = c[i + 1].t;
    if (btcUp.get(dk(t) - 1) !== false) continue;
    if (!liqOk(cn, t, LIQMIN)) continue;
    if (!(a[i] > 0) || !(b.c < P.e200[i])) continue;
    const E = p.emaN === 50 ? e50[i] : P["e" + p.emaN][i];
    const rng = b.h - b.l; if (!(b.h >= E - p.tol * a[i]) || !(b.c < E) || !(rng > 0 && (b.c - b.l) / rng <= 0.4)) continue;
    let deep = false; for (let j = i - 12; j < i; j++) if (c[j].c < (p.emaN === 50 ? e50[j] : P["e" + p.emaN][j]) - 2 * a[j]) { deep = true; break; } if (!deep) continue;
    let lo = Infinity; for (let j = i - p.M; j < i; j++) lo = Math.min(lo, c[j].l);
    const e = c[i + 1].o, st = Math.max(b.h + 0.3 * a[i], e + a[i]), r = st - e; if (!(r > 0)) continue;
    if ((e - lo) / r < 1.5) continue;
    pos = { e, r, st, tp: lo, t, i: i + 1, real: 0, took: false };
  }
  return out;
}
for (const cn of coins) { const P = pre[cn]; P.e40 = ema(P.c.map(x => x.c), 40); P.e60 = ema(P.c.map(x => x.c), 60); }

function portfolio(ts0, from, to) {
  const ts = ts0.filter(x => x.t >= from && x.t < to).sort((a, b) => a.t - b.t);
  let eq = 1, peak = 1, dd = 0, open = [], n = 0, w = 0, s = 0;
  const settle = u => { open.sort((a, b) => a.tx - b.tx); while (open.length && open[0].tx <= u) { const o = open.shift(); eq += o.amt * o.R; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); } };
  for (const x of ts) { settle(x.t); if (open.length >= 5 || open.some(o => o.cn === x.cn)) continue; open.push({ ...x, amt: eq * 0.01 }); n++; if (x.R > 0) w++; s += x.R; }
  settle(Infinity); const Y = ((to === Infinity ? Date.now() : to) - from) / (365 * D1);
  return { n, win: n ? +(w / n * 100).toFixed(1) : 0, avgR: n ? +(s / n).toFixed(3) : 0, cagr: eq > 0 ? +((Math.pow(eq, 1 / Y) - 1) * 100).toFixed(1) : -100, dd: +(dd * 100).toFixed(1) };
}
const t0 = Math.min(...coins.map(cn => data[cn].h[0].t)) + 40 * D1, t1 = Math.max(...coins.map(cn => data[cn].h.at(-1).t)), cut = t0 + SPLIT * (t1 - t0);
const bearDays = [...btcUp.entries()].filter(([d, u]) => !u && d * D1 >= t0).length, allDays = [...btcUp.keys()].filter(d => d * D1 >= t0).length;
const fmtD = t => new Date(t).toISOString().slice(0, 10);
const f = s => `${s.n}/${s.win}%/${s.avgR}/${s.cagr}%/${s.dd}%`;
const evalV = (fn, p) => { const tr = coins.flatMap(cn => fn(cn, p, tieredCost)), tr40 = coins.flatMap(cn => fn(cn, p, flat40)); return { IS: portfolio(tr, t0, cut), OOS: portfolio(tr, cut, Infinity), ALL: portfolio(tr, t0, Infinity), S40: portfolio(tr40, t0, Infinity) }; };
const okv = r => r.IS.avgR > 0 && r.OOS.avgR > 0;
const trA = coins.flatMap(cn => swingA(cn, tieredCost)); const A = { IS: portfolio(trA, t0, cut), OOS: portfolio(trA, cut, Infinity), ALL: portfolio(trA, t0, Infinity) };
// 新策略上線標準：分級成本下樣本內、樣本外平均R 都 > 0、樣本外 ≥30 筆；全期勝率不低於波段A、回撤不超過波段A 的 1.2 倍；鄰近參數過半兩段都 > 0；0.40% 成本壓力下平均R 仍 > 0。
function judgeNew(r, neigh) { const nOk = neigh.filter(okv).length, why = [];
  if (!(r.IS.avgR > 0)) why.push(`樣本內平均R ${r.IS.avgR}`); if (!(r.OOS.avgR > 0)) why.push(`樣本外平均R ${r.OOS.avgR}`); if (r.OOS.n < 30) why.push(`樣本外只有 ${r.OOS.n} 筆`);
  if (!(r.ALL.win >= A.ALL.win)) why.push(`勝率 ${r.ALL.win}% 低於波段A ${A.ALL.win}%`); if (!(r.ALL.dd <= 1.2 * A.ALL.dd + 1e-9)) why.push(`回撤 ${r.ALL.dd}% 超過波段A 1.2 倍（${(1.2 * A.ALL.dd).toFixed(1)}%）`);
  if (!(nOk * 2 > neigh.length)) why.push(`鄰近參數只有 ${nOk}/${neigh.length} 組兩段都 > 0`); if (!(r.S40.avgR > 0)) why.push(`0.40% 成本下平均R ${r.S40.avgR}`);
  return { pass: why.length === 0, why, nOk }; }

const L = ["# 策略實驗室 第十五輪：S2 流動性掃盪回收＋空頭反彈到壓力再空", "", `產生時間：${new Date().toISOString()}；幣種 ${coins.length}；Binance 15 分K ${MONTHS} 個月合成 4h；分級成本；每筆風險 1%；最多 5 張`,
  `樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；BTC 在 EMA50 之下的天數 ${bearDays}/${allDays}`, `基準 波段A（分級成本）：樣本內 ${f(A.IS)}、樣本外 ${f(A.OOS)}、全期 ${f(A.ALL)}`, "",
  "欄位：筆數/勝率/平均R/年化/回撤", ""];
const OUT = { created: new Date().toISOString(), A, exp1: {}, exp2: {} };
const table = rows => ["| 版本 | 樣本內 | 樣本外 | 全期 | 成本 0.40% 壓力（全期） |", "|---|---|---|---|---|", ...rows.map(r => `| ${r.name} | ${f(r.r.IS)} | ${f(r.r.OOS)} | ${f(r.r.ALL)} | ${f(r.r.S40)} |`)];

// ===== 實驗一 =====
const s2b = { N: 20, pierce: 0.1, rr: 1.5, T: 0, btc: false, liq: 0 };
const S2V = [["基準（照佇列定義）", s2b], ["前 16 根", { ...s2b, N: 16 }], ["前 24 根", { ...s2b, N: 24 }], ["刺破 0.08ATR", { ...s2b, pierce: 0.08 }], ["刺破 0.12ATR", { ...s2b, pierce: 0.12 }], ["R:R 1.2", { ...s2b, rr: 1.2 }], ["R:R 1.8", { ...s2b, rr: 1.8 }]];
const S2REF = [["參考：加 BTC>EMA50 濾網", { ...s2b, btc: true }], ["參考：加成交額≥1億U", { ...s2b, liq: 100e6 }], ["參考：加時間停損 30 根", { ...s2b, T: 30 }]];
const r1 = S2V.map(([name, p]) => ({ name, p, r: evalV(s2Trades, p) })), r1ref = S2REF.map(([name, p]) => ({ name, p, r: evalV(s2Trades, p) }));
const j1 = judgeNew(r1[0].r, r1.slice(1).map(x => x.r));
L.push("## 實驗一：S2 流動性掃盪回收（4h 多方，照佇列定義）", "", "定義：4h K 下影刺破前 20 根低點 ≥0.1ATR 且收回低點之上，次根開盤做多；停損＝掃盪低點 −0.2ATR；目標＝前 20 根高點，R:R <1.5 略過。定義沒有 BTC 濾網、成交額門檻、時間停損，基準照定義跑，三者另列參考。", "",
  ...table([...r1, ...r1ref]), "", `判定：${j1.pass ? "**合格**" : "**不合格**"}${j1.why.length ? "；原因：" + j1.why.join("；") : ""}（鄰近參數 ${j1.nOk}/6 組兩段都 > 0）`, "");
OUT.exp1 = { rows: r1, ref: r1ref, judge: j1 };

// ===== 實驗二 =====
const rb = { emaN: 50, tol: 0.3, M: 20, T: 20, partial: false };
const RSV = [["基準 A 版", rb], ["B 版（1R 先平 1/3＋保本）", { ...rb, partial: true }], ["EMA40", { ...rb, emaN: 40 }], ["EMA60", { ...rb, emaN: 60 }], ["觸及容差 0.24ATR", { ...rb, tol: 0.24 }], ["觸及容差 0.36ATR", { ...rb, tol: 0.36 }], ["目標 前 16 根", { ...rb, M: 16 }], ["目標 前 24 根", { ...rb, M: 24 }], ["時間停損 16 根", { ...rb, T: 16 }], ["時間停損 24 根", { ...rb, T: 24 }]];
const r2 = RSV.map(([name, p]) => ({ name, p, r: evalV(rallyShort, p) }));
const j2 = judgeNew(r2[0].r, r2.slice(2).map(x => x.r)), j2b = judgeNew(r2[1].r, r2.slice(2).map(x => x.r));
L.push("## 實驗二：空頭反彈到壓力再空（BTC 跌破 EMA50 時，4h 空方）", "", "定義：BTC 前一天收盤 < 日線 EMA50；幣種成交額 ≥1 億U；4h 收盤 < EMA200；反彈K 最高價觸及 4h EMA50 −0.3ATR 以上、收盤 < EMA50、收盤強度 ≤0.4，且前 12 根內曾收在 EMA50 −2ATR 以下；次根開盤做空。停損＝反彈K高點 ＋0.3ATR（至少 1ATR）；目標＝前 20 根最低點，R:R <1.5 略過；失效＝收盤站上 EMA50 ＋0.5ATR；時間停損 20 根。", "",
  ...table(r2), "", `判定 A 版：${j2.pass ? "**合格**" : "**不合格**"}${j2.why.length ? "；原因：" + j2.why.join("；") : ""}（鄰近參數 ${j2.nOk}/8）`, `判定 B 版：${j2b.pass ? "**合格**" : "**不合格**"}${j2b.why.length ? "；原因：" + j2b.why.join("；") : ""}`, "",
  "合格才會以新一組虛擬單上線，與現有各組並列，不動既有規則；不合格就是不合格，不放寬標準。");
OUT.exp2 = { rows: r2, judge: j2, judgeB: j2b };
await fs.writeFile("lab/report15.md", L.join("\n"));
await fs.writeFile("lab/results15.json", JSON.stringify(OUT));
console.log(L.join("\n"));
