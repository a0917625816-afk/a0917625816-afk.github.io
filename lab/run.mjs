// 策略實驗室：用 BingX 歷史K線回測多種策略，樣本內選參數、樣本外驗證
import fs from "node:fs/promises";
import { ema, sma, rsi, atr, prep, analyze } from "../scripts/ta-core.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = { "User-Agent": "Mozilla/5.0 (strategy-lab)", "Accept": "application/json" };
const DT = { "1h": 36e5, "4h": 144e5, "1d": 864e5 };
const YEARS = { "1h": 2, "4h": 3, "1d": 4 };
const COST = 0.0014;          // 來回成本：手續費 0.05%×2＋滑價 0.02%×2
const SPLIT = 0.65;           // 前 65% 時間選參數，後 35% 驗證
const N_COINS = +(process.env.N_COINS || 40);
const EXCLUDE = new Set("MU MUU SKHYNIX TSM SOXL SNDK SNXX QQQ SPY NVDA TSLA AAPL AMZN META GOOGL MSFT COIN MSTR HOOD XAU XAG WDC AMD INTC CRCL PAXG XAUT USDC FDUSD USDE".split(" "));

async function getJSON(url) {
  for (let t = 0; t < 4; t++) {
    try { const r = await fetch(url, { headers: UA }); if (r.status === 429) { await sleep(3000 * (t + 1)); continue; } if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); }
    catch (e) { if (t === 3) throw e; await sleep(1500 * (t + 1)); }
  }
}
async function klines(base, iv) {
  if (process.env.MOCK) { let seed = [...base].reduce((x, ch) => x + ch.charCodeAt(0), 7) * (iv === "1h" ? 3 : iv === "4h" ? 5 : 11); const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; const n = Math.floor(YEARS[iv] * 365 * 864e5 / DT[iv]), out = []; let p = 100; const now = Date.now(); for (let i = 0; i < n; i++) { const sg = 0.01 * Math.sqrt(DT[iv] / 36e5), o = p, c = o * (1 + (rnd() - 0.5) * 2 * sg + Math.sin(i / 300) * sg * 0.2); out.push({ t: now - (n - i) * DT[iv], o, h: Math.max(o, c) * (1 + rnd() * sg * 0.5), l: Math.min(o, c) * (1 - rnd() * sg * 0.5), c, v: 1000 }); p = c; } return out; }
  const sym = base + "-USDT", start = Date.now() - YEARS[iv] * 365 * 864e5, map = new Map();
  let end = Date.now();
  for (let k = 0; k < 40; k++) {
    const j = await getJSON(`https://open-api.bingx.com/openApi/swap/v3/quote/klines?symbol=${sym}&interval=${iv}&limit=1440&endTime=${end}`);
    if (j.code !== 0 || !Array.isArray(j.data) || !j.data.length) break;
    let oldest = Infinity;
    for (const x of j.data) { const t = +x.time; oldest = Math.min(oldest, t); if (t >= start) map.set(t, { t, o: +x.open, h: +x.high, l: +x.low, c: +x.close, v: +x.volume }); }
    if (oldest <= start || oldest === Infinity || j.data.length < 50) break;
    end = oldest - 1; await sleep(120);
  }
  const arr = [...map.values()].sort((a, b) => a.t - b.t);
  return arr.slice(0, -1); // 去掉還沒收盤的最後一根
}

// ===== 通用模擬：訊號在 i 根收盤確認，i+1 根開盤進場；停損用盤中高低點檢查 =====
function sim(c, a, o) {
  const tr = []; let p = null;
  for (let i = 1; i < c.length; i++) {
    const b = c[i];
    if (p) {
      const d = p.d; let x = null;
      if (d > 0 && b.l <= p.stop) x = Math.min(b.o, p.stop);
      if (d < 0 && b.h >= p.stop) x = Math.max(b.o, p.stop);
      if (x == null && o.exitSig && o.exitSig(i, d)) x = b.c;
      if (x == null && o.maxHold && i - p.i >= o.maxHold) x = b.c;
      if (x != null) { tr.push({ t: p.t, R: d * (x - p.e) / p.r - COST * p.e / p.r, d, bars: i - p.i }); p = null; }
      else {
        if (d > 0) p.hh = Math.max(p.hh, b.h); else p.ll = Math.min(p.ll, b.l);
        if (o.chand && a[i] > 0) { const ns = d > 0 ? p.hh - o.chand * a[i] : p.ll + o.chand * a[i]; p.stop = d > 0 ? Math.max(p.stop, ns) : Math.min(p.stop, ns); }
      }
    }
    if (!p && i < c.length - 1 && a[i] > 0) {
      let d = 0;
      if (o.sides !== "short" && o.long(i)) d = 1;
      else if (o.sides === "both" && o.short(i)) d = -1;
      if (d) { const e = c[i + 1].o, r = o.k * a[i]; if (r > 0 && e > 0) p = { d, e, r, stop: e - d * r, i: i + 1, t: c[i + 1].t, hh: e, ll: e }; }
    }
  }
  return tr;
}
const hiN = (c, i, n) => { let m = -Infinity; for (let j = i - n; j < i; j++) m = Math.max(m, c[j].h); return m; };
const loN = (c, i, n) => { let m = Infinity; for (let j = i - n; j < i; j++) m = Math.min(m, c[j].l); return m; };

// ===== 策略 =====
function famDON(c, a, p) { // 通道突破（海龜式順勢）
  const cl = c.map(x => x.c), e200 = ema(cl, 200), N = p.N, M = Math.max(5, Math.round(N / 2));
  const okL = i => p.filt ? cl[i] > e200[i] : true, okS = i => p.filt ? cl[i] < e200[i] : true;
  return sim(c, a, { k: p.k, sides: p.sides, chand: p.exit === "chand" ? 3 : 0,
    long: i => i > N && c[i].c > hiN(c, i, N) && okL(i), short: i => i > N && c[i].c < loN(c, i, N) && okS(i),
    exitSig: p.exit === "don" ? (i, d) => i > M && (d > 0 ? c[i].c < loN(c, i, M) : c[i].c > hiN(c, i, M)) : null });
}
function famEMA(c, a, p) { // 均線交叉
  const cl = c.map(x => x.c), f = ema(cl, p.f), s = ema(cl, p.s);
  const up = i => f[i] > s[i] && f[i - 1] <= s[i - 1], dn = i => f[i] < s[i] && f[i - 1] >= s[i - 1];
  return sim(c, a, { k: p.k, sides: p.sides, chand: p.exit === "chand" ? 3 : 0, long: i => i > p.s && up(i), short: i => i > p.s && dn(i),
    exitSig: p.exit === "cross" ? (i, d) => d > 0 ? f[i] < s[i] : f[i] > s[i] : null });
}
function famPULL(c, a, p) { // 趨勢中拉回（RSI2 超賣買、超買賣）
  const cl = c.map(x => x.c), e50 = ema(cl, 50), e200 = ema(cl, 200), r2 = rsi(cl, 2);
  return sim(c, a, { k: p.k, sides: p.sides, maxHold: p.hold,
    long: i => i > 200 && cl[i] > e200[i] && e50[i] > e200[i] && r2[i] < p.lo, short: i => i > 200 && cl[i] < e200[i] && e50[i] < e200[i] && r2[i] > 100 - p.lo,
    exitSig: (i, d) => d > 0 ? r2[i] > 70 : r2[i] < 30 });
}
function famCUR(c4, c1d, p) { // 現行評分系統（4 小時K＋日線方向），TP1/2/3 分批出場
  const P = prep(c4, DT["4h"]), T = prep(c1d, DT["1d"]), n = c4.length - 1, tr = []; let i = 210;
  while (i < n - 1) {
    const A = analyze(P, T, i, null); if (A.status === "flat" || A.score < p.th || A.sl == null) { i++; continue; }
    const d = A.dir, e = A.price, R = A.risk; let sl = A.sl, st = 0, real = 0, left = 1, j = i + 1;
    for (; j < n && j <= i + 100; j++) { const b = c4[j], adv = d > 0 ? b.l : b.h, fav = d > 0 ? b.h : b.l;
      if (d * (adv - sl) <= 0) { real += left * d * (sl - e) / R; left = 0; break; }
      if (st < 1 && d * (fav - A.tp1) >= 0) { real += d * (A.tp1 - e) / R / 3; left -= 1 / 3; st = 1; sl = e; }
      if (st < 2 && d * (fav - A.tp2) >= 0) { real += d * (A.tp2 - e) / R / 3; left -= 1 / 3; st = 2; sl = A.tp1; }
      if (st < 3 && d * (fav - A.tp3) >= 0) { real += d * (A.tp3 - e) / R * left; left = 0; break; } }
    if (left > 1e-9) real += left * d * (c4[Math.min(j, n - 1)].c - e) / R;
    tr.push({ t: c4[i].t, R: real - COST * e / R, d, bars: j - i }); i = Math.min(j, n - 1) + 1;
  }
  return tr;
}

// ===== 統計 =====
function stats(tr) {
  const n = tr.length; if (!n) return { n: 0 };
  const s = tr.slice().sort((a, b) => a.t - b.t); let cum = 0, peak = 0, dd = 0, pos = 0, neg = 0, w = 0;
  for (const x of s) { cum += x.R; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); if (x.R > 0) { pos += x.R; w++; } else neg -= x.R; }
  return { n, win: +(w / n * 100).toFixed(1), avg: +(cum / n).toFixed(3), tot: +cum.toFixed(1), pf: neg ? +(pos / neg).toFixed(2) : null, dd: +dd.toFixed(1) };
}
const grid = o => Object.entries(o).reduce((acc, [k, vs]) => acc.flatMap(x => vs.map(v => ({ ...x, [k]: v }))), [{}]);

// ===== 主程式 =====
const bx = JSON.parse(await fs.readFile("bingx.json", "utf8"));
const cands = bx.symbols.filter(x => !EXCLUDE.has(x.base) && !/NCCO|USD$|^\d/.test(x.base)).sort((a, b) => b.qv - a.qv);
const data = {}; const log = [];
for (const s of cands) {
  if (Object.keys(data).length >= N_COINS) break;
  try {
    const d1 = await klines(s.base, "1d");
    if (d1.length < 500) { log.push(`${s.base} 歷史太短（${d1.length} 天）略過`); continue; }
    const h4 = await klines(s.base, "4h"), h1 = await klines(s.base, "1h");
    data[s.base] = { "1d": d1, "4h": h4, "1h": h1 };
    console.log("OK", s.base, d1.length, h4.length, h1.length);
  } catch (e) { log.push(`${s.base} 失敗 ${e.message}`); }
}
const coins = Object.keys(data);
console.log("幣種", coins.length, coins.join(","));

const FAMS = {
  "通道突破": { fn: famDON, tfs: ["4h", "1d"], g: { N: [20, 55, 100], k: [2, 3], exit: ["chand", "don"], sides: ["long", "both"], filt: [0, 1] } },
  "均線交叉": { fn: famEMA, tfs: ["4h", "1d"], g: { f: [20, 50], s: [100, 200], k: [2, 3], exit: ["chand", "cross"], sides: ["long", "both"] } },
  "趨勢中拉回": { fn: famPULL, tfs: ["1h", "4h"], g: { lo: [5, 10, 20], k: [1.5, 2.5], hold: [10, 30], sides: ["long", "both"] } },
};
const results = []; let cut = {};
for (const tf of ["1h", "4h", "1d"]) { let lo = Infinity, hi = -Infinity; coins.forEach(cn => { const c = data[cn][tf]; if (c.length) { lo = Math.min(lo, c[0].t); hi = Math.max(hi, c.at(-1).t); } }); cut[tf] = lo + SPLIT * (hi - lo); cut[tf + "_range"] = [lo, hi]; }
const ATR = {}; coins.forEach(cn => { ATR[cn] = {}; for (const tf of ["1h", "4h", "1d"]) ATR[cn][tf] = atr(data[cn][tf], 14); });

for (const [fam, F] of Object.entries(FAMS)) for (const tf of F.tfs) for (const p of grid(F.g)) {
  const all = [], perCoin = {};
  for (const cn of coins) { const c = data[cn][tf]; if (c.length < 300) continue; const tr = F.fn(c, ATR[cn][tf], p); tr.forEach(x => x.coin = cn); all.push(...tr); perCoin[cn] = tr; }
  const IS = all.filter(x => x.t < cut[tf]), OOS = all.filter(x => x.t >= cut[tf]);
  results.push({ fam, tf, p, IS: stats(IS), OOS: stats(OOS), coinOOS: Object.fromEntries(Object.entries(perCoin).map(([k, v]) => [k, stats(v.filter(x => x.t >= cut[tf])).avg ?? null])) });
}
for (const th of [70, 80, 90]) {
  const all = [];
  for (const cn of coins) { const tr = famCUR(data[cn]["4h"], data[cn]["1d"], { th }); tr.forEach(x => x.coin = cn); all.push(...tr); }
  results.push({ fam: "現行評分", tf: "4h", p: { th }, IS: stats(all.filter(x => x.t < cut["4h"])), OOS: stats(all.filter(x => x.t >= cut["4h"])), coinOOS: {} });
  console.log("現行評分", th, "done");
}

// 每個策略家族：用樣本內挑最佳（至少 150 筆），看它在樣本外的成績
const best = {};
for (const r of results) { const k = r.fam + "|" + r.tf; if (r.IS.n < 150) continue; if (!best[k] || r.IS.avg > best[k].IS.avg) best[k] = r; }
const fmtD = t => new Date(t).toISOString().slice(0, 10);
const lines = ["# 策略實驗室回測報告", "", `產生時間：${new Date().toISOString()}　幣種 ${coins.length} 個：${coins.join("、")}`, `成本：每筆來回 ${COST * 100}%（手續費＋滑價）。樣本內／樣本外切點：前 ${SPLIT * 100}% 時間 / 後 ${(1 - SPLIT) * 100}%。`, ""];
for (const tf of ["1h", "4h", "1d"]) lines.push(`- ${tf}：資料 ${fmtD(cut[tf + "_range"][0])} ～ ${fmtD(cut[tf + "_range"][1])}，樣本外從 ${fmtD(cut[tf])} 開始`);
lines.push("", "## 各策略家族：樣本內最佳參數 → 樣本外成績", "", "| 策略 | 週期 | 參數 | 樣本內 筆數/勝率/平均R | 樣本外 筆數/勝率/平均R/合計R/PF/最大回撤R |", "|---|---|---|---|---|");
for (const r of Object.values(best).sort((a, b) => (b.OOS.avg ?? -9) - (a.OOS.avg ?? -9))) lines.push(`| ${r.fam} | ${r.tf} | ${JSON.stringify(r.p)} | ${r.IS.n}/${r.IS.win}%/${r.IS.avg} | ${r.OOS.n}/${r.OOS.win}%/${r.OOS.avg}/${r.OOS.tot}/${r.OOS.pf}/${r.OOS.dd} |`);
lines.push("", "## 所有參數中，樣本內和樣本外都賺的（平均R皆 > 0.1，樣本外至少 80 筆）前 25 名", "", "| 策略 | 週期 | 參數 | 樣本內平均R | 樣本外 筆數/勝率/平均R/PF/回撤 |", "|---|---|---|---|---|");
results.filter(r => r.IS.avg > 0.1 && r.OOS.avg > 0.1 && r.OOS.n >= 80).sort((a, b) => b.OOS.avg - a.OOS.avg).slice(0, 25)
  .forEach(r => lines.push(`| ${r.fam} | ${r.tf} | ${JSON.stringify(r.p)} | ${r.IS.avg} | ${r.OOS.n}/${r.OOS.win}%/${r.OOS.avg}/${r.OOS.pf}/${r.OOS.dd} |`));
if (log.length) lines.push("", "## 略過", "", ...log.map(x => "- " + x));
await fs.mkdir("lab", { recursive: true });
await fs.writeFile("lab/results.json", JSON.stringify({ created: new Date().toISOString(), coins, cut, results }));
await fs.writeFile("lab/report.md", lines.join("\n"));
console.log(lines.slice(0, 40).join("\n"));
