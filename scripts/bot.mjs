// 主力策略機器人（虛擬單，24 小時在 GitHub 上跑，不需開電腦）
// 策略：4h 通道突破（55 根新高）＋ 4h EMA200 之上 ＋ BTC 日線站上 EMA50 ＋ 20 日漲幅前 10 名
// 停損 2×ATR14，收盤跌破前 27 根最低點出場；同時最多 5 張；每筆風險 1%
import fs from "node:fs/promises";
import { ema, atr } from "./ta-core.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = { "User-Agent": "Mozilla/5.0 (radar-bot)", "Accept": "application/json" };
const H4 = 144e5, D1 = 864e5, COST = 0.0014, N = 55, M = 27, K = 2, MAXPOS = 5, RISK = 0.01, UNIV = 40, TOPK = 10, LB = 20;
const EXCLUDE = new Set("MU MUU SKHYNIX TSM SOXL SNDK SNXX QQQ SPY NVDA TSLA AAPL AMZN META GOOGL MSFT COIN MSTR HOOD XAU XAG WDC AMD INTC CRCL PAXG XAUT USDC FDUSD USDE".split(" "));
const FILE = "bot.json";

async function getJSON(url) { for (let t = 0; t < 4; t++) { try { const r = await fetch(url, { headers: UA }); if (r.status === 429) { await sleep(3000 * (t + 1)); continue; } if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); } catch (e) { if (t === 3) throw e; await sleep(1500 * (t + 1)); } } }
async function kl(base, iv, limit) {
  const j = await getJSON(`https://open-api.bingx.com/openApi/swap/v3/quote/klines?symbol=${base}-USDT&interval=${iv}&limit=${limit}`);
  if (j.code !== 0 || !Array.isArray(j.data)) throw new Error("bad data");
  return j.data.map(x => ({ t: +x.time, o: +x.open, h: +x.high, l: +x.low, c: +x.close })).sort((a, b) => a.t - b.t);
}

let st = { equity: 1, open: [], closed: [], lastBar: 0, created: Date.now() };
try { st = Object.assign(st, JSON.parse(await fs.readFile(FILE, "utf8"))); } catch {}

const bx = JSON.parse(await fs.readFile("bingx.json", "utf8"));
const univ = ["BTC", ...bx.symbols.filter(x => x.base !== "BTC" && !EXCLUDE.has(x.base) && !/NCCO|USD$|^\d/.test(x.base)).sort((a, b) => b.qv - a.qv).map(x => x.base)];
const need = new Set([...univ.slice(0, UNIV + 10), ...st.open.map(p => p.base)]);
const D = {};
for (const b of need) { try { const d = await kl(b, "1d", 260), h = await kl(b, "4h", 320); if (d.length >= 60 && h.length >= 260) D[b] = { d, h }; } catch (e) { console.log("略過", b, e.message); } await sleep(80); }
const coins = univ.filter(b => D[b]).slice(0, UNIV);
const now = Date.now();
const closedBars = c => c.filter(x => x.t + H4 <= now);

// 大盤與強勢排名（用前一天已收盤日K）
const lastDayClosed = c => c.filter(x => x.t + D1 <= now);
const bD = lastDayClosed(D.BTC.d), bE = ema(bD.map(x => x.c), 50), bI = bD.length - 1;
const btcUp = bD[bI].c > bE[bI];
const mom = coins.map(b => { const d = lastDayClosed(D[b].d); return d.length > LB ? [b, d.at(-1).c / d.at(-1 - LB).c - 1] : [b, -9]; }).sort((x, y) => y[1] - x[1]);
const top = new Set(mom.slice(0, TOPK).filter(x => x[1] > 0).map(x => x[0]));

// 1) 管理持倉：逐根處理上次之後收盤的 4h K
for (const p of [...st.open]) {
  const c = D[p.base] ? closedBars(D[p.base].h) : null; if (!c) continue;
  for (let i = M; i < c.length; i++) {
    const b = c[i]; if (b.t <= p.lastBar) continue;
    let x = null, why = "";
    if (b.l <= p.stop) { x = Math.min(b.o, p.stop); why = "停損"; }
    else { let lo = Infinity; for (let j = i - M; j < i; j++) lo = Math.min(lo, c[j].l); if (b.c < lo) { x = b.c; why = "跌破通道出場"; } }
    p.lastBar = b.t; p.last = b.c; p.hi = Math.max(p.hi || p.e, b.h);
    if (x != null) {
      const R = (x - p.e) / p.r - COST * p.e / p.r;
      st.equity += p.amt * R;
      st.closed.unshift({ ...p, x, R: +R.toFixed(3), why, tx: b.t + H4 });
      st.open = st.open.filter(q => q !== p); break;
    }
  }
  if (st.open.includes(p)) { const live = D[p.base].h.at(-1).c; p.cur = live; p.curR = +((live - p.e) / p.r).toFixed(2); }
}

// 2) 新訊號：最近收盤的 4h K（以及上次執行後漏掉的）
const watch = [];
for (const b of coins) {
  const all = D[b].h, c = closedBars(all), a = atr(c, 14), e2 = ema(c.map(x => x.c), 200), i = c.length - 1;
  let hi = -Infinity; for (let j = i - N + 1; j <= i; j++) hi = Math.max(hi, c[j].h); // 含最新一根，作為「下一個突破價」
  let hiPrev = -Infinity; for (let j = i - N; j < i; j++) hiPrev = Math.max(hiPrev, c[j].h);
  const cur = all.at(-1).c, okTrend = c[i].c > e2[i], okTop = top.has(b);
  watch.push({ base: b, cur, brk: hi, dist: +((hi / cur - 1) * 100).toFixed(2), ema200: c[i].c > e2[i], top: okTop, mom: +(((mom.find(x => x[0] === b) || [0, 0])[1]) * 100).toFixed(1), stopIf: +(hi - K * a[i]).toPrecision(6) });
  if (!(c[i].t > st.lastBar)) continue;
  const sig = c[i].c > hiPrev && okTrend;
  if (!sig || !btcUp || !okTop) continue;
  if (st.open.length >= MAXPOS || st.open.some(p => p.base === b)) continue;
  const nxt = all.find(x => x.t === c[i].t + H4); const e = nxt ? nxt.o : c[i].c, r = K * a[i];
  st.open.push({ base: b, t: c[i].t + H4, e, r, stop: e - r, amt: st.equity * RISK, lastBar: c[i].t, cur, curR: +((cur - e) / r).toFixed(2), mom: +(((mom.find(x => x[0] === b) || [0, 0])[1]) * 100).toFixed(1) });
}
st.lastBar = Math.max(st.lastBar, closedBars(D.BTC.h).at(-1).t);

// ===== 日內策略：15 分K 突破過去 48 小時高點（192 根），同樣的 BTC＋強勢濾網，只做多 =====
// 停損 = 進場 − 6×ATR14(15m)；每幣每天最多 1 筆；只在 UTC 20:00（台灣 04:00）前進場；UTC 24:00（台灣 08:00）強制平倉
const M15 = 9e5, IN = 192, IK = 6;
const I = st.intra = Object.assign({ equity: 1, open: [], closed: [], lastBar: 0, done: {} }, st.intra || {});
if (!I.lastBar) I.lastBar = Math.floor(now / M15) * M15 - 2 * M15; // 第一次執行不回補舊訊號
const iNeed = new Set([...top, ...I.open.map(p => p.base)]);
for (const b of iNeed) {
  let c; try { c = (await kl(b, "15m", 400)).filter(x => x.t + M15 <= now); } catch (e) { continue; } await sleep(80);
  if (c.length < IN + 20) continue; const a = atr(c, 14);
  for (let i = IN; i < c.length; i++) {
    const bar = c[i], day = Math.floor(bar.t / D1), dayEnd = (day + 1) * D1;
    const p = I.open.find(q => q.base === b);
    if (p) {
      if (bar.t <= p.lastBar) continue;
      let x = null, why = "";
      if (bar.l <= p.stop) { x = Math.min(bar.o, p.stop); why = "停損"; }
      else if (bar.t + M15 >= p.dayEnd) { x = bar.c; why = "收盤平倉（08:00）"; }
      p.lastBar = bar.t; p.cur = bar.c; p.curR = +((bar.c - p.e) / p.r).toFixed(2);
      if (x != null) { const R = (x - p.e) / p.r - COST * p.e / p.r; I.equity += p.amt * R; I.closed.unshift({ ...p, x, R: +R.toFixed(3), why, tx: bar.t + M15 }); I.open = I.open.filter(q => q !== p); }
      continue;
    }
    if (bar.t <= I.lastBar) continue;
    if (bar.t >= day * D1 + 20 * 36e5 || I.done[b] === day || !btcUp || !top.has(b) || I.open.length >= MAXPOS) continue;
    let hi = -Infinity; for (let j = i - IN; j < i; j++) hi = Math.max(hi, c[j].h);
    if (!(bar.c > hi)) continue;
    const e = i + 1 < c.length ? c[i + 1].o : bar.c, r = IK * a[i]; if (!(r > 0) || r / e < 0.002) continue;
    I.done[b] = day;
    I.open.push({ base: b, t: bar.t + M15, e, r, stop: e - r, amt: I.equity * RISK, lastBar: bar.t, dayEnd, cur: bar.c, curR: 0 });
  }
}
I.lastBar = Math.floor(now / M15) * M15 - M15; // 已檢查到最近收盤的那根
for (const k of Object.keys(I.done)) if (I.done[k] < Math.floor(now / D1) - 1) delete I.done[k];
I.closed = I.closed.slice(0, 300);
{ const c2 = I.closed, w = c2.filter(x => x.R > 0).length; I.stats = { n: c2.length, win: c2.length ? Math.round(w / c2.length * 100) : 0, sumR: +c2.reduce((s, x) => s + x.R, 0).toFixed(2), ret: +((I.equity - 1) * 100).toFixed(1) }; }
st.closed = st.closed.slice(0, 300);
const cl = st.closed, wins = cl.filter(x => x.R > 0).length;
st.stats = { n: cl.length, win: cl.length ? Math.round(wins / cl.length * 100) : 0, avgR: cl.length ? +(cl.reduce((s, x) => s + x.R, 0) / cl.length).toFixed(2) : 0, sumR: +cl.reduce((s, x) => s + x.R, 0).toFixed(2), ret: +((st.equity - 1) * 100).toFixed(1) };
st.market = { btcUp, btc: bD[bI].c, btcE50: +bE[bI].toFixed(1), top: [...top] };
st.watch = watch.filter(w => w.top && w.ema200).sort((a, b) => a.dist - b.dist).slice(0, 12);
st.updated = new Date().toISOString();
await fs.writeFile(FILE, JSON.stringify(st));
console.log(JSON.stringify({ market: st.market, open: st.open.map(p => p.base), stats: st.stats, watch: st.watch.map(w => w.base + " " + w.dist + "%") }, null, 1));
