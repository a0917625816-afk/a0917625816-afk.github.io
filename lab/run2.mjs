// 策略實驗室 第二輪：整體帳戶模擬（同時持倉上限、依風險下單、BTC 大盤濾網、強勢幣篩選）＋ 強勢幣輪動
import fs from "node:fs/promises";
import { ema, atr } from "../scripts/ta-core.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = { "User-Agent": "Mozilla/5.0 (strategy-lab)", "Accept": "application/json" };
const DT = { "4h": 144e5, "1d": 864e5 };
const YEARS = { "4h": 3, "1d": 4 };
const COST = 0.0014, SPLIT = 0.65, N_COINS = +(process.env.N_COINS || 40);
const EXCLUDE = new Set("MU MUU SKHYNIX TSM SOXL SNDK SNXX QQQ SPY NVDA TSLA AAPL AMZN META GOOGL MSFT COIN MSTR HOOD XAU XAG WDC AMD INTC CRCL PAXG XAUT USDC FDUSD USDE".split(" "));
async function getJSON(url) { for (let t = 0; t < 4; t++) { try { const r = await fetch(url, { headers: UA }); if (r.status === 429) { await sleep(3000 * (t + 1)); continue; } if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); } catch (e) { if (t === 3) throw e; await sleep(1500 * (t + 1)); } } }
async function klines(base, iv) {
  if (process.env.MOCK) { let seed = [...base].reduce((x, ch) => x + ch.charCodeAt(0), 7) * (iv === "4h" ? 5 : 11); const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; const n = Math.floor(YEARS[iv] * 365 * 864e5 / DT[iv]), out = []; let p = 100; const now = Math.floor(Date.now() / DT[iv]) * DT[iv]; for (let i = 0; i < n; i++) { const sg = 0.01 * Math.sqrt(DT[iv] / 36e5), o = p, c = o * (1 + (rnd() - 0.5) * 2 * sg + Math.sin(i / 300 + seed % 7) * sg * 0.2); out.push({ t: now - (n - i) * DT[iv], o, h: Math.max(o, c) * (1 + rnd() * sg * 0.5), l: Math.min(o, c) * (1 - rnd() * sg * 0.5), c, v: 1000 }); p = c; } return out; }
  const sym = base + "-USDT", start = Date.now() - YEARS[iv] * 365 * 864e5, map = new Map(); let end = Date.now();
  for (let k = 0; k < 40; k++) {
    const j = await getJSON(`https://open-api.bingx.com/openApi/swap/v3/quote/klines?symbol=${sym}&interval=${iv}&limit=1440&endTime=${end}`);
    if (j.code !== 0 || !Array.isArray(j.data) || !j.data.length) break; let oldest = Infinity;
    for (const x of j.data) { const t = +x.time; oldest = Math.min(oldest, t); if (t >= start) map.set(t, { t, o: +x.open, h: +x.high, l: +x.low, c: +x.close, v: +x.volume }); }
    if (oldest <= start || j.data.length < 50) break; end = oldest - 1; await sleep(120);
  }
  return [...map.values()].sort((a, b) => a.t - b.t).slice(0, -1);
}

// ===== 讀取（有快取就用快取）=====
let data = {};
try { data = JSON.parse(await fs.readFile("lab/.cache/data.json", "utf8")); console.log("使用快取", Object.keys(data).length); } catch {}
if (!Object.keys(data).length) {
  const bx = JSON.parse(await fs.readFile("bingx.json", "utf8"));
  const cands = bx.symbols.filter(x => !EXCLUDE.has(x.base) && !/NCCO|USD$|^\d/.test(x.base)).sort((a, b) => b.qv - a.qv);
  if (!cands.some(x => x.base === "BTC")) cands.unshift({ base: "BTC" });
  for (const s of [{ base: "BTC" }, ...cands.filter(x => x.base !== "BTC")]) {
    if (Object.keys(data).length >= N_COINS) break;
    try { const d1 = await klines(s.base, "1d"); if (d1.length < 500) continue; data[s.base] = { "1d": d1, "4h": await klines(s.base, "4h") }; console.log("OK", s.base); } catch (e) { console.log("失敗", s.base, e.message); }
  }
  await fs.mkdir("lab/.cache", { recursive: true }); await fs.writeFile("lab/.cache/data.json", JSON.stringify(data));
}
const coins = Object.keys(data);
console.log("幣種", coins.length);

// ===== 共用：BTC 大盤狀態、強勢排名（都只用「已收盤」的前一天資料）=====
const dayKey = t => Math.floor(t / 864e5);
const btcD = data.BTC["1d"], btcC = btcD.map(x => x.c), btcE200 = ema(btcC, 200), btcE50 = ema(btcC, 50);
const btcState = new Map(); btcD.forEach((b, i) => btcState.set(dayKey(b.t), { e200: b.c > btcE200[i], e50: b.c > btcE50[i] }));
const btcOK = (t, mode) => { if (mode === "none") return true; const s = btcState.get(dayKey(t) - 1); return s ? s[mode] : false; };
const dayClose = {}; coins.forEach(cn => { const m = new Map(); data[cn]["1d"].forEach(b => m.set(dayKey(b.t), b.c)); dayClose[cn] = m; });
const allDays = [...new Set(coins.flatMap(cn => data[cn]["1d"].map(b => dayKey(b.t))))].sort((a, b) => a - b);
const rankCache = new Map();
function topSet(day, L, K) { const key = day + "|" + L + "|" + K; if (rankCache.has(key)) return rankCache.get(key);
  const sc = []; for (const cn of coins) { const a = dayClose[cn].get(day), b = dayClose[cn].get(day - L); if (a && b) sc.push([cn, a / b - 1]); }
  sc.sort((x, y) => y[1] - x[1]); const s = new Set(sc.slice(0, K).filter(x => x[1] > 0).map(x => x[0])); rankCache.set(key, s); return s; }

// ===== 單幣通道突破（只做多），訊號收盤確認、下一根開盤進場 =====
function donTrades(cn, p) {
  const c = data[cn]["4h"], a = atr(c, 14), cl = c.map(x => x.c), e200 = ema(cl, 200), N = p.N, M = Math.max(5, Math.round(N / 2));
  const hi = new Array(c.length).fill(NaN), lo = new Array(c.length).fill(NaN);
  for (let i = N; i < c.length; i++) { let h = -Infinity; for (let j = i - N; j < i; j++) h = Math.max(h, c[j].h); hi[i] = h; }
  for (let i = M; i < c.length; i++) { let l = Infinity; for (let j = i - M; j < i; j++) l = Math.min(l, c[j].l); lo[i] = l; }
  const tr = []; let pos = null;
  for (let i = 1; i < c.length; i++) {
    const b = c[i];
    if (pos) { let x = null;
      if (b.l <= pos.stop) x = Math.min(b.o, pos.stop);
      if (x == null && p.exit === "don" && b.c < lo[i]) x = b.c;
      if (x != null) { tr.push({ cn, t: pos.t, tx: b.t + DT["4h"], R: (x - pos.e) / pos.r - COST * pos.e / pos.r, stopPct: pos.r / pos.e }); pos = null; }
      else { pos.hh = Math.max(pos.hh, b.h); if (p.exit === "chand") pos.stop = Math.max(pos.stop, pos.hh - 3 * a[i]); } }
    if (!pos && i < c.length - 1 && a[i] > 0 && i > Math.max(N, 200) && b.c > hi[i] && b.c > e200[i]) {
      const t = c[i + 1].t;
      if (!btcOK(t, p.btc)) continue;
      if (p.mom && !topSet(dayKey(t) - 1, 20, p.mom).has(cn)) continue;
      const e = c[i + 1].o, r = p.k * a[i]; pos = { e, r, stop: e - r, t, hh: e };
    }
  }
  return tr;
}
// ===== 整體帳戶：同時最多 maxPos 張，每筆風險 = 當下權益 × risk =====
function portfolio(trades, maxPos, risk, from, to) {
  const ts = trades.filter(x => x.t >= from && x.t < to).sort((a, b) => a.t - b.t);
  let eq = 1, peak = 1, dd = 0, open = [], n = 0, wins = 0, sumR = 0, maxLev = 0; const curve = [];
  const settle = upto => { open.sort((a, b) => a.tx - b.tx); while (open.length && open[0].tx <= upto) { const o = open.shift(); eq += o.amt * o.R; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); curve.push([o.tx, eq]); } };
  for (const x of ts) {
    settle(x.t); if (open.length >= maxPos) continue; if (open.some(o => o.cn === x.cn)) continue;
    const amt = eq * risk; open.push({ ...x, amt }); n++; if (x.R > 0) wins++; sumR += x.R;
    maxLev = Math.max(maxLev, open.reduce((s, o) => s + o.amt / o.stopPct, 0) / eq);
  }
  settle(Infinity);
  const yrs = (to === Infinity ? Date.now() : to) - from; const Y = yrs / (365 * 864e5);
  return { n, win: n ? +(wins / n * 100).toFixed(1) : 0, avgR: n ? +(sumR / n).toFixed(3) : 0, ret: +((eq - 1) * 100).toFixed(1), cagr: Y > 0 && eq > 0 ? +((Math.pow(eq, 1 / Y) - 1) * 100).toFixed(1) : null, dd: +(dd * 100).toFixed(1), maxLev: +maxLev.toFixed(1) };
}

// ===== 強勢幣輪動（日線）：每 R 天換一次，持有過去 L 天最強的 K 個（報酬需 > 0），可加 BTC 濾網 =====
function rotation(p, fromDay, toDay) {
  let eq = 1, peak = 1, dd = 0, w = {}, last = -1e9; const daysIn = allDays.filter(d => d >= fromDay && d < toDay);
  for (let k = 1; k < daysIn.length; k++) {
    const d = daysIn[k], prev = daysIn[k - 1];
    let r = 0; for (const [cn, wt] of Object.entries(w)) { const a = dayClose[cn].get(d), b = dayClose[cn].get(prev); if (a && b) r += wt * (a / b - 1); }
    eq *= 1 + r; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak);
    if (d - last >= p.R) {
      const ok = btcOK(d * 864e5 + 864e5, p.btc); const s = ok ? [...topSet(d, p.L, p.K)] : [];
      const nw = {}; s.forEach(cn => nw[cn] = 1 / p.K);
      let turn = 0; new Set([...Object.keys(w), ...Object.keys(nw)]).forEach(cn => turn += Math.abs((nw[cn] || 0) - (w[cn] || 0)));
      eq *= 1 - turn * COST / 2; w = nw; last = d;
    }
  }
  const Y = daysIn.length / 365;
  return { ret: +((eq - 1) * 100).toFixed(1), cagr: Y > 0 && eq > 0 ? +((Math.pow(eq, 1 / Y) - 1) * 100).toFixed(1) : null, dd: +(dd * 100).toFixed(1) };
}
function buyHold(cn, fromDay, toDay) { const ds = allDays.filter(d => d >= fromDay && d < toDay && dayClose[cn].get(d)); if (ds.length < 2) return null;
  let peak = 0, dd = 0; ds.forEach(d => { const v = dayClose[cn].get(d); peak = Math.max(peak, v); dd = Math.max(dd, 1 - v / peak); });
  const a = dayClose[cn].get(ds[0]), b = dayClose[cn].get(ds.at(-1)), Y = ds.length / 365; return { ret: +((b / a - 1) * 100).toFixed(1), cagr: +((Math.pow(b / a, 1 / Y) - 1) * 100).toFixed(1), dd: +(dd * 100).toFixed(1) }; }

// ===== 執行 =====
const t4lo = Math.min(...coins.map(cn => data[cn]["4h"][0].t)), t4hi = Math.max(...coins.map(cn => data[cn]["4h"].at(-1).t));
const cut4 = t4lo + 210 * DT["4h"] + SPLIT * (t4hi - t4lo - 210 * DT["4h"]);
const grid = o => Object.entries(o).reduce((acc, [k, vs]) => acc.flatMap(x => vs.map(v => ({ ...x, [k]: v }))), [{}]);
const res = [];
for (const p of grid({ N: [20, 55], exit: ["don", "chand"], k: [2, 3], btc: ["none", "e200", "e50"], mom: [0, 10, 5] })) {
  const tr = coins.flatMap(cn => donTrades(cn, p));
  for (const maxPos of [5, 10]) res.push({ p: { ...p, maxPos }, IS: portfolio(tr, maxPos, 0.01, t4lo, cut4), OOS: portfolio(tr, maxPos, 0.01, cut4, Infinity), ALL: portfolio(tr, maxPos, 0.01, t4lo, Infinity) });
}
const d1lo = allDays[0] + 30, d1hi = allDays.at(-1) + 1, cutD = Math.floor(d1lo + SPLIT * (d1hi - d1lo));
const rot = [];
for (const p of grid({ L: [7, 14, 28], K: [3, 5, 10], R: [1, 7], btc: ["none", "e200", "e50"] })) rot.push({ p, IS: rotation(p, d1lo, cutD), OOS: rotation(p, cutD, d1hi), ALL: rotation(p, d1lo, d1hi) });
const bh = { IS: buyHold("BTC", d1lo, cutD), OOS: buyHold("BTC", cutD, d1hi), ALL: buyHold("BTC", d1lo, d1hi) };

const fmtD = t => new Date(t).toISOString().slice(0, 10);
const L = ["# 策略實驗室 第二輪：整體帳戶模擬", "", `產生時間：${new Date().toISOString()}；幣種 ${coins.length} 個；成本每筆來回 0.14%；每筆風險 = 權益 1%（回撤和報酬大約跟這個比例成正比）`, "",
  `通道突破（4h）：樣本內 ${fmtD(t4lo)}～${fmtD(cut4)}，樣本外 ${fmtD(cut4)}～${fmtD(t4hi)}`, `輪動（1d）：樣本內 ${fmtD(d1lo * 864e5)}～${fmtD(cutD * 864e5)}，樣本外 ${fmtD(cutD * 864e5)}～${fmtD(d1hi * 864e5)}`, "",
  `對照組：BTC 買進持有｜樣本內 年化 ${bh.IS?.cagr}% 回撤 ${bh.IS?.dd}%｜樣本外 年化 ${bh.OOS?.cagr}% 回撤 ${bh.OOS?.dd}%`, "",
  "## 通道突破＋濾網（依樣本內 年化/回撤 排序前 15，看樣本外）", "", "| 參數 | 樣本內 年化/回撤/筆數/平均R | 樣本外 年化/回撤/筆數/勝率/平均R/最大槓桿 |", "|---|---|---|"];
const score = s => (s.cagr ?? -99) / Math.max(5, s.dd);
res.filter(r => r.IS.n >= 60).sort((a, b) => score(b.IS) - score(a.IS)).slice(0, 15).forEach(r => L.push(`| ${JSON.stringify(r.p)} | ${r.IS.cagr}%/${r.IS.dd}%/${r.IS.n}/${r.IS.avgR} | ${r.OOS.cagr}%/${r.OOS.dd}%/${r.OOS.n}/${r.OOS.win}%/${r.OOS.avgR}/${r.OOS.maxLev}x |`));
L.push("", "## 濾網效果（通道突破 N=20、don 出場、k=2、最多 5 張，只改濾網）", "", "| BTC 濾網 | 強勢篩選 | 全期 年化/回撤/筆數 | 樣本外 年化/回撤 |", "|---|---|---|---|");
res.filter(r => r.p.N === 20 && r.p.exit === "don" && r.p.k === 2 && r.p.maxPos === 5).forEach(r => L.push(`| ${r.p.btc} | ${r.p.mom || "無"} | ${r.ALL.cagr}%/${r.ALL.dd}%/${r.ALL.n} | ${r.OOS.cagr}%/${r.OOS.dd}% |`));
L.push("", "## 強勢幣輪動（依樣本內 年化/回撤 排序前 15，看樣本外）", "", "| 參數 | 樣本內 年化/回撤 | 樣本外 年化/回撤 | 全期 年化/回撤 |", "|---|---|---|---|");
rot.sort((a, b) => score(b.IS) - score(a.IS)).slice(0, 15).forEach(r => L.push(`| ${JSON.stringify(r.p)} | ${r.IS.cagr}%/${r.IS.dd}% | ${r.OOS.cagr}%/${r.OOS.dd}% | ${r.ALL.cagr}%/${r.ALL.dd}% |`));
await fs.writeFile("lab/report2.md", L.join("\n"));
await fs.writeFile("lab/results2.json", JSON.stringify({ created: new Date().toISOString(), coins, res, rot, bh }));
console.log(L.join("\n"));
