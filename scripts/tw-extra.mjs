// 台股額外資料：回調／反彈訊號、除權息、三大法人、類股、營收新高
import fs from "node:fs/promises";
import { prep, sma, rsi, levels } from "./ta-core.mjs";

const UA = { "User-Agent": "Mozilla/5.0 (tw-helper; +https://a0917625816-afk.github.io/tw/)", "Accept": "application/json" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url, tries = 3) {
  for (let t = 0; t < tries; t++) {
    try { const r = await fetch(url, { headers: UA }); if (r.status === 429) { await sleep(5000 * (t + 1)); continue; } if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
    catch (e) { if (t === tries - 1) throw new Error(e.message); await sleep(2000 * (t + 1)); }
  }
}
const num = v => { if (v == null) return null; const n = parseFloat(String(v).replace(/,/g, "")); return isFinite(n) ? n : null; };
const pick = (o, ...keys) => { for (const k of keys) { const hit = Object.keys(o).find(x => x.replace(/\s/g, "").includes(k)); if (hit != null && o[hit] !== "" && o[hit] != null) return o[hit]; } return null; };
const rocToISO = v => { const s = String(v || "").trim(); const m = s.match(/^(\d{3})(\d{2})(\d{2})$/) || s.match(/^(\d{4})(\d{2})(\d{2})$/) || s.match(/(\d{2,4})\D+(\d{1,2})\D+(\d{1,2})/); if (!m) return null; let y = +m[1]; if (y < 1911) y += 1911; return `${y}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`; };

function kd(c) { const K = []; let k = 50, d = 50; const D = []; for (let i = 0; i < c.length; i++) { let lo = Infinity, hi = -Infinity; for (let j = Math.max(0, i - 8); j <= i; j++) { lo = Math.min(lo, c[j].l); hi = Math.max(hi, c[j].h); } const rsv = hi > lo ? (c[i].c - lo) / (hi - lo) * 100 : 50; k = k * 2 / 3 + rsv / 3; d = d * 2 / 3 + k / 3; K.push(k); D.push(d); } return { K, D }; }

// ===== 回調／反彈訊號 =====
function sigAt(c, P, ind, i) {
  const { m20, m60, m240, K, R, vs } = ind, a = P.atr[i], b = c[i]; if (!(a > 0) || i < 10) return null;
  let up = 0, dn = 0; for (let j = i; j > i - 10 && j > 0; j--) { if (c[j].c > c[j - 1].c) up++; else break; } for (let j = i; j > i - 10 && j > 0; j--) { if (c[j].c < c[j - 1].c) dn++; else break; }
  const rng = b.h - b.l, upW = rng > 0 ? (b.h - Math.max(b.o, b.c)) / rng : 0, loW = rng > 0 ? (Math.min(b.o, b.c) - b.l) / rng : 0, vr = b.v / vs[i];
  const lv = levels(P, i, 200).filter(x => x.touches >= 2);
  const res = lv.find(x => x.price >= b.c && x.price - b.c <= 0.5 * a), sup = lv.find(x => x.price <= b.c && b.c - x.price <= 0.5 * a);
  const f = v => Math.round(v * 100) / 100;
  if (b.c > m20[i]) {
    const r = [];
    if ((b.c - m20[i]) / a >= 2.5) r.push(`離月線太遠（月線 ${f(m20[i])} 元）`);
    if (K[i] >= 80 && K[i - 1] >= 80 && K[i - 2] >= 80) r.push(`KD 連續 3 天在 80 以上（K=${K[i].toFixed(0)}）`);
    if (up >= 5) r.push(`已經連漲 ${up} 天`); else if (b.c - c[i - 5].c >= 3 * a) r.push("5 天內漲很快");
    if (upW >= 0.5 && vr >= 1.5) r.push("今天爆量但留長上影線，上面有賣壓");
    if (res) r.push(`碰到壓力區 ${f(res.price)} 元`);
    if (R[i] >= 75) r.push(`RSI ${R[i].toFixed(0)}，過熱`);
    return { type: "heat", n: r.length, reasons: r, to: f(Math.max(m20[i], b.c - 1.5 * a)) };
  }
  const trendOk = (isFinite(m240[i]) && b.c > m240[i]) || m60[i] > m60[i - 5];
  if (trendOk) {
    const r = [];
    if ((m20[i] - b.c) / a >= 2) r.push(`跌到月線（${f(m20[i])} 元）下方很遠`);
    if (K[i] <= 20) r.push(`KD 在 20 以下（K=${K[i].toFixed(0)}），超賣`);
    if (dn >= 4) r.push(`已經連跌 ${dn} 天`); else if (c[i - 5].c - b.c >= 3 * a) r.push("5 天內跌很快");
    if (loW >= 0.5) r.push("今天留長下影線，有人在低檔買");
    if (sup) r.push(`碰到支撐區 ${f(sup.price)} 元`);
    if (R[i] <= 30) r.push(`RSI ${R[i].toFixed(0)}，超賣`);
    return { type: "cool", n: r.length, reasons: r, to: f(b.c + 1.5 * a) };
  }
  return null;
}
export function signals(stocks) {
  const H = 5, st = { heat: [], heatBase: [], cool: [], coolBase: [] }, now = {};
  for (const s of stocks) {
    const c = s.bars.map(x => ({ t: Date.parse(x[0]), o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] })); if (c.length < 120) continue;
    const P = prep(c, 864e5), cl = c.map(x => x.c), { K } = kd(c);
    const ind = { m20: sma(cl, 20), m60: sma(cl, 60), m240: sma(cl, 240), K, R: rsi(cl, 14), vs: sma(c.map(x => x.v), 20) };
    for (let i = 70; i < c.length; i++) {
      const g = sigAt(c, P, ind, i); if (!g) continue;
      if (i === c.length - 1) { if (g.n >= 3) now[s.code] = g; continue; }
      if (i >= c.length - H) continue;
      const a = P.atr[i], fut = c.slice(i + 1, i + 1 + H), ret = (c[i + H].c / c[i].c - 1) * 100;
      if (g.type === "heat") { const hit = Math.min(...fut.map(x => x.l)) <= c[i].c - 1.5 * a; st.heatBase.push({ hit, ret }); if (g.n >= 3) st.heat.push({ hit, ret }); }
      else { const hit = Math.max(...fut.map(x => x.h)) >= c[i].c + 1.5 * a; st.coolBase.push({ hit, ret }); if (g.n >= 3) st.cool.push({ hit, ret }); }
    }
  }
  const sum = a => ({ n: a.length, p: a.length ? Math.round(a.filter(x => x.hit).length / a.length * 100) : null, ret: a.length ? +(a.reduce((s, x) => s + x.ret, 0) / a.length).toFixed(2) : null });
  return { now, stats: { heat: sum(st.heat), heatBase: sum(st.heatBase), cool: sum(st.cool), coolBase: sum(st.coolBase) } };
}

// ===== 外部資料 =====
export async function extras(out) {
  const log = {}, codes = new Set(out.stocks.map(s => s.code));
  // 除權息預告
  const exdiv = {};
  for (const url of ["https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL", "https://www.twse.com.tw/rwd/zh/exRight/TWT48U?response=json"]) {
    try {
      const j = await getJSON(url); let rows = [];
      if (Array.isArray(j)) rows = j;
      else if (j && Array.isArray(j.data) && Array.isArray(j.fields)) rows = j.data.map(r => Object.fromEntries(j.fields.map((f, i) => [f, r[i]])));
      rows.forEach(x => {
        const code = String(pick(x, "股票代號", "Code") || "").trim(), date = rocToISO(pick(x, "除權除息日期", "Date")); if (!code || !date) return;
        exdiv[code] = { date, type: String(pick(x, "除權息", "Exdividend") || "").trim(), cash: num(pick(x, "現金股利", "CashDividend")), stock: num(pick(x, "無償配股率", "StockDividendRatio")) };
      });
      log.exdiv = `ok ${rows.length}，對到日期 ${Object.keys(exdiv).length} (${url.includes("openapi") ? "openapi" : "rwd"})`; if (rows[0]) log.exdivSample = JSON.stringify(rows[0]).slice(0, 400); if (Object.keys(exdiv).length) break;
    } catch (e) { log.exdiv = "fail " + e.message; }
  }
  // 三大法人（上市，最近 10 個交易日）
  const inst = {}, dates = (out.index?.bars || []).map(b => b[0]).slice(-10);
  let okDays = 0;
  for (const d of dates) {
    try {
      const j = await getJSON(`https://www.twse.com.tw/rwd/zh/fund/T86?date=${d.replace(/-/g, "")}&selectType=ALLBUT0999&response=json`);
      if (!j || !Array.isArray(j.data) || !Array.isArray(j.fields)) throw new Error(j?.stat || "no data");
      const F = j.fields.map(f => f.replace(/\s/g, "")), fi = k => F.findIndex(f => f.includes(k));
      const iCode = fi("證券代號"), iF = fi("外陸資買賣超股數(不含外資自營商)"), iT = fi("投信買賣超股數"), iD = F.findIndex(f => f === "自營商買賣超股數"), iAll = fi("三大法人買賣超股數");
      j.data.forEach(r => { const code = String(r[iCode]).trim(); if (!codes.has(code)) return; (inst[code] ||= []).push({ d, f: Math.round(num(r[iF]) / 1000), t: Math.round(num(r[iT]) / 1000), dl: iD >= 0 ? Math.round(num(r[iD]) / 1000) : null, all: Math.round(num(r[iAll]) / 1000) }); });
      okDays++;
    } catch (e) { log["inst_" + d] = "fail " + e.message; }
    await sleep(3500);
  }
  log.inst = `ok ${okDays}/${dates.length} 天`;
  // 產業別
  const ind = {};
  for (const url of ["https://openapi.twse.com.tw/v1/opendata/t187ap03_L", "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O"]) {
    try { const a = await getJSON(url); a.forEach(x => { const c = String(pick(x, "公司代號", "SecuritiesCompanyCode") || "").trim(), g = String(pick(x, "產業別", "SecuritiesIndustryCode") || "").trim(); if (c && g) ind[c] = g; }); log["ind_" + (url.includes("twse") ? "L" : "O")] = "ok " + a.length; }
    catch (e) { log["ind_" + (url.includes("twse") ? "L" : "O")] = "fail " + e.message; }
  }
  // 類股指數
  let sectors = [];
  try {
    const a = await getJSON("https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX");
    sectors = a.map(x => ({ name: String(pick(x, "指數", "Index") || "").trim(), close: num(pick(x, "收盤指數", "CloseIndex")), pct: num(pick(x, "漲跌百分比", "ChangePercent")), sign: String(pick(x, "漲跌(+/-)", "Change(+/-)", "漲跌") || "") }))
      .filter(x => /類(指數|日報酬)?$|類指數/.test(x.name) && !/報酬/.test(x.name) && x.close != null);
    sectors.forEach(x => { if (x.pct != null && /-|－|綠/.test(x.sign) && x.pct > 0) x.pct = -x.pct; });
    log.sectors = "ok " + sectors.length;
  } catch (e) { log.sectors = "fail " + e.message; }
  // 類股歷史（自己累積，算 5 日、20 日表現）
  let sh = {}; try { sh = JSON.parse(await fs.readFile("tw/sector-history.json", "utf8")); } catch {}
  if (sectors.length && out.lastDate) { sh[out.lastDate] = Object.fromEntries(sectors.map(x => [x.name, x.close])); const ks = Object.keys(sh).sort(); ks.slice(0, Math.max(0, ks.length - 60)).forEach(k => delete sh[k]); await fs.writeFile("tw/sector-history.json", JSON.stringify(sh)); }
  const ds = Object.keys(sh).sort();
  sectors.forEach(x => { const back = n => { const d = ds[ds.length - 1 - n]; return d && sh[d][x.name] ? +((x.close / sh[d][x.name] - 1) * 100).toFixed(2) : null; }; x.p5 = back(5); x.p20 = back(20); });
  // 營收創新高（每月更新一次，FinMind）
  let rc = {}; try { rc = JSON.parse(await fs.readFile("tw/rev-cache.json", "utf8")); } catch {}
  let revN = 0, revFail = 0;
  for (const s of out.stocks) {
    if (s.etf || !s.rev || !s.rev.ym) continue;
    if (rc[s.code] && rc[s.code].ym === s.rev.ym) continue;
    try {
      const start = new Date(Date.now() - 4 * 365 * 864e5).toISOString().slice(0, 10);
      const j = await getJSON(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockMonthRevenue&data_id=${s.code}&start_date=${start}`);
      const rows = (j.data || []).map(x => ({ k: `${x.revenue_year}-${String(x.revenue_month).padStart(2, "0")}`, v: x.revenue })).sort((a, b) => a.k < b.k ? -1 : 1);
      if (rows.length < 13) throw new Error("too few");
      const last = rows[rows.length - 1], prev = rows.slice(-37, -1), mx = Math.max(...prev.map(x => x.v));
      rc[s.code] = { ym: s.rev.ym, month: last.k, high: last.v > mx, months: prev.length };
      revN++;
    } catch (e) { revFail++; }
    await sleep(600);
  }
  if (revN) await fs.writeFile("tw/rev-cache.json", JSON.stringify(rc));
  log.revHigh = `更新 ${revN}，失敗 ${revFail}`;
  // 寫回每檔
  for (const s of out.stocks) {
    if (exdiv[s.code]) s.exdiv = exdiv[s.code];
    const a = (inst[s.code] || []).sort((x, y) => x.d < y.d ? -1 : 1);
    if (a.length) {
      const streak = k => { let n = 0; for (let i = a.length - 1; i >= 0; i--) { const v = a[i][k]; if (!v) break; if (n === 0) n = v > 0 ? 1 : -1; else if ((v > 0) === (n > 0)) n += n > 0 ? 1 : -1; else break; } return n; };
      const last = a[a.length - 1], sum5 = k => a.slice(-5).reduce((s, x) => s + (x[k] || 0), 0);
      s.inst = { d: last.d, f: last.f, t: last.t, dl: last.dl, all: last.all, fS: streak("f"), tS: streak("t"), f5: sum5("f"), t5: sum5("t") };
    }
    if (ind[s.code]) s.ind = ind[s.code];
    if (rc[s.code] && s.rev && rc[s.code].ym === s.rev.ym) s.revHigh = rc[s.code].high;
  }
  out.sectors = sectors.sort((a, b) => (b.pct ?? -99) - (a.pct ?? -99));
  out.exdivAll = Object.entries(exdiv).filter(([c]) => codes.has(c)).map(([code, x]) => ({ code, ...x })).sort((a, b) => a.date < b.date ? -1 : 1);
  return log;
}
