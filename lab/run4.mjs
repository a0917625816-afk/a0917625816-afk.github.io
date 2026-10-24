// 策略實驗室 第四輪：在「期望值不變差、回撤不變大」前提下拉高勝率
// 對象：雲端兩個策略（波段 4h 55 根突破、日內 15m 48 小時突破），同濾網（BTC>EMA50＋20 日強勢前 10）
// 測試：分批停利（到 xR 先平一部分、停損移到保本）、進場品質濾網（量能、收盤強度、離均線不過遠）
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { ema, sma, atr } from "../scripts/ta-core.mjs";

const COST = 0.0014, SPLIT = 0.65, N_COINS = +(process.env.N_COINS || 40), MONTHS = +(process.env.MONTHS || 30);
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

// q：進場品質濾網；x：出場設定 { tp: 分批停利 R（0=無）, f: 先平比例, be: 平倉後停損移保本 }
function quality(P, i, q) {
  const b = P.c[i], rng = b.h - b.l;
  if (q.vol && !(b.v > q.vol * P.v20[i])) return false;
  if (q.cs && !(rng > 0 && (b.c - b.l) / rng >= q.cs)) return false;
  if (q.ext && !((b.c - P.e20[i]) / P.a[i] <= q.ext)) return false;
  return true;
}
function trades(cn, kind, q, x) {
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
      if (ex != null) { const left = pos.took ? 1 - x.f : 1; const R = pos.real + left * (ex - pos.e) / pos.r - COST * pos.e / pos.r; out.push({ cn, t: pos.t, tx: b.t + (kind === "swing" ? H4 : M15), R, stopPct: pos.r / pos.e }); pos = null; }
      continue;
    }
    if (kind === "intra") { const day = dk(b.t); if (day === doneDay || b.t >= day * D1 + 20 * 36e5) continue; }
    let hi = -Infinity; for (let j = i - N; j < i; j++) hi = Math.max(hi, c[j].h);
    if (!(b.c > hi)) continue;
    if (kind === "swing" && !(b.c > P.e200[i])) continue;
    const t = c[i + 1].t; if (!okF(cn, t)) continue;
    if (kind === "intra") doneDay = dk(b.t);
    if (!quality(P, i, q)) continue;
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
const Q = grid({ vol: [0, 1.5], cs: [0, 0.6], ext: [0, 3] });
const X = [{ tp: 0, f: 0, be: false }, ...grid({ tp: [1, 1.5, 2], f: [0.33, 0.5], be: [true, false] })];
const t0 = Math.min(...coins.map(cn => data[cn].m[0].t)) + 30 * D1, t1 = Math.max(...coins.map(cn => data[cn].m.at(-1).t)), cut = t0 + SPLIT * (t1 - t0);
const out = { swing: [], intra: [] };
for (const kind of ["swing", "intra"]) for (const q of Q) for (const x of X) {
  const tr = coins.flatMap(cn => trades(cn, kind, q, x));
  out[kind].push({ q, x, IS: portfolio(tr, t0, cut), OOS: portfolio(tr, cut, Infinity), ALL: portfolio(tr, t0, Infinity) });
}
const fmtD = t => new Date(t).toISOString().slice(0, 10);
const qn = q => [q.vol ? `量>${q.vol}倍` : "", q.cs ? `收在K棒上${Math.round((1 - q.cs) * 100)}%` : "", q.ext ? `離EMA20≤${q.ext}ATR` : ""].filter(Boolean).join("＋") || "無";
const xn = x => x.tp ? `${x.tp}R 先平${Math.round(x.f * 100)}%${x.be ? "＋保本" : ""}` : "不分批";
const row = r => `| ${qn(r.q)} | ${xn(r.x)} | ${r.IS.win}%/${r.IS.avgR}/${r.IS.dd}% | ${r.OOS.win}%/${r.OOS.avgR}/${r.OOS.dd}%/${r.OOS.n} | ${r.ALL.win}%/${r.ALL.avgR}/${r.ALL.cagr}%/${r.ALL.dd}% |`;
const L = ["# 策略實驗室 第四輪：拉高勝率", "", `產生時間：${new Date().toISOString()}；幣種 ${coins.length}；Binance 15 分K ${MONTHS} 個月（4h、日K 由此合成）；成本來回 0.14%；每筆風險 1%；最多 5 張`, `樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}`, "", "欄位：勝率/平均R/回撤；全期多一欄年化", ""];
for (const kind of ["swing", "intra"]) {
  const rs = out[kind], base = rs.find(r => !r.q.vol && !r.q.cs && !r.q.ext && !r.x.tp);
  L.push(`## ${kind === "swing" ? "波段（4h 55 根突破）" : "日內（15m 48 小時突破）"}`, "", `基準（目前上線版本）：全期 勝率 ${base.ALL.win}%、平均 ${base.ALL.avgR}R、年化 ${base.ALL.cagr}%、回撤 ${base.ALL.dd}%｜樣本外 勝率 ${base.OOS.win}%、平均 ${base.OOS.avgR}R`, "",
    "### 合格：樣本內、樣本外 勝率都比基準高，平均R 都不低於基準 90%，回撤不超過基準 1.2 倍", "", "| 進場濾網 | 出場 | 樣本內 | 樣本外（含筆數） | 全期 |", "|---|---|---|---|---|");
  const ok = rs.filter(r => r !== base && r.IS.win > base.IS.win && r.OOS.win > base.OOS.win && r.IS.avgR >= 0.9 * base.IS.avgR && r.OOS.avgR >= 0.9 * base.OOS.avgR && r.ALL.dd <= 1.2 * base.ALL.dd && r.OOS.n >= 30);
  ok.sort((a, b) => b.ALL.avgR * Math.sqrt(b.ALL.n) - a.ALL.avgR * Math.sqrt(a.ALL.n)).slice(0, 15).forEach(r => L.push(row(r)));
  if (!ok.length) L.push("| （沒有） | | | | |");
  L.push("", "### 只看出場（不加進場濾網）", "", "| 進場濾網 | 出場 | 樣本內 | 樣本外（含筆數） | 全期 |", "|---|---|---|---|---|");
  rs.filter(r => !r.q.vol && !r.q.cs && !r.q.ext).forEach(r => L.push(row(r)));
  L.push("", "### 只看進場濾網（不分批）", "", "| 進場濾網 | 出場 | 樣本內 | 樣本外（含筆數） | 全期 |", "|---|---|---|---|---|");
  rs.filter(r => !r.x.tp).forEach(r => L.push(row(r)));
  L.push("");
}
await fs.writeFile("lab/report4.md", L.join("\n"));
await fs.writeFile("lab/results4.json", JSON.stringify({ created: new Date().toISOString(), coins, out }));
console.log(L.join("\n"));
