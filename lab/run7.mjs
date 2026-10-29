// 策略實驗室 第七輪：滑價壓力測試（成本 0.14%／0.40%／0.70%，檢驗現行三組的優勢是不是只在低成本下成立）
// 對象：目前上線的三組（波段A、波段B＝1R先平1/3＋保本、日內＝量>1.5倍＋收在K棒上40%）
// 測試：①流動性（近30天日均成交額門檻）②上市天數門檻（新幣不做）③資金費率不擁擠才做（≤0.01%/8h 或 ≤0）
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { ema, sma, atr } from "../scripts/ta-core.mjs";

let COST = 0.0014, SPLIT = 0.65, N_COINS = +(process.env.N_COINS || 40), MONTHS = +(process.env.MONTHS || 30);
const M15 = 9e5, H4 = 144e5, D1 = 864e5;
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

// 指標預先算好
const pre = {};
for (const cn of coins) for (const tf of ["h", "m"]) { const c = data[cn][tf]; (pre[cn] ||= {})[tf] = { c, a: atr(c, 14), e20: ema(c.map(x => x.c), 20), e200: ema(c.map(x => x.c), 200), v20: sma(c.map(x => x.v), 20) }; }


// ---- 新增資料：資金費率（Binance 公開月檔）----
async function funding(base) {
  const sym = base + "USDT", out = [], now = new Date();
  for (let k = MONTHS; k >= 0; k--) {
    const ym = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1)).toISOString().slice(0, 7);
    try {
      const r = await fetch(`https://data.binance.vision/data/futures/um/monthly/fundingRate/${sym}/${sym}-fundingRate-${ym}.zip`);
      if (!r.ok) continue;
      const f = `/tmp/f-${sym}.zip`; await fs.writeFile(f, Buffer.from(await r.arrayBuffer()));
      const csv = execFileSync("unzip", ["-p", f], { maxBuffer: 1 << 26 }).toString();
      for (const line of csv.split("\n")) { const x = line.trim().split(","); if (x.length < 2 || isNaN(+x[0]) || isNaN(+x.at(-1))) continue; out.push([+x[0], +x.at(-1)]); }
    } catch (e) { }
  }
  return out.sort((a, b) => a[0] - b[0]);
}
const FUND = {}; let fundOK = 0;
if (!process.env.MOCK) for (const cn of coins) { FUND[cn] = await funding(cn); if (FUND[cn].length) fundOK++; }
console.log("資金費率有資料的幣", fundOK, "/", coins.length);
function lastFund(cn, t) { const a = FUND[cn]; if (!a || !a.length) return null; let lo = 0, hi = a.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (a[m][0] <= t) { ans = m; lo = m + 1; } else hi = m - 1; } return ans < 0 ? null : a[ans][1]; }
// 近30天日均成交額（USDT，用日K 收盤×量估算），以前一天為準
const LIQ = {}; for (const cn of coins) { const d = data[cn].d, m = new Map(); let s = 0; const q = d.map(b => b.c * b.v); for (let i = 0; i < d.length; i++) { s += q[i]; if (i >= 30) s -= q[i - 30]; if (i >= 29) m.set(dk(d[i].t), s / 30); } LIQ[cn] = m; }
// 上市日：資料一開始就有的幣視為老幣（真正上市更早，不受天數限制）
const G0 = Math.min(...coins.map(cn => data[cn].m[0].t)); const FIRST = {}; for (const cn of coins) { const f0 = data[cn].m[0].t; FIRST[cn] = f0 - G0 < 3 * D1 ? -Infinity : f0; }
function passF(cn, t, f) {
  if (f.liq) { const v = LIQ[cn].get(dk(t) - 1); if (!(v >= f.liq * 1e6)) return false; }
  if (f.age && (t - FIRST[cn]) < f.age * D1) return false;
  if (f.fund != null) { const r = lastFund(cn, t); if (r != null && r > f.fund) return false; }
  return true;
}
function quality(P, i, q) {
  const b = P.c[i], rng = b.h - b.l;
  if (q.vol && !(b.v > q.vol * P.v20[i])) return false;
  if (q.cs && !(rng > 0 && (b.c - b.l) / rng >= q.cs)) return false;
  return true;
}
function trades(cn, kind, q, x, f) {
  const tf = kind === "swing" ? "h" : "m", P = pre[cn][tf], c = P.c, a = P.a, out = [];
  const N = kind === "swing" ? 55 : 192, M = 27, stopK = kind === "swing" ? 2 : 6;
  let pos = null, doneDay = -1;
  for (let i = Math.max(N, 210); i < c.length - 1; i++) {
    const b = c[i];
    if (pos) {
      let ex = null;
      const stop = pos.st;
      if (b.l <= stop) ex = Math.min(b.o, stop);
      else {
        if (x.tp && !pos.took && b.h >= pos.e + x.tp * pos.r) { pos.took = true; pos.real += x.f * x.tp; if (x.be) pos.st = Math.max(pos.st, pos.e + 0.05 * pos.r); }
        if (kind === "swing") { let lo = Infinity; for (let j = i - M; j < i; j++) lo = Math.min(lo, c[j].l); if (b.c < lo) ex = b.c; }
        else if (b.t + M15 >= pos.dayEnd) ex = b.c;
      }
      if (ex != null) { const left = pos.took ? 1 - x.f : 1; const R = pos.real + left * (ex - pos.e) / pos.r - COST * pos.e / pos.r; out.push({ cn, t: pos.t, tx: b.t + (kind === "swing" ? H4 : M15), R }); pos = null; }
      continue;
    }
    if (kind === "intra") { const day = dk(b.t); if (day === doneDay || b.t >= day * D1 + 20 * 36e5) continue; }
    let hi = -Infinity; for (let j = i - N; j < i; j++) hi = Math.max(hi, c[j].h);
    if (!(b.c > hi)) continue;
    if (kind === "swing" && !(b.c > P.e200[i])) continue;
    const t = c[i + 1].t; if (!okF(cn, t)) continue;
    if (kind === "intra") doneDay = dk(b.t);
    if (!quality(P, i, q)) continue;
    if (!passF(cn, t, f)) continue;
    const e = c[i + 1].o, r = stopK * a[i]; if (!(r > 0) || r / e < 0.002) continue;
    pos = { e, r, st: e - r, t, real: 0, took: false, dayEnd: (dk(b.t) + 1) * D1 };
  }
  return out;
}
function portfolio(ts0, from, to) {
  const ts = ts0.filter(x => x.t >= from && x.t < to).sort((a, b) => a.t - b.t);
  let eq = 1, peak = 1, dd = 0, open = [], n = 0, w = 0, s = 0;
  const settle = u => { open.sort((a, b) => a.tx - b.tx); while (open.length && open[0].tx <= u) { const o = open.shift(); eq += o.amt * o.R; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); } };
  for (const x of ts) { settle(x.t); if (open.length >= 5 || open.some(o => o.cn === x.cn)) continue; open.push({ ...x, amt: eq * 0.01 }); n++; if (x.R > 0) w++; s += x.R; }
  settle(Infinity); const Y = ((to === Infinity ? Date.now() : to) - from) / (365 * D1);
  return { n, win: n ? +(w / n * 100).toFixed(1) : 0, avgR: n ? +(s / n).toFixed(3) : 0, cagr: eq > 0 ? +((Math.pow(eq, 1 / Y) - 1) * 100).toFixed(1) : -100, dd: +(dd * 100).toFixed(1) };
}
const grid = o => Object.entries(o).reduce((acc, [k, vs]) => acc.flatMap(z => vs.map(v => ({ ...z, [k]: v }))), [{}]);
const F = grid({ liq: [0, 20, 50, 100], age: [0, 90, 180, 365], fund: [null, 0.0001, 0] });
const STRATS = [
  { key: "A", name: "波段A", kind: "swing", q: {}, x: { tp: 0, f: 0, be: false }, f: {} },
  { key: "B", name: "波段B（1R先平1/3＋保本）", kind: "swing", q: {}, x: { tp: 1, f: 0.33, be: true }, f: {} },
  { key: "I", name: "日內（量能＋收盤強度＋成交額≥1億U）", kind: "intra", q: { vol: 1.5, cs: 0.6 }, x: { tp: 0, f: 0, be: false }, f: { liq: 100 } },
];
const COSTS = [0.0014, 0.004, 0.007];
const t0 = Math.min(...coins.map(cn => data[cn].m[0].t)) + 30 * D1, t1 = Math.max(...coins.map(cn => data[cn].m.at(-1).t)), cut = t0 + SPLIT * (t1 - t0);
const fmtD = t => new Date(t).toISOString().slice(0, 10);
const OUT = { created: new Date().toISOString(), costs: COSTS, res: {} };
const L = ["# 策略實驗室 第七輪：滑價壓力測試", "", `產生時間：${OUT.created}；幣種 ${coins.length}；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}`, "",
  "方法：同一套規則，成本分別用 0.14%（現行）、0.40%、0.70%（模擬小幣的真實滑價）重跑。", "通過標準（0.40% 下）：樣本內、樣本外平均R都 > 0，且全期平均R 不低於現行成本下的 50%。", "", "| 組別 | 成本 | 樣本內 勝率/平均R | 樣本外 勝率/平均R（筆數） | 全期 勝率/平均R/回撤/筆數 |", "|---|---|---|---|---|"];
for (const S of STRATS) {
  OUT.res[S.key] = { name: S.name, rows: [] };
  for (const c of COSTS) {
    COST = c;
    const tr = coins.flatMap(cn => trades(cn, S.kind, S.q, S.x, S.f));
    const IS = portfolio(tr, t0, cut), OOS = portfolio(tr, cut, Infinity), ALL = portfolio(tr, t0, Infinity);
    OUT.res[S.key].rows.push({ cost: c, IS, OOS, ALL });
    L.push(`| ${S.name} | ${(c * 100).toFixed(2)}% | ${IS.win}%/${IS.avgR} | ${OOS.win}%/${OOS.avgR}（${OOS.n}）| ${ALL.win}%/${ALL.avgR}/${ALL.dd}%/${ALL.n} |`);
  }
  COST = COSTS[0];
  const [base, stress] = OUT.res[S.key].rows;
  const pass = stress.IS.avgR > 0 && stress.OOS.avgR > 0 && stress.ALL.avgR >= 0.5 * base.ALL.avgR;
  OUT.res[S.key].pass = pass;
  L.push("", `判定：${pass ? "**通過**（成本加倍後仍有正期望值）" : "**不通過**（成本一提高，優勢就消失或大幅縮水，代表現有回測結果不可靠）"}`, "");
}
await fs.writeFile("lab/report7.md", L.join("\n"));
await fs.writeFile("lab/results7.json", JSON.stringify(OUT));
console.log(L.join("\n"));
