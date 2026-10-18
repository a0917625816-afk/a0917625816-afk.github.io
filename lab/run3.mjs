// 策略實驗室 第三輪：日內交易（當天 UTC 24:00 ＝台灣早上 08:00 前一定平倉）
import fs from "node:fs/promises";
import { ema, atr } from "../scripts/ta-core.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = { "User-Agent": "Mozilla/5.0 (strategy-lab)", "Accept": "application/json" };
const DT = { "15m": 9e5, "1d": 864e5 };
const YEARS = { "15m": +(process.env.Y15 || 1.5), "1d": 2 };
const COST = 0.0014, SPLIT = 0.65, N_COINS = +(process.env.N_COINS || 40);
const EXCLUDE = new Set("MU MUU SKHYNIX TSM SOXL SNDK SNXX QQQ SPY NVDA TSLA AAPL AMZN META GOOGL MSFT COIN MSTR HOOD XAU XAG WDC AMD INTC CRCL PAXG XAUT USDC FDUSD USDE".split(" "));
async function getJSON(url) { for (let t = 0; t < 4; t++) { try { const r = await fetch(url, { headers: UA }); if (r.status === 429) { await sleep(3000 * (t + 1)); continue; } if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); } catch (e) { if (t === 3) throw e; await sleep(1500 * (t + 1)); } } }
async function klines(base, iv) {
  if (process.env.MOCK) { let seed = [...base].reduce((x, ch) => x + ch.charCodeAt(0), 7) * (iv === "1d" ? 5 : 11); const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; const n = Math.floor(YEARS[iv] * 365 * 864e5 / DT[iv]), out = []; let p = 100; const now = Math.floor(Date.now() / 864e5) * 864e5; for (let i = 0; i < n; i++) { const sg = 0.01 * Math.sqrt(DT[iv] / 36e5), o = p, c = o * (1 + (rnd() - 0.5) * 2 * sg + Math.sin(i / 300 + seed % 7) * sg * 0.2); out.push({ t: now - (n - i) * DT[iv], o, h: Math.max(o, c) * (1 + rnd() * sg * 0.5), l: Math.min(o, c) * (1 - rnd() * sg * 0.5), c, v: 1000 }); p = c; } return out; }
  const sym = base + "-USDT", start = Date.now() - YEARS[iv] * 365 * 864e5, map = new Map(); let end = Date.now();
  for (let k = 0; k < 80; k++) {
    const j = await getJSON(`https://open-api.bingx.com/openApi/swap/v3/quote/klines?symbol=${sym}&interval=${iv}&limit=1440&endTime=${end}`);
    if (j.code !== 0 || !Array.isArray(j.data) || !j.data.length) break; let oldest = Infinity;
    for (const x of j.data) { const t = +x.time; oldest = Math.min(oldest, t); if (t >= start) map.set(t, { t, o: +x.open, h: +x.high, l: +x.low, c: +x.close, v: +x.volume }); }
    if (oldest <= start || j.data.length < 50) break; end = oldest - 1; await sleep(100);
  }
  return [...map.values()].sort((a, b) => a.t - b.t).slice(0, -1);
}

let data = {};
try { data = JSON.parse(await fs.readFile("lab/.cache/data3.json", "utf8")); } catch {}
if (!Object.keys(data).length) {
  const bx = JSON.parse(await fs.readFile("bingx.json", "utf8"));
  const cands = bx.symbols.filter(x => !EXCLUDE.has(x.base) && !/NCCO|USD$|^\d/.test(x.base)).sort((a, b) => b.qv - a.qv);
  for (const s of [{ base: "BTC" }, ...cands.filter(x => x.base !== "BTC")]) {
    if (Object.keys(data).length >= N_COINS) break;
    try { const d1 = await klines(s.base, "1d"); if (d1.length < 400) continue; const m = await klines(s.base, "15m"); if (m.length < 20000) continue; data[s.base] = { "1d": d1, "15m": m }; console.log("OK", s.base, m.length); } catch (e) { console.log("失敗", s.base, e.message); }
  }
  await fs.mkdir("lab/.cache", { recursive: true }); await fs.writeFile("lab/.cache/data3.json", JSON.stringify(data));
}
const coins = Object.keys(data); console.log("幣種", coins.length);

// ===== 濾網（只用前一天已收盤資料）=====
const dayKey = t => Math.floor(t / 864e5);
const btcD = data.BTC["1d"], btcC = btcD.map(x => x.c), btcE50 = ema(btcC, 50);
const btcUp = new Map(); btcD.forEach((b, i) => btcUp.set(dayKey(b.t), b.c > btcE50[i]));
const dayClose = {}; coins.forEach(cn => { const m = new Map(); data[cn]["1d"].forEach(b => m.set(dayKey(b.t), b.c)); dayClose[cn] = m; });
const rk = new Map();
function rankOf(day) { if (rk.has(day)) return rk.get(day); const sc = []; for (const cn of coins) { const a = dayClose[cn].get(day), b = dayClose[cn].get(day - 20); if (a && b) sc.push([cn, a / b - 1]); } sc.sort((x, y) => y[1] - x[1]); const r = { top: new Set(sc.slice(0, 10).filter(x => x[1] > 0).map(x => x[0])), bot: new Set(sc.slice(-10).filter(x => x[1] < 0).map(x => x[0])) }; rk.set(day, r); return r; }
// filt: none＝不限；btc＝只順 BTC 大方向；full＝順 BTC 大方向＋只做強勢（多）/弱勢（空）
function allowed(cn, t, dir, p) {
  if (p.sides === "long" && dir < 0) return false;
  if (p.filt === "none") return true;
  const d = dayKey(t) - 1, up = btcUp.get(d); if (up == null) return false;
  if (dir > 0 && !up) return false; if (dir < 0 && up) return false;
  if (p.filt === "full") { const r = rankOf(d); return dir > 0 ? r.top.has(cn) : r.bot.has(cn); }
  return true;
}
// 美股開盤（夏令 13:30 UTC、冬令 14:30 UTC）
function usOpen(day) { const d = new Date(day * 864e5), y = d.getUTCFullYear(); const nth = (m, k) => { const f = new Date(Date.UTC(y, m, 1)); return dayKey(f.getTime()) + ((7 - f.getUTCDay()) % 7) + 7 * (k - 1); }; const dst = day >= nth(2, 2) && day < nth(10, 1); return day * 864e5 + (dst ? 13.5 : 14.5) * 36e5; }

// ===== 單幣日內模擬：每天依規則最多一筆，UTC 日結束強制平倉 =====
const pre = {}; coins.forEach(cn => { const c = data[cn]["15m"]; pre[cn] = { c, a: atr(c, 14) }; });
function runCoin(cn, p) {
  const { c, a } = pre[cn], tr = [];
  let i = 0;
  while (i < c.length) {
    const day = dayKey(c[i].t); let j = i; while (j < c.length && dayKey(c[j].t) === day) j++; // [i, j) 為當天
    if (j - i >= 90 && i > 200) { const t = dayTrade(cn, c, a, i, j, day, p); if (t) tr.push(t); }
    i = j;
  }
  return tr;
}
function manage(cn, c, a, k, end, dir, stop, p, sig) { // 於 k 開盤進場，管理到 end-1 收盤
  const e = c[k].o, r = Math.abs(e - stop); if (!(r > 0) || r / e < 0.002) return null;
  const tgt = p.tgt ? e + dir * p.tgt * r : null; let st = stop, x = null, ext = e;
  for (let m = k; m < end; m++) {
    const b = c[m];
    if (dir > 0 ? b.l <= st : b.h >= st) { x = dir > 0 ? Math.min(b.o, st) : Math.max(b.o, st); break; }
    if (tgt && (dir > 0 ? b.h >= tgt : b.l <= tgt)) { x = tgt; break; }
    if (p.trail) { ext = dir > 0 ? Math.max(ext, b.h) : Math.min(ext, b.l); const ns = ext - dir * p.trail * 2 * a[m]; st = dir > 0 ? Math.max(st, ns) : Math.min(st, ns); }
    if (m === end - 1) x = b.c;
  }
  if (x == null) return null;
  return { cn, t: c[k].t, tx: c[Math.min(end - 1, c.length - 1)].t + DT["15m"], R: dir * (x - e) / r - COST * e / r, stopPct: r / e, dir, sig };
}
function dayTrade(cn, c, a, i, j, day, p) {
  if (p.fam === "ORB") {
    const s0 = p.sess === "asia" ? day * 864e5 : usOpen(day), s1 = s0 + p.mins * 6e4, last = s0 + 8 * 36e5;
    let hi = -Infinity, lo = Infinity, k = i;
    for (; k < j && c[k].t < s1; k++) if (c[k].t >= s0) { hi = Math.max(hi, c[k].h); lo = Math.min(lo, c[k].l); }
    if (!isFinite(hi)) return null;
    for (; k < j - 1 && c[k].t < last; k++) {
      const dir = c[k].c > hi ? 1 : c[k].c < lo ? -1 : 0; if (!dir) continue;
      if (!allowed(cn, c[k + 1].t, dir, p)) return null;
      const stop = p.stop === "range" ? (dir > 0 ? lo : hi) : (hi + lo) / 2;
      return manage(cn, c, a, k + 1, j, dir, stop, p);
    }
    return null;
  }
  if (p.fam === "DON") { // 突破過去 N 根 15m 高/低點（N=96 約 24 小時）
    for (let k = i; k < j - 4 && c[k].t < day * 864e5 + 20 * 36e5; k++) {
      let hi = -Infinity, lo = Infinity; for (let m = k - p.N; m < k; m++) { hi = Math.max(hi, c[m].h); lo = Math.min(lo, c[m].l); }
      const dir = c[k].c > hi ? 1 : c[k].c < lo ? -1 : 0; if (!dir) continue;
      if (!allowed(cn, c[k + 1].t, dir, p)) continue;
      const e = c[k + 1].o; return manage(cn, c, a, k + 1, j, dir, e - dir * p.k * 2 * a[k], p);
    }
    return null;
  }
  if (p.fam === "MOM") { // 當天開盤到 H 點的漲跌 > th，順勢做到收盤
    const tH = day * 864e5 + p.H * 36e5; let k = i; while (k < j && c[k].t < tH) k++; if (k >= j - 1) return null;
    const ret = c[k - 1].c / c[i].o - 1, dir = ret > p.th ? 1 : ret < -p.th ? -1 : 0; if (!dir) return null;
    if (!allowed(cn, c[k].t, dir, p)) return null;
    const e = c[k].o; return manage(cn, c, a, k, j, dir, e - dir * p.k * 2 * a[k - 1], p);
  }
}
function portfolio(trades, maxPos, risk, from, to) {
  const ts = trades.filter(x => x.t >= from && x.t < to).sort((a, b) => a.t - b.t);
  let eq = 1, peak = 1, dd = 0, open = [], n = 0, wins = 0, sumR = 0, nl = 0, sl = 0;
  const settle = upto => { open.sort((a, b) => a.tx - b.tx); while (open.length && open[0].tx <= upto) { const o = open.shift(); eq += o.amt * o.R; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); } };
  for (const x of ts) { settle(x.t); if (open.length >= maxPos || open.some(o => o.cn === x.cn)) continue; open.push({ ...x, amt: eq * risk }); n++; if (x.R > 0) wins++; sumR += x.R; if (x.dir > 0) { nl++; sl += x.R; } }
  settle(Infinity);
  const Y = ((to === Infinity ? Date.now() : to) - from) / (365 * 864e5);
  return { n, win: n ? +(wins / n * 100).toFixed(1) : 0, avgR: n ? +(sumR / n).toFixed(3) : 0, longR: nl ? +(sl / nl).toFixed(3) : null, shortR: n - nl ? +((sumR - sl) / (n - nl)).toFixed(3) : null, cagr: Y > 0 && eq > 0 ? +((Math.pow(eq, 1 / Y) - 1) * 100).toFixed(1) : -100, dd: +(dd * 100).toFixed(1) };
}

const grid = o => Object.entries(o).reduce((acc, [k, vs]) => acc.flatMap(x => vs.map(v => ({ ...x, [k]: v }))), [{}]);
const common = { filt: ["none", "btc", "full"], sides: ["both", "long"] };
const P = [
  ...grid({ fam: ["ORB"], sess: ["asia", "us"], mins: [30, 60], stop: ["range", "mid"], tgt: [0, 2], trail: [0], ...common }),
  ...grid({ fam: ["DON"], N: [96, 192], k: [1.5, 3], tgt: [0], trail: [0, 3], ...common }),
  ...grid({ fam: ["MOM"], H: [8, 12, 16], th: [0.01, 0.03], k: [2], tgt: [0], trail: [0], ...common }),
];
const t0 = Math.min(...coins.map(cn => data[cn]["15m"][0].t)) + 10 * 864e5, t1 = Math.max(...coins.map(cn => data[cn]["15m"].at(-1).t));
const cut = t0 + SPLIT * (t1 - t0);
const res = [];
for (const p of P) { const tr = coins.flatMap(cn => runCoin(cn, p)); res.push({ p, IS: portfolio(tr, 5, 0.01, t0, cut), OOS: portfolio(tr, 5, 0.01, cut, Infinity), ALL: portfolio(tr, 5, 0.01, t0, Infinity) }); }

const fmtD = t => new Date(t).toISOString().slice(0, 10);
const nm = p => p.fam === "ORB" ? `開盤區間 ${p.sess === "asia" ? "亞洲08:00" : "美股開盤"} ${p.mins}分 停損${p.stop === "range" ? "區間另一端" : "區間中間"} ${p.tgt ? "目標" + p.tgt + "R" : "收盤出"}` : p.fam === "DON" ? `通道突破 ${p.N / 4}小時 停損${p.k}ATR ${p.trail ? "移動停損" : "收盤出"}` : `日內動能 ${p.H + 8}點(台灣) 漲跌>${p.th * 100}% `;
const row = r => `| ${nm(r.p)}｜濾網 ${r.p.filt}｜${r.p.sides === "long" ? "只做多" : "多空"} | ${r.IS.cagr}%/${r.IS.dd}%/${r.IS.n}/${r.IS.avgR} | ${r.OOS.cagr}%/${r.OOS.dd}%/${r.OOS.n}/${r.OOS.win}%/${r.OOS.avgR}（多${r.OOS.longR} 空${r.OOS.shortR}） |`;
const score = s => s.cagr / Math.max(5, s.dd);
const L = ["# 策略實驗室 第三輪：日內交易", "", `產生時間：${new Date().toISOString()}；幣種 ${coins.length}；15 分 K；成本來回 0.14%；每筆風險 1%；同時最多 5 張；每天 UTC 24:00（台灣 08:00）前強制平倉`, `樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}`, "",
  "## 依樣本內 年化/回撤 排序前 25", "", "| 策略 | 樣本內 年化/回撤/筆數/平均R | 樣本外 年化/回撤/筆數/勝率/平均R |", "|---|---|---|"];
res.filter(r => r.IS.n >= 80).sort((a, b) => score(b.IS) - score(a.IS)).slice(0, 25).forEach(r => L.push(row(r)));
L.push("", "## 樣本內、樣本外都賺的（平均R 都 > 0.05）", "", "| 策略 | 樣本內 | 樣本外 |", "|---|---|---|");
res.filter(r => r.IS.n >= 80 && r.OOS.n >= 30 && r.IS.avgR > 0.05 && r.OOS.avgR > 0.05).sort((a, b) => score(b.ALL) - score(a.ALL)).forEach(r => L.push(row(r)));
L.push("", "## 各家族平均（看整體是否有效）", "", "| 家族 | 濾網 | 組數 | 全期平均R 的平均 | 全期正報酬比例 |", "|---|---|---|---|---|");
for (const fam of ["ORB", "DON", "MOM"]) for (const f of ["none", "btc", "full"]) { const g = res.filter(r => r.p.fam === fam && r.p.filt === f); L.push(`| ${fam} | ${f} | ${g.length} | ${(g.reduce((s, r) => s + r.ALL.avgR, 0) / g.length).toFixed(3)} | ${Math.round(g.filter(r => r.ALL.cagr > 0).length / g.length * 100)}% |`); }
await fs.writeFile("lab/report3.md", L.join("\n"));
await fs.writeFile("lab/results3.json", JSON.stringify({ created: new Date().toISOString(), coins, res }));
console.log(L.join("\n"));
