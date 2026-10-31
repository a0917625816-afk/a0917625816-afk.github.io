// 主力策略機器人（虛擬單，24 小時在 GitHub 上跑，不需開電腦）
// 策略：4h 通道突破（55 根新高）＋ 4h EMA200 之上 ＋ BTC 日線站上 EMA50 ＋ 20 日漲幅前 10 名
// 停損 2×ATR14，收盤跌破前 27 根最低點出場；同時最多 5 張；每筆風險 1%
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { ema, sma, atr, prep, levels as srLevels, fibAt } from "./ta-core.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = { "User-Agent": "Mozilla/5.0 (radar-bot)", "Accept": "application/json" };
const H4 = 144e5, D1 = 864e5, COST = 0.0014, N = 55, M = 27, K = 2, MAXPOS = 5, RISK = 0.01, UNIV = 40, TOPK = 10, LB = 20;
const EXCLUDE = new Set("MU MUU SKHYNIX TSM SOXL SNDK SNXX QQQ SPY NVDA TSLA AAPL AMZN META GOOGL MSFT COIN MSTR HOOD XAU XAG WDC AMD INTC CRCL PAXG XAUT USDC FDUSD USDE".split(" "));
const FILE = "bot.json";

async function getJSON(url) { for (let t = 0; t < 4; t++) { try { const r = await fetch(url, { headers: UA }); if (r.status === 429) { await sleep(3000 * (t + 1)); continue; } if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); } catch (e) { if (t === 3) throw e; await sleep(1500 * (t + 1)); } } }
async function kl(base, iv, limit) {
  const j = await getJSON(`https://open-api.bingx.com/openApi/swap/v3/quote/klines?symbol=${base}-USDT&interval=${iv}&limit=${limit}`);
  if (j.code !== 0 || !Array.isArray(j.data)) throw new Error("bad data");
  return j.data.map(x => ({ t: +x.time, o: +x.open, h: +x.high, l: +x.low, c: +x.close, v: +x.volume })).sort((a, b) => a.t - b.t);
}

let st = { equity: 1, open: [], closed: [], lastBar: 0, created: Date.now() };
try { st = Object.assign(st, JSON.parse(await fs.readFile(FILE, "utf8"))); } catch {}

const bx = JSON.parse(await fs.readFile("bingx.json", "utf8"));
const univ = ["BTC", ...bx.symbols.filter(x => x.base !== "BTC" && !EXCLUDE.has(x.base) && !/NCCO|USD$|^\d/.test(x.base)).sort((a, b) => b.qv - a.qv).map(x => x.base)];
const need = new Set([...univ.slice(0, UNIV + 10), ...st.open.map(p => p.base), ...((st.b || {}).open || []).map(p => p.base)]);
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
// A 版＝原版；B 版＝漲到 1R 先平 1/3、剩下停損移到成本（10/24 起兩版並行比較）
const B = st.b = Object.assign({ equity: 1, open: [], closed: [] }, st.b || {});
function manageSwing(S, partial) {
  for (const p of [...S.open]) {
    const c = D[p.base] ? closedBars(D[p.base].h) : null; if (!c) continue;
    p.real ||= 0;
    for (let i = M; i < c.length; i++) {
      const b = c[i]; if (b.t <= p.lastBar) continue;
      let x = null, why = "";
      if (b.l <= p.stop) { x = Math.min(b.o, p.stop); why = p.took ? "保本出場" : "停損"; }
      else {
        if (partial && !p.took && b.h >= p.e + p.r) { p.took = true; p.real += 1 / 3; p.stop = Math.max(p.stop, p.e + 0.05 * p.r); }
        let lo = Infinity; for (let j = i - M; j < i; j++) lo = Math.min(lo, c[j].l); if (b.c < lo) { x = b.c; why = "跌破通道出場"; }
      }
      p.lastBar = b.t; p.last = b.c; p.hi = Math.max(p.hi || p.e, b.h);
      if (x != null) {
        const left = p.took ? 2 / 3 : 1, R = p.real + left * (x - p.e) / p.r - COST * p.e / p.r;
        S.equity += p.amt * R;
        S.closed.unshift({ ...p, x, R: +R.toFixed(3), why, tx: b.t + H4 });
        S.open = S.open.filter(q => q !== p); break;
      }
    }
    if (S.open.includes(p)) { const live = D[p.base].h.at(-1).c; p.cur = live; p.curR = +((p.real || 0) + (p.took ? 2 / 3 : 1) * (live - p.e) / p.r).toFixed(2); }
  }
}
manageSwing(st, false); manageSwing(B, true);

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
  const nxt = all.find(x => x.t === c[i].t + H4); const e = nxt ? nxt.o : c[i].c, r = K * a[i];
  for (const S of [st, B]) {
    if (S.open.length >= MAXPOS || S.open.some(p => p.base === b)) continue;
    S.open.push({ base: b, t: c[i].t + H4, e, r, stop: e - r, amt: S.equity * RISK, lastBar: c[i].t, cur, curR: +((cur - e) / r).toFixed(2), real: 0, took: false, mom: +(((mom.find(x => x[0] === b) || [0, 0])[1]) * 100).toFixed(1) });
  }
}
st.lastBar = Math.max(st.lastBar, closedBars(D.BTC.h).at(-1).t);

// ===== 日內策略：15 分K 突破過去 48 小時高點（192 根），同樣的 BTC＋強勢濾網，只做多 =====
// 進場品質：突破 K 量 >1.5 倍均量、收在上方 40%（10/24 第四輪回測加入）；近 30 天日均成交額 ≥ 1 億 U（10/29 第五輪加入）
// 停損 = 進場 − 6×ATR14(15m)；每幣每天最多 1 筆；只在 UTC 20:00（台灣 04:00）前進場；UTC 24:00（台灣 08:00）強制平倉
const M15 = 9e5, IN = 192, IK = 6, LIQ_MIN = 100e6;
// 第五輪回測合格（10/29）：近 30 天 Binance 合約日均成交額 ≥ 1 億 U 才做日內（Binance 沒上這個合約＝不做）
// 回測：勝率 43.7%→46.2%、平均 +0.059R→+0.080R、最大回撤 23.4%→17.2%（樣本內外都合格）
// 資料來自 data.binance.vision 公開日K檔，每天每幣只抓一次並存在 bot.json 的 liq
const LQ = st.liq = (st.liq && st.liq.day === Math.floor(now / D1)) ? st.liq : { day: Math.floor(now / D1), v: {} };
async function liqOf(b) {
  if (b in LQ.v) return LQ.v[b];
  const sym = b + "USDT"; let sum = 0, n = 0, miss404 = 0, err = 0;
  for (let k = 1; k <= 30; k++) {
    const ds = new Date((LQ.day - k) * D1).toISOString().slice(0, 10);
    try {
      const r = await fetch(`https://data.binance.vision/data/futures/um/daily/klines/${sym}/1d/${sym}-1d-${ds}.zip`);
      if (r.status === 404) { miss404++; continue; } if (!r.ok) { err++; continue; }
      const f = `/tmp/liq-${sym}.zip`; await fs.writeFile(f, Buffer.from(await r.arrayBuffer()));
      for (const line of execFileSync("unzip", ["-p", f]).toString().split("\n")) { const x = line.split(","); if (x.length < 6 || isNaN(+x[0])) continue; sum += +x[4] * +x[5]; n++; }
    } catch (e) { err++; }
  }
  if (err > 5) return null; // 網路有問題：這次先不進場，也不記下來
  const v = n >= 20 ? sum / n : 0; LQ.v[b] = Math.round(v); return v;
}
// 第八輪回測合格（10/31）：新增「日內B」＝同樣規則但成交額門檻拉到 ≥5 億 U，獨立一組並列比較，不動原日內組
// 回測（分級成本）：勝率 44.7%→48.0%（樣本外 46.1%→51.2%）、平均 +0.029R→+0.088R（樣本外 +0.176→+0.314）、回撤 19.3%→13%（樣本外 10.2%→2%）
const LIQ_MIN2 = 500e6;
const I = st.intra = Object.assign({ equity: 1, open: [], closed: [], lastBar: 0, done: {} }, st.intra || {});
const I2 = st.intra2 = Object.assign({ equity: 1, open: [], closed: [], lastBar: 0, done: {}, created: now }, st.intra2 || {});
const IGROUPS = [[I, LIQ_MIN], [I2, LIQ_MIN2]];
for (const [S] of IGROUPS) if (!S.lastBar) S.lastBar = Math.floor(now / M15) * M15 - 2 * M15; // 第一次執行不回補舊訊號
const iNeed = new Set([...top, ...I.open.map(p => p.base), ...I2.open.map(p => p.base)]);
for (const b of iNeed) {
  let c; try { c = (await kl(b, "15m", 400)).filter(x => x.t + M15 <= now); } catch (e) { continue; } await sleep(80);
  if (c.length < IN + 20) continue; const a = atr(c, 14), v20 = sma(c.map(x => x.v), 20);
  for (const [S, lmin] of IGROUPS) for (let i = IN; i < c.length; i++) {
    const bar = c[i], day = Math.floor(bar.t / D1), dayEnd = (day + 1) * D1;
    const p = S.open.find(q => q.base === b);
    if (p) {
      if (bar.t <= p.lastBar) continue;
      let x = null, why = "";
      if (bar.l <= p.stop) { x = Math.min(bar.o, p.stop); why = "停損"; }
      else if (bar.t + M15 >= p.dayEnd) { x = bar.c; why = "收盤平倉（08:00）"; }
      p.lastBar = bar.t; p.cur = bar.c; p.curR = +((bar.c - p.e) / p.r).toFixed(2);
      if (x != null) { const R = (x - p.e) / p.r - COST * p.e / p.r; S.equity += p.amt * R; S.closed.unshift({ ...p, x, R: +R.toFixed(3), why, tx: bar.t + M15 }); S.open = S.open.filter(q => q !== p); }
      continue;
    }
    if (bar.t <= S.lastBar) continue;
    if (bar.t >= day * D1 + 20 * 36e5 || S.done[b] === day || !btcUp || !top.has(b) || S.open.length >= MAXPOS) continue;
    let hi = -Infinity; for (let j = i - IN; j < i; j++) hi = Math.max(hi, c[j].h);
    if (!(bar.c > hi)) continue;
    S.done[b] = day; // 每天只看當天第一次突破（跟回測一致）
    // 第四輪回測合格的品質濾網：突破那根量 > 前 20 根平均 1.5 倍，且收在 K 棒上方 40% 以內
    const rng = bar.h - bar.l; if (!(bar.v > 1.5 * v20[i]) || !(rng > 0 && (bar.c - bar.l) / rng >= 0.6)) continue;
    const lv = await liqOf(b); if (!(lv >= lmin)) { console.log(S === I ? "日內略過（成交額不足）" : "日內B略過（成交額不足）", b, lv); continue; }
    const e = i + 1 < c.length ? c[i + 1].o : bar.c, r = IK * a[i]; if (!(r > 0) || r / e < 0.002) continue;
    S.open.push({ base: b, t: bar.t + M15, e, r, stop: e - r, amt: S.equity * RISK, lastBar: bar.t, dayEnd, cur: bar.c, curR: 0 });
  }
}
for (const [S] of IGROUPS) {
  S.lastBar = Math.floor(now / M15) * M15 - M15; // 已檢查到最近收盤的那根
  for (const k of Object.keys(S.done)) if (S.done[k] < Math.floor(now / D1) - 1) delete S.done[k];
  S.closed = S.closed.slice(0, 300);
  const c2 = S.closed, w = c2.filter(x => x.R > 0).length; S.stats = { n: c2.length, win: c2.length ? Math.round(w / c2.length * 100) : 0, sumR: +c2.reduce((s, x) => s + x.R, 0).toFixed(2), ret: +((S.equity - 1) * 100).toFixed(1) };
}
st.closed = st.closed.slice(0, 300);
const cl = st.closed, wins = cl.filter(x => x.R > 0).length;
st.stats = { n: cl.length, win: cl.length ? Math.round(wins / cl.length * 100) : 0, avgR: cl.length ? +(cl.reduce((s, x) => s + x.R, 0) / cl.length).toFixed(2) : 0, sumR: +cl.reduce((s, x) => s + x.R, 0).toFixed(2), ret: +((st.equity - 1) * 100).toFixed(1) };
B.closed = B.closed.slice(0, 300);
{ const c2 = B.closed, w = c2.filter(x => x.R > 0).length; B.stats = { n: c2.length, win: c2.length ? Math.round(w / c2.length * 100) : 0, sumR: +c2.reduce((s, x) => s + x.R, 0).toFixed(2), ret: +((B.equity - 1) * 100).toFixed(1) }; }
// 5) 綜合決策員的手動模擬單（intel.json 的 manualVirtual）：只做多、限價進場、獨立紀錄，不影響 A/B/日內
try {
  const MN = st.manual = Object.assign({ equity: 1, open: [], closed: [], waiting: {}, done: {} }, st.manual || {});
  let mv = []; try { mv = JSON.parse(await fs.readFile("intel.json", "utf8")).manualVirtual || []; } catch (e) {}
  const EXPIRE = 48 * 36e5, MAXHOLD = 72 * 36e5, MAXMAN = 3;
  const valid = o => o && o.id && o.base && o.side === "long" && o.entry > 0 && o.stop > 0 && o.target > 0 && o.stop < o.entry && o.entry < o.target && !MN.done[o.id];
  const orders = mv.filter(valid);
  for (const o of orders) if (!MN.waiting[o.id] && !MN.open.find(q => q.id === o.id)) MN.waiting[o.id] = { ...o, t0: now };
  for (const id of Object.keys(MN.waiting)) {
    const w = MN.waiting[id];
    if (!orders.find(o => o.id === id)) { delete MN.waiting[id]; continue; }
    if (now - w.t0 > EXPIRE) { MN.done[id] = 1; delete MN.waiting[id]; MN.closed.unshift({ id, base: w.base, side: "做多", e: w.entry, x: null, R: 0, why: "未成交過期", reason: w.reason || "", t: w.t0, tx: now, amt: 0 }); continue; }
    if (MN.open.length >= MAXMAN) continue;
    let c; try { c = (await kl(w.base, "15m", 400)).filter(x => x.t + M15 <= now); } catch (e) { continue; } await sleep(80);
    const hit = c.find(x => x.t + M15 > w.t0 && x.l <= w.entry);
    if (!hit) continue;
    const e = Math.min(hit.o, w.entry), r = w.entry - w.stop;
    MN.open.push({ id, base: w.base, e, r, stop: w.stop, target: w.target, reason: w.reason || "", t: hit.t + M15, lastBar: hit.t, amt: MN.equity * RISK, cur: hit.c, curR: 0 });
    delete MN.waiting[id];
  }
  for (const p of [...MN.open]) {
    let c; try { c = (await kl(p.base, "15m", 400)).filter(x => x.t + M15 <= now); } catch (e) { continue; } await sleep(80);
    for (const b of c) {
      if (b.t <= p.lastBar) continue;
      let x = null, why = "";
      if (b.l <= p.stop) { x = Math.min(b.o, p.stop); why = "停損"; }
      else if (b.h >= p.target) { x = Math.max(b.o, p.target); why = "停利"; }
      else if (b.t - p.t >= MAXHOLD) { x = b.c; why = "超時平倉"; }
      p.lastBar = b.t; p.cur = b.c; p.curR = +((b.c - p.e) / p.r).toFixed(2);
      if (x != null) {
        const R = (x - p.e) / p.r - COST * p.e / p.r;
        MN.equity += p.amt * R;
        MN.closed.unshift({ id: p.id, base: p.base, side: "做多", e: p.e, x, R: +R.toFixed(3), why, reason: p.reason, t: p.t, tx: b.t + M15, amt: p.amt });
        MN.done[p.id] = 1; MN.open = MN.open.filter(q => q !== p); break;
      }
    }
  }
  MN.closed = MN.closed.slice(0, 300);
  { const c2 = MN.closed.filter(x => x.R !== undefined && x.amt), w = c2.filter(x => x.R > 0).length; MN.stats = { n: c2.length, win: c2.length ? Math.round(w / c2.length * 100) : 0, sumR: +c2.reduce((q, x) => q + x.R, 0).toFixed(2), ret: +((MN.equity - 1) * 100).toFixed(1) }; }
} catch (e) { console.log("手動模擬單略過（錯誤）", e.message); }

// ===== 6) 盤前資料快照（給劇本員用，10/31 新增）：BTC、ETH、SOL＋強勢前 3 名的關鍵價位，全部來自交易所 K 線，不靠猜 =====
const H1 = 36e5, PX = v => (v == null || !isFinite(v)) ? null : +(+v).toPrecision(6);
const LV = { updated: new Date().toISOString(), coins: {} };
const lvSyms = [...new Set(["BTC", "ETH", "SOL", ...[...top].slice(0, 3)])];
for (const b of lvSyms) {
  try {
    const h1 = (await kl(b, "1h", 400)).filter(x => x.t + H1 <= now); await sleep(80);
    const h4 = D[b] ? closedBars(D[b].h) : (await kl(b, "4h", 320)).filter(x => x.t + H4 <= now);
    const d1 = D[b] ? D[b].d : await kl(b, "1d", 60);
    if (h1.length < 220 || h4.length < 220) continue;
    const P1 = prep(h1, H1), P4 = prep(h4, H4), i1 = h1.length - 1, i4 = h4.length - 1, last = (await kl(b, "15m", 2)).at(-1)?.c ?? h1[i1].c;
    const day0 = Math.floor(now / D1) * D1, yd = d1.filter(x => x.t === day0 - D1)[0];
    const rng = (from, to) => { const xs = h1.filter(x => x.t >= from && x.t < to); return xs.length ? { hi: PX(Math.max(...xs.map(x => x.h))), lo: PX(Math.min(...xs.map(x => x.l))) } : null; };
    // 時段（UTC）：亞洲 00–07、倫敦 07–13、紐約 13–21
    const ses = d => ({ asia: rng(d, d + 7 * H1), london: rng(d + 7 * H1, d + 13 * H1), ny: rng(d + 13 * H1, d + 21 * H1) });
    const sr = (P, i) => srLevels(P, i).map(x => ({ p: PX(x.price), n: x.touches })).filter(x => Math.abs(x.p / last - 1) < 0.15);
    const fu = fibAt(P4, i4, 1), fd = fibAt(P4, i4, -1), fib = f => ({ hi: PX(f.hi), lo: PX(f.lo), r382: PX(f.lvl(0.382)), r5: PX(f.lvl(0.5)), r618: PX(f.lvl(0.618)), r786: PX(f.lvl(0.786)) });
    LV.coins[b] = {
      last: PX(last), pdh: PX(yd?.h), pdl: PX(yd?.l), pdc: PX(yd?.c),
      h24: PX(Math.max(...h1.slice(-24).map(x => x.h))), l24: PX(Math.min(...h1.slice(-24).map(x => x.l))),
      ema1h: { e20: PX(P1.e20[i1]), e50: PX(P1.e50[i1]), e200: PX(P1.e200[i1]) },
      ema4h: { e20: PX(P4.e20[i4]), e50: PX(P4.e50[i4]), e200: PX(P4.e200[i4]) },
      atr1h: PX(P1.atr[i1]), atr4h: PX(P4.atr[i4]), rsi1h: +(P1.rsi[i1] || 0).toFixed(1), rsi4h: +(P4.rsi[i4] || 0).toFixed(1),
      sr1h: sr(P1, i1).slice(-12), sr4h: sr(P4, i4).slice(-12),
      fibUp4h: fib(fu), fibDown4h: fib(fd),
      sesToday: ses(day0), sesYday: ses(day0 - D1),
    };
  } catch (e) { console.log("快照略過", b, e.message); }
}
st.levels = LV;

// ===== 8) 戰情室資料（11/1 新增）：BTC 近 72 根 1h K、成交額前 20 大的幣掃描（劇本型態候選＋跟 BTC 的連動）=====
// 這裡只是「候選清單」給人看，不會自動下單；型態定義與 intel.json 的 patterns 一致
try {
  const corr = (a, b) => { const n = Math.min(a.length, b.length); if (n < 30) return null; a = a.slice(-n); b = b.slice(-n); const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let sab = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; sa += da * da; sb += db * db; } return sa && sb ? sab / Math.sqrt(sa * sb) : null; };
  const H1c = {};
  const get1h = async b => { if (H1c[b]) return H1c[b]; const c = (await kl(b, "1h", 400)).filter(x => x.t + H1 <= now); await sleep(80); H1c[b] = c; return c; };
  const btc1 = await get1h("BTC"), btcRet = new Map(); for (let i = 1; i < btc1.length; i++) btcRet.set(btc1[i].t, btc1[i].c / btc1[i - 1].c - 1);
  const btcChg24 = btc1.length > 24 ? btc1.at(-1).c / btc1.at(-25).c - 1 : 0;
  LV.btcSpark = btc1.slice(-72).map(x => [x.t, PX(x.o), PX(x.h), PX(x.l), PX(x.c)]);
  LV.btcChg24 = +(btcChg24 * 100).toFixed(2);
  // 週劇本用：BTC 週線（週一 00:00 UTC 起算）、日線、最近的攻擊K（實體 ≥0.7×ATR14 且收在 K 線最高或最低 1/4）
  const bdAll = D.BTC.d.filter(x => x.t + D1 <= now), wk = [];
  for (const b of bdAll) { const ws = b.t - ((Math.floor(b.t / D1) + 3) % 7) * D1; const last = wk[wk.length - 1]; if (!last || last.t !== ws) wk.push({ t: ws, o: b.o, h: b.h, l: b.l, c: b.c }); else { last.h = Math.max(last.h, b.h); last.l = Math.min(last.l, b.l); last.c = b.c; } }
  const wa = atr(wk, 14), da = atr(bdAll, 14);
  LV.btcWeekly = wk.slice(-12).map(x => [x.t, PX(x.o), PX(x.h), PX(x.l), PX(x.c)]);
  LV.btcWeekAtr = PX(wa.at(-1)); LV.btcDayAtr = PX(da.at(-1));
  LV.btcDaily = bdAll.slice(-30).map(x => [x.t, PX(x.o), PX(x.h), PX(x.l), PX(x.c)]);
  const attack = (c, a, tf, from) => { const out = []; for (let i = Math.max(15, from); i < c.length; i++) { const b = c[i], rng = b.h - b.l, body = Math.abs(b.c - b.o); if (!(a[i] > 0) || rng <= 0 || body < 0.7 * a[i]) continue; const up = b.c > b.o && (b.c - b.l) / rng >= 0.75, dn = b.c < b.o && (b.h - b.c) / rng >= 0.75; if (up || dn) out.push({ tf, t: b.t, dir: up ? "up" : "down", o: PX(b.o), h: PX(b.h), l: PX(b.l), c: PX(b.c), mid: PX((b.o + b.c) / 2), bodyAtr: +(body / a[i]).toFixed(2) }); } return out; };
  const b4 = closedBars(D.BTC.h), a4 = atr(b4, 14);
  LV.btcAttack = [...attack(bdAll, da, "1d", bdAll.length - 30), ...attack(b4, a4, "4h", b4.length - 84)].sort((x, y) => y.t - x.t).slice(0, 12);
  const scanSyms = [...new Set([...coins.slice(0, 20), ...top])].filter(b => b !== "BTC");
  const out = [];
  for (const b of scanSyms) {
    try {
      const h1 = await get1h(b); const h4 = D[b] ? closedBars(D[b].h) : null; const d1 = D[b] ? D[b].d : null;
      if (!h4 || h1.length < 220 || h4.length < 220) continue;
      const P1 = prep(h1, H1), P4 = prep(h4, H4), i1 = h1.length - 1, i4 = h4.length - 1, last = h1[i1].c, a1 = P1.atr[i1];
      const day0 = Math.floor(now / D1) * D1, yd = d1.find(x => x.t === day0 - D1);
      const t4 = last > P4.e50[i4] && P4.e50[i4] > P4.e200[i4] ? 1 : last < P4.e50[i4] && P4.e50[i4] < P4.e200[i4] ? -1 : 0;
      const t1 = P1.e20[i1] > P1.e50[i1] ? 1 : -1;
      const prev = h1.slice(-27, -3), h24 = Math.max(...prev.map(x => x.h)), l24 = Math.min(...prev.map(x => x.l));
      const S = [], near = (L, k) => L != null && Math.abs(last - L) <= k * a1;
      const add = (pattern, side, level, label) => S.push({ pattern, side, level: PX(level), dist: +((level / last - 1) * 100).toFixed(2), label });
      if (yd) { if (near(yd.h, 0.5)) add("P1", last >= yd.h ? "long" : "short", yd.h, last >= yd.h ? "站上前日高後回踩" : "頂到前日高"); if (near(yd.l, 0.5)) add("P1", last >= yd.l ? "long" : "short", yd.l, last >= yd.l ? "回踩前日低支撐" : "跌破前日低後反抽"); }
      const r3 = h1.slice(-3);
      if (r3.some(x => x.l < l24) && last > l24) add("P2", "long", l24, "掃掉近 24h 低點後收回");
      if (r3.some(x => x.h > h24) && last < h24) add("P2", "short", h24, "掃掉近 24h 高點後收回");
      if (yd && t4 > 0 && last < yd.h && near(yd.h, 0.4)) add("P3", "long", yd.h, "多頭排列、貼近前日高，可等突破");
      if (yd && t4 < 0 && last > yd.l && near(yd.l, 0.4)) add("P3", "short", yd.l, "空頭排列、貼近前日低，可等跌破");
      const sr = srLevels(P4, i4).filter(x => x.touches >= 2).sort((x, y) => Math.abs(x.price - last) - Math.abs(y.price - last))[0];
      if (sr && near(sr.price, 0.5)) add("P4", last >= sr.price ? "long" : "short", sr.price, `4h ${last >= sr.price ? "支撐" : "壓力"}（碰 ${sr.touches} 次）`);
      if (t4 !== 0) { const f = fibAt(P4, i4, t4), lo = Math.min(f.lvl(0.5), f.lvl(0.618)), hi = Math.max(f.lvl(0.5), f.lvl(0.618)); if (last >= lo && last <= hi) add("P5", t4 > 0 ? "long" : "short", f.lvl(0.618), "回到 4h 波段 0.5～0.618"); }
      if (t1 > 0 && t4 >= 0 && (near(P1.e20[i1], 0.3) || near(P1.e50[i1], 0.3)) && last > P1.e50[i1]) add("P6", "long", P1.e20[i1], "1h 多頭回踩均線");
      if (t1 < 0 && t4 <= 0 && (near(P1.e20[i1], 0.3) || near(P1.e50[i1], 0.3)) && last < P1.e50[i1]) add("P6", "short", P1.e20[i1], "1h 空頭反彈到均線");
      if (t4 === 0 && near(h24, 0.3)) add("P7", "short", h24, "區間上緣");
      if (t4 === 0 && near(l24, 0.3)) add("P7", "long", l24, "區間下緣");
      const ret = []; const bret = []; for (let i = Math.max(1, h1.length - 168); i < h1.length; i++) { const br = btcRet.get(h1[i].t); if (br == null) continue; ret.push(h1[i].c / h1[i - 1].c - 1); bret.push(br); }
      const c7 = corr(ret, bret), chg24 = h1.length > 24 ? last / h1.at(-25).c - 1 : 0;
      const w = watch.find(x => x.base === b);
      out.push({ base: b, last: PX(last), chg24: +(chg24 * 100).toFixed(2), rel24: +((chg24 - btcChg24) * 100).toFixed(2), corr7: c7 == null ? null : +c7.toFixed(2), t4, t1, top: top.has(b), ema200: w ? w.ema200 : null, brkDist: w ? w.dist : null, setups: S });
    } catch (e) { console.log("掃描略過", b, e.message); }
  }
  st.scan = { updated: new Date().toISOString(), btcChg24: LV.btcChg24, coins: out };
} catch (e) { console.log("戰情室資料略過（錯誤）", e.message); }

// ===== 7) 劇本單（下單員依劇本員的劇本下的虛擬單，可做多做空，10/31 新增）=====
// 來源：intel.json 的 scenarioVirtual。每筆固定風險本金 1%；槓桿不設上限，但若「爆倉價在停損之前」就拒單。
// 成交規則（保守）：limit＝回調掛單、stop＝突破追單；成交那根 K 若也碰到停損，算停損。停損與停利同一根都碰到，算停損。
try {
  const SC = st.scen = Object.assign({ equity: 1, open: [], closed: [], waiting: {}, done: {} }, st.scen || {});
  let sv = []; try { sv = JSON.parse(await fs.readFile("intel.json", "utf8")).scenarioVirtual || []; } catch (e) {}
  const MAXOPEN = 20, MAXWAIT = 30, MMR = 0.005; // 11/1 使用者決定取消劇本單的筆數門檻，只留系統負荷上限
  const okSide = o => o.side === "long" ? (o.stop < o.entry && o.entry < o.target) : o.side === "short" ? (o.target < o.entry && o.entry < o.stop) : false;
  const valid = o => o && o.id && o.base && o.entry > 0 && o.stop > 0 && o.target > 0 && okSide(o) && !SC.done[o.id];
  const orders = sv.filter(valid);
  const tierCost = v => v == null ? 0.004 : v >= 2000e6 ? 0.0014 : v >= 500e6 ? 0.0025 : v >= 100e6 ? 0.004 : 0.007;
  for (const o of orders) if (!SC.waiting[o.id] && !SC.open.find(q => q.id === o.id) && Object.keys(SC.waiting).length < MAXWAIT) SC.waiting[o.id] = { ...o, t0: now };
  const close = (p, x, why, tx) => {
    const dir = p.side === "long" ? 1 : -1, R = dir * (x - p.e) / p.r - p.cost * p.e / p.r;
    SC.equity += p.amt * R; SC.done[p.id] = 1; SC.open = SC.open.filter(q => q !== p);
    SC.closed.unshift({ id: p.id, base: p.base, side: p.side, type: p.type, session: p.session, scenario: p.scenario, pattern: p.pattern, e: p.e, stop: p.stop, target: p.target, x, R: +R.toFixed(3), why, reason: p.reason, lev: p.lev, levNeeded: p.levNeeded, t: p.t, tx, amt: p.amt });
  };
  for (const id of Object.keys(SC.waiting)) {
    const w = SC.waiting[id];
    if (!orders.find(o => o.id === id)) { delete SC.waiting[id]; continue; }
    const exp = Math.min(72, w.expireH || 8) * H1;
    if (now - w.t0 > exp) { SC.done[id] = 1; delete SC.waiting[id]; SC.closed.unshift({ id, base: w.base, side: w.side, session: w.session, scenario: w.scenario, e: w.entry, x: null, R: 0, why: "未成交過期", reason: w.reason || "", t: w.t0, tx: now, amt: 0 }); continue; }
    if (SC.open.length >= MAXOPEN) continue;
    let c; try { c = (await kl(w.base, "15m", 400)).filter(x => x.t + M15 <= now); } catch (e) { continue; } await sleep(80);
    const lim = (w.type || "limit") === "limit", L = w.side === "long";
    const hit = c.find(x => x.t + M15 > w.t0 && (lim ? (L ? x.l <= w.entry : x.h >= w.entry) : (L ? x.h >= w.entry : x.l <= w.entry)));
    if (!hit) continue;
    const e = lim ? (L ? Math.min(hit.o, w.entry) : Math.max(hit.o, w.entry)) : (L ? Math.max(hit.o, w.entry) : Math.min(hit.o, w.entry));
    // 部位大小以「計畫進場價到停損」計算（跟真實下單一樣）；R 也用計畫距離算，成交價比較好或比較差都會反映在 R 上
    const r = Math.abs(w.entry - w.stop), dist = Math.abs(e - w.stop); delete SC.waiting[id];
    const levNeeded = +(RISK * e / r).toFixed(2); // 用全部本金當保證金時需要的槓桿
    if (w.lev && !(L ? e <= w.stop : e >= w.stop) && (1 / w.lev - MMR) <= dist / e) { SC.done[id] = 1; SC.closed.unshift({ id, base: w.base, side: w.side, session: w.session, e, x: null, R: 0, why: `槓桿 ${w.lev} 倍太高：停損前會先爆倉，拒單`, reason: w.reason || "", t: hit.t, tx: now, amt: 0 }); continue; }
    const lv = await liqOf(w.base);
    const p = { id, base: w.base, side: w.side, type: w.type || "limit", session: w.session || "", scenario: w.scenario || "", pattern: w.pattern || "P0", e, r, plannedE: w.entry, stop: w.stop, target: w.target, reason: w.reason || "", lev: w.lev || null, levNeeded, cost: tierCost(lv), t: hit.t + M15, lastBar: hit.t, amt: SC.equity * RISK, maxHold: Math.min(168, w.maxHoldH || 48) * H1, cur: hit.c, curR: 0 };
    SC.open.push(p);
    // 跳空越過停損：成交後停損立刻觸發，以成交價出場（只賠成本）；成交當根又碰到停損：算停損
    if (L ? e <= p.stop : e >= p.stop) close(p, e, "跳空越過停損，成交即出場", hit.t + M15);
    else if (L ? hit.l <= p.stop : hit.h >= p.stop) close(p, p.stop, "停損（成交當根）", hit.t + M15);
  }
  for (const p of [...SC.open]) {
    let c; try { c = (await kl(p.base, "15m", 400)).filter(x => x.t + M15 <= now); } catch (e) { continue; } await sleep(80);
    const L = p.side === "long";
    for (const b of c) {
      if (b.t <= p.lastBar) continue;
      p.lastBar = b.t; p.cur = b.c; p.curR = +((L ? 1 : -1) * (b.c - p.e) / p.r).toFixed(2);
      if (L ? b.l <= p.stop : b.h >= p.stop) { close(p, L ? Math.min(b.o, p.stop) : Math.max(b.o, p.stop), "停損", b.t + M15); break; }
      if (L ? b.h >= p.target : b.l <= p.target) { close(p, L ? Math.max(b.o, p.target) : Math.min(b.o, p.target), "停利", b.t + M15); break; }
      if (b.t + M15 - p.t >= p.maxHold) { close(p, b.c, "超時平倉", b.t + M15); break; }
    }
  }
  SC.closed = SC.closed.slice(0, 500);
  const real = SC.closed.filter(x => x.amt), agg = xs => { const w = xs.filter(x => x.R > 0).length; return { n: xs.length, win: xs.length ? Math.round(w / xs.length * 100) : 0, sumR: +xs.reduce((q, x) => q + x.R, 0).toFixed(2), avgR: xs.length ? +(xs.reduce((q, x) => q + x.R, 0) / xs.length).toFixed(2) : 0 }; };
  SC.stats = { ...agg(real), ret: +((SC.equity - 1) * 100).toFixed(1), bySession: Object.fromEntries(["tokyo", "london", "ny"].map(k => [k, agg(real.filter(x => x.session === k))])), bySide: { long: agg(real.filter(x => x.side === "long")), short: agg(real.filter(x => x.side === "short")) }, byType: { limit: agg(real.filter(x => (x.type || "limit") === "limit")), stop: agg(real.filter(x => x.type === "stop")) }, expired: SC.closed.filter(x => !x.amt).length };
  // 按型態＋方向統計；early＝較舊的一半、late＝較新的一半（用來驗證：只有前後兩半都賺的型態才算真的有效）
  const keys = [...new Set(real.map(x => (x.pattern || "P0") + "|" + x.side))];
  SC.stats.byPattern = Object.fromEntries(keys.map(k => { const [pt, sd] = k.split("|"); const xs = real.filter(x => (x.pattern || "P0") === pt && x.side === sd).sort((a, b) => a.tx - b.tx), h = Math.floor(xs.length / 2); return [k, { pattern: pt, side: sd, ...agg(xs), early: agg(xs.slice(0, h)), late: agg(xs.slice(h)) }]; }));
} catch (e) { console.log("劇本單略過（錯誤）", e.message); }
st.market = { btcUp, btc: bD[bI].c, btcE50: +bE[bI].toFixed(1), top: [...top] };
st.watch = watch.filter(w => w.top && w.ema200).sort((a, b) => a.dist - b.dist).slice(0, 12);
st.updated = new Date().toISOString();
await fs.writeFile(FILE, JSON.stringify(st));
console.log(JSON.stringify({ market: st.market, open: st.open.map(p => p.base), stats: st.stats, watch: st.watch.map(w => w.base + " " + w.dist + "%") }, null, 1));
