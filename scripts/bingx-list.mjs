// BingX 永續合約清單與資金費率（瀏覽器無法直接讀 BingX，由 GitHub 每小時抓一次）
import fs from "node:fs/promises";
const UA = { "User-Agent": "Mozilla/5.0 (contract-scanner)", "Accept": "application/json" };
async function getJSON(url) { for (let t = 0; t < 3; t++) { try { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); } catch (e) { if (t === 2) throw e; await new Promise(r => setTimeout(r, 2000)); } } }
const t = await getJSON("https://open-api.bingx.com/openApi/swap/v2/quote/ticker");
if (t.code !== 0 || !Array.isArray(t.data)) throw new Error("ticker: " + (t.msg || "bad"));
const symbols = t.data.filter(x => /-USDT$/.test(x.symbol)).map(x => { const p = +x.lastPrice; return { base: x.symbol.replace(/-USDT$/, ""), last: p, qv: Math.round(+(x.quoteVolume || 0) || (+x.volume || 0) * p), chg: +x.priceChangePercent }; });
const funding = {};
try { const f = await getJSON("https://open-api.bingx.com/openApi/swap/v2/quote/premiumIndex"); (Array.isArray(f.data) ? f.data : []).forEach(x => { if (/-USDT$/.test(x.symbol)) funding[x.symbol.replace(/-USDT$/, "")] = +x.lastFundingRate; }); } catch (e) { console.log("funding fail", e.message); }
await fs.writeFile("bingx.json", JSON.stringify({ updated: new Date().toISOString(), symbols, funding }));
console.log("BingX 合約", symbols.length, "資金費率", Object.keys(funding).length);
