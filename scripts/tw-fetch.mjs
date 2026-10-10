// 台股資料更新：每個交易日收盤後由 GitHub Actions 執行，產生 tw/data.json
import fs from "node:fs/promises";

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
out.lastDate = out.stocks.map(s => s.bars.at(-1)?.[0]).sort().at(-1) || null;
console.log(`完成 ${out.stocks.length}／${list.length}，失敗 ${out.failed.length}`);
if (out.stocks.length < list.length * 0.5) { console.log("成功數太少，不覆蓋舊資料"); process.exit(1); }
await fs.writeFile("tw/data.json", JSON.stringify(out));
