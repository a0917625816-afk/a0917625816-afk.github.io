// 台股資料更新：每個交易日收盤後由 GitHub Actions 執行，產生 tw/data.json
import fs from "node:fs/promises";
import { signals, extras } from "./tw-extra.mjs";

const UA = { "User-Agent": "Mozilla/5.0 (tw-helper; +https://a0917625816-afk.github.io/tw/)", "Accept": "application/json" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KEEP = 300;

async function getJSON(url, tries = 3) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.status === 429) { await sleep(4000 * (t + 1)); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (t === tries - 1) throw new Error(`${url} → ${e.message}`);
      await sleep(1500 * (t + 1));
    }
  }
}
const num = v => { if (v == null) return null; const n = parseFloat(String(v).replace(/,/g, "")); return isFinite(n) ? n : null; };
const pick = (o, ...keys) => { for (const k of keys) { const hit = Object.keys(o).find(x => x.replace(/\s/g, "").includes(k)); if (hit != null && o[hit] !== "" && o[hit] != null) return o[hit]; } return null; };
const r2 = x => Math.round(x * 100) / 100;
const twDate = sec => new Date((sec + 8 * 3600) * 1000).toISOString().slice(0, 10);

async function yahoo(sym, range = "2y") {
  const d = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d`);
  const res = d?.chart?.result?.[0];
  if (!res?.timestamp?.length) throw new Error("no data");
  const q = res.indicators.quote[0], map = new Map();
  res.timestamp.forEach((t, i) => {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i], v = q.volume[i];
    if ([o, h, l, c].some(x => x == null || !isFinite(x)) || c <= 0) return;
    map.set(twDate(t), [twDate(t), r2(o), r2(h), r2(l), r2(c), Math.round((v || 0) / 1000)]);
  });
  return [...map.values()];
}
async function finmind(code) {
  const start = new Date(Date.now() - 760 * 864e5).toISOString().slice(0, 10);
  const d = await getJSON(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${code}&start_date=${start}`);
  if (!d?.data?.length) throw new Error("no data");
  return d.data.filter(x => x.close > 0).map(x => [x.date, r2(x.open), r2(x.max), r2(x.min), r2(x.close), Math.round(x.Trading_Volume / 1000)]);
}
async function prices(code) {
  const errs = [];
  for (const [mk, sfx] of [["上市", ".TW"], ["上櫃", ".TWO"]]) {
    try { const b = await yahoo(code + sfx); if (b.length > 30) return { bars: b, market: mk, src: "Yahoo" }; } catch (e) { errs.push(sfx + ":" + e.message); }
    await sleep(250);
  }
  try { return { bars: await finmind(code), market: null, src: "FinMind" }; } catch (e) { errs.push("FinMind:" + e.message); }
  throw new Error(errs.join(" | "));
}

const list = JSON.parse(await fs.readFile("tw/stocks.json", "utf8"));
const names = {}, val = {}, rev = {}, mkts = {}, snap = [];

// 名稱（上市／上櫃）
try { (await getJSON("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL")).forEach(x => { if (x.Code) { names[x.Code] = x.Name; mkts[x.Code] = "上市"; snap.push({ code: x.Code, name: x.Name, market: "上市", value: num(x.TradeValue), close: num(x.ClosingPrice) }); } }); } catch (e) { console.log("TWSE 名稱失敗", e.message); }
try { (await getJSON("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes")).forEach(x => { const c = x.SecuritiesCompanyCode || x.Code, n = x.CompanyName || x.Name; if (c && n) { names[c] = n; mkts[c] = "上櫃"; snap.push({ code: c, name: n, market: "上櫃", value: num(pick(x, "TransactionAmount", "TradeValue", "成交金額")), close: num(pick(x, "Close", "收盤")) }); } }); } catch (e) { console.log("TPEx 名稱失敗", e.message); }
// 本益比、殖利率、股價淨值比
try { (await getJSON("https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL")).forEach(x => { if (x.Code) val[x.Code] = { pe: num(x.PEratio), dy: num(x.DividendYield), pb: num(x.PBratio) }; }); } catch (e) { console.log("TWSE 本益比失敗", e.message); }
try { (await getJSON("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis")).forEach(x => { const c = x.SecuritiesCompanyCode; if (c) val[c] = { pe: num(x.PriceEarningRatio), dy: num(x.YieldRatio), pb: num(x.PriceBookRatio) }; }); } catch (e) { console.log("TPEx 本益比失敗", e.message); }
// 每月營收
for (const url of ["https://openapi.twse.com.tw/v1/opendata/t187ap05_L", "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O"]) {
  try {
    (await getJSON(url)).forEach(x => {
      const c = String(pick(x, "公司代號", "SecuritiesCompanyCode") || "").trim(); if (!c) return;
      rev[c] = {
        ym: String(pick(x, "資料年月", "YearMonth") || ""),
        cur: num(pick(x, "營業收入-當月營收", "當月營收")),
        mom: num(pick(x, "營業收入-上月比較增減(%)", "上月比較增減")),
        yoy: num(pick(x, "營業收入-去年同月增減(%)", "去年同月增減")),
        cumYoy: num(pick(x, "累計營業收入-前期比較增減(%)", "前期比較增減")),
      };
    });
  } catch (e) { console.log("營收失敗", url, e.message); }
}

const out = { updated: new Date().toISOString(), stocks: [], failed: [] };
try { out.index = { name: "加權指數", bars: (await yahoo("^TWII")).slice(-KEEP) }; } catch (e) { console.log("加權指數失敗", e.message); }

for (const [code, fallbackName] of list) {
  try {
    const p = await prices(code);
    const v = val[code] || {}, rv = rev[code] || null;
    out.stocks.push({ code, name: names[code] || fallbackName, market: mkts[code] || p.market || "", etf: code.startsWith("00"), bars: p.bars.slice(-KEEP), pe: v.pe ?? null, dy: v.dy ?? null, pb: v.pb ?? null, rev: rv, src: p.src });
    console.log("OK", code, p.src, p.bars.length);
  } catch (e) { out.failed.push(code); console.log("失敗", code, e.message); }
  await sleep(350);
}
// 回調／反彈訊號與額外資料（失敗不影響主資料）
try { const sg = signals(out.stocks); out.sigStats = sg.stats; out.stocks.forEach(s => { if (sg.now[s.code]) s.sig = sg.now[s.code]; }); console.log("訊號", Object.keys(sg.now).length, JSON.stringify(sg.stats)); } catch (e) { console.log("訊號失敗", e.message); }
try { out.meta = { sources: await extras(out) }; console.log("額外資料", JSON.stringify(out.meta.sources)); } catch (e) { out.meta = { sources: { extras: "fail " + e.message } }; console.log("額外資料失敗", e.message); }

// 當沖候選：全市場成交金額前 150 名（排除 ETF、權證、低價股、處置股）
const punish = new Set();
try { (await getJSON("https://openapi.twse.com.tw/v1/announcement/punish")).forEach(x => { const c = String(pick(x, "Code", "證券代號") || "").trim(); if (c) punish.add(c); }); console.log("處置股", punish.size); } catch (e) { console.log("處置股清單失敗", e.message); }
const have = new Map(out.stocks.map(s => [s.code, s]));
const hot = snap.filter(x => /^[1-9]\d{3}$/.test(x.code) && x.close >= 10 && x.value > 0 && !punish.has(x.code)).sort((a, b) => b.value - a.value).slice(0, 150);
out.dt = { list: [], punished: [...punish] };
for (const h of hot) {
  try {
    let bars;
    if (have.has(h.code)) bars = have.get(h.code).bars.slice(-60);
    else { bars = (await yahoo(h.code + (h.market === "上櫃" ? ".TWO" : ".TW"), "6mo")).slice(-60); await sleep(300); }
    if (bars.length >= 25) out.dt.list.push({ code: h.code, name: h.name, market: h.market, value: h.value, bars });
  } catch (e) { console.log("當沖候選失敗", h.code, e.message); }
}
console.log("當沖候選", out.dt.list.length);

// ===== 當沖成績單：存下今天的計畫，並對照前一次計畫的隔日實際走勢 =====
const smaA = (a, n) => { const o = new Array(a.length).fill(NaN); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; };
const atrA = (c, n = 14) => { const o = new Array(c.length).fill(NaN); if (c.length <= n) return o; const tr = c.map((x, i) => i ? Math.max(x.h - x.l, Math.abs(x.h - c[i - 1].c), Math.abs(x.l - c[i - 1].c)) : x.h - x.l); let s = 0; for (let i = 1; i <= n; i++) s += tr[i]; o[n] = s / n; for (let i = n + 1; i < c.length; i++) o[i] = (o[i - 1] * (n - 1) + tr[i]) / n; return o; };
const tickOf = p => p < 10 ? 0.01 : p < 50 ? 0.05 : p < 100 ? 0.1 : p < 500 ? 0.5 : p < 1000 ? 1 : 5;
const rUp = p => { const t = tickOf(p); return +(Math.ceil(p / t - 1e-9) * t).toFixed(2); }, rDn = p => { const t = tickOf(p); return +(Math.floor(p / t + 1e-9) * t).toFixed(2); };
function dtPlan(code, name, bars, value) {
  const c = bars.map(x => ({ d: x[0], o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] })), n = c.length; if (n < 25) return null;
  const i = n - 1, b = c[i], cl = c.map(x => x.c);
  const ma5 = smaA(cl, 5)[i], ma20 = smaA(cl, 20)[i], a = atrA(c, 14)[i], vAvg = smaA(c.map(x => x.v), 20)[i - 1], vr = b.v / vAvg;
  const atrPct = a / b.c * 100, rng = b.h - b.l, pos = rng > 0 ? (b.c - b.l) / rng : 0.5, chg = (b.c / c[i - 1].c - 1) * 100, val = value || b.v * 1000 * b.c;
  const bias = b.c > ma20 && pos >= 0.6 && chg > 0 ? 1 : b.c < ma20 && pos <= 0.4 && chg < 0 ? -1 : 0;
  let score = (vr >= 2 ? 25 : vr >= 1.5 ? 18 : vr >= 1 ? 10 : 3) + (atrPct >= 2.5 && atrPct <= 6 ? 25 : (atrPct >= 1.8 && atrPct < 8) ? 15 : 5)
    + ((bias === 1 && pos >= 0.8) || (bias === -1 && pos <= 0.2) ? 25 : bias ? 15 : 5)
    + (bias === 1 ? (b.c > ma5 && b.c > ma20 ? 15 : b.c > ma20 ? 8 : 0) : bias === -1 ? (b.c < ma5 && b.c < ma20 ? 15 : b.c < ma20 ? 8 : 0) : 5)
    + (val / 1e8 >= 20 ? 10 : val / 1e8 >= 5 ? 7 : 3);
  const P = (b.h + b.l + b.c) / 3;
  let plan = null;
  if (bias) { const d = bias, e = d > 0 ? rDn(P) : rUp(P), sl = d > 0 ? rDn(e - a) : rUp(e + a), r = +Math.abs(e - sl).toFixed(2); plan = { dir: d, e, sl, t1: d > 0 ? rUp(e + r) : rDn(e - r), t2: d > 0 ? rUp(e + 2 * r) : rDn(e - 2 * r), r }; }
  return { code, name: String(name || "").replace(/\*+$/, ""), date: b.d, bias, score, px: b.c, plan };
}
function evalSide(o, dir, bar) {
  const { e, sl, t1, t2, r } = o; if (!(r > 0)) return { st: "none", txt: "資料不足" };
  const trig = dir > 0 ? bar.l <= e : bar.h >= e;
  if (!trig) return { st: "none", txt: dir > 0 ? "沒有回檔到買進價，沒成交" : "沒有反彈到賣出價，沒成交" };
  const hitSL = dir > 0 ? bar.l <= sl : bar.h >= sl, hitT1 = dir > 0 ? bar.h >= t1 : bar.l <= t1, hitT2 = dir > 0 ? bar.h >= t2 : bar.l <= t2;
  const mv = dir * (bar.c - e) / r; let R, txt;
  if (hitSL && hitT1) { R = -1; txt = "同一天碰到停損和目標，保守算停損"; }
  else if (hitSL) { R = -1; txt = "打到停損"; }
  else if (hitT1) { R = hitT2 ? 1.5 : 0.5 + 0.5 * Math.max(0, Math.min(2, mv)); txt = hitT2 ? "達到目標二" : "達到目標一，剩下收盤出場"; }
  else { R = mv; txt = "沒到目標也沒停損，收盤出場"; }
  R -= 0.0045 * e / r;
  return { st: "trade", R: +R.toFixed(3), txt };
}
let hist = { days: [] };
try { hist = JSON.parse(await fs.readFile("tw/dt-history.json", "utf8")); if (!Array.isArray(hist.days)) hist = { days: [] }; } catch (e) { console.log("沒有舊的成績單，從頭開始"); }
const barsOf = new Map();
out.dt.list.forEach(x => barsOf.set(x.code, x.bars)); out.stocks.forEach(x => { if (!barsOf.has(x.code)) barsOf.set(x.code, x.bars); });
for (const day of hist.days) {
  if (day.results) continue;
  const res = []; let pending = false;
  for (const pl of day.plans) {
    let bars = barsOf.get(pl.code);
    if (!bars || !bars.some(b => b[0] > day.date)) {
      try { bars = await yahoo(pl.code + (pl.market === "上櫃" ? ".TWO" : ".TW"), "1mo"); barsOf.set(pl.code, bars); await sleep(300); } catch (e) { bars = bars || []; }
    }
    const nb = bars.find(b => b[0] > day.date);
    if (!nb) { pending = true; break; }
    const bar = { d: nb[0], o: nb[1], h: nb[2], l: nb[3], c: nb[4] };
    if (pl.plan) res.push({ code: pl.code, name: pl.name, score: pl.score, bias: pl.bias, side: pl.plan.dir, on: bar.d, ...evalSide(pl.plan, pl.plan.dir, bar) });
  }
  if (!pending) { day.results = res; day.evalOn = res[0]?.on || null; }
}
const todayPlans = out.dt.list.map(x => { const p = dtPlan(x.code, x.name, x.bars, x.value); if (p) p.market = x.market; return p; }).filter(p => p && p.plan && p.score >= 90).sort((a, b) => b.score - a.score).slice(0, 20);
if (todayPlans.length) {
  const d0 = todayPlans[0].date, ex = hist.days.find(x => x.date === d0);
  if (!ex) hist.days.push({ date: d0, plans: todayPlans, results: null });
  else if (!ex.results) ex.plans = todayPlans;
}
hist.days.sort((a, b) => a.date < b.date ? -1 : 1); hist.days = hist.days.slice(-120); hist.updated = new Date().toISOString();
await fs.writeFile("tw/dt-history.json", JSON.stringify(hist));
console.log("成績單天數", hist.days.length, "已對答案", hist.days.filter(x => x.results).length);
out.lastDate = out.stocks.map(s => s.bars.at(-1)?.[0]).sort().at(-1) || null;
console.log(`完成 ${out.stocks.length}／${list.length}，失敗 ${out.failed.length}`);
if (out.stocks.length < list.length * 0.5) { console.log("成功數太少，不覆蓋舊資料"); process.exit(1); }
await fs.writeFile("tw/data.json", JSON.stringify(out));
