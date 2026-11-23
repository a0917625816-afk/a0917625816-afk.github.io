// 策略實驗室 第三十三輪（11/23 會議決議）
// 實驗一 E 熔斷「加 vs 不加」（審查表 E；11/12 決議「要寫進 bot.mjs 須先回測」）：六個上線部門（波段A、波段B、波段A-M、日內B、日內C、日內D）進出場規則完全不動，只在「新開單」前多一道熔斷檢查（用組合層已實現 R、UTC 日／週／月）：①單日已實現 ≤ −2R → 當日停單；②連續 2 筆虧損 → 最後一筆虧損平倉後 24 小時內不開新單；③本週（週一 00:00 UTC 起）累計 ≤ −5R → 停到下週一；④本月累計 ≤ −8R → 停到下月 1 日。多條同時觸發取最嚴。原本＝各部門自己（不加熔斷）。鐵律判定（勝率提高、平均R ≥ 90%、回撤 ≤ 1.2 倍、兩段 ≥30 筆）。鄰近（±20%）：單日 −1.6／−2.4R、週 −4／−6R、月 −6.4／−9.6R、連敗 3 筆（2 的 ±20% 無整數，列 3）；另列：四條各自單獨套用、被擋掉那批單的筆數與平均R（反事實）、成本 ×1.5／×2、按月。
// 實驗二 R12-F 事件日擁擠方清洗順勢「無 OI、第一級成本幣」版（run32 R12 無 OI 對照 BTC／ETH 35 筆兩段皆正但樣本外 9 筆判不了 → 11/22 CEO 預告「下期擴幣湊樣本」）：事件＝FOMC／CPI／非農／PPI；標的＝進場前一日 30 日均成交額 ≥20 億U 的幣（點時選取，第一級成本 0.14%）；擁擠度用 BTC 的 d−5～d−1 五個費率日合計同號（全正＝多擁擠→只做空；全負＝空擁擠→只做多），不看 OI；觸發＝含公布時刻的 4h K 收盤逆擁擠方向 ≥1%；進場＝下一根 4h 開盤；停損＝事件 4h K 極值；出場＝1.5R 停利或持有 6 根 4h（24h）收盤平倉。無對應部門 → 絕對門檻（同 run31／32）。鄰近：觸發 0.8／1.2%、持有 5／7 根、R:R 1.2／1.8；另列：停損距離 ×0.5／0.75／1.25／1.5、成本 ×1.5／×2、只多／只空、各幣自己費率版、按事件類型、費率腿估算、只 BTC／ETH（＝run32 無 OI 對照重現）。
// 補測（不佔名額；CEO 網上研究 11/23：Yang & Wang 2026 FRL「FOMC 聲明後第一小時 BTC 絕對報酬 ×1.9」）：六部門回測單的「停損」出場有多少落在 FOMC／CPI／非農／PPI 公布後 0–60 分鐘內（另列 0–4 小時），與同窗口佔全部持倉時間的比例相比；只看集中度，不判上線。
// 偏誤交代（審查表 B）：幣池固定 list19（存活者偏差：只含 2026-11-10 仍在前 40 名的幣）；指標只用已收盤 K；進場用下一根開盤；成本分級；熔斷用「已平倉」單的 R（平倉時間 tx ≤ 開單時間 t 才算入），不偷看持倉中的浮動損益；熔斷的日／週／月用 UTC（機器人若實作改用台北日，會前註明差異）；R12-F 事件時刻寫死（美東含夏令／冬令）、費率只用 d−1 以前的日合計、幣池用進場前一日成交額點時選取、未計費率（另列估算）、停損用 min(開盤,停損) 保守出、滑價另計；樣本內 65%／樣本外 35%，參數只在樣本內定；各試組數寫在報告。
// 鐵律＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；審查＝主要參數各上下 20% 大部分變體仍合格。樣本外 <30 筆＝判不了。沒過就是沒過，不放寬。
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { ema, sma, atr } from "../scripts/ta-core.mjs";

let SPLIT = 0.65, N_COINS = +(process.env.N_COINS || 60), MONTHS = +(process.env.MONTHS || 30);
const M15 = 9e5, H4 = 144e5, D1 = 864e5, H1 = 36e5;
const T_START = Date.now();
const elapsed = () => ((Date.now() - T_START) / 60000).toFixed(1) + " 分";

async function fetchZipCsv(url, tmp) {
  const r = await fetch(url);
  if (r.status === 404) return null; if (!r.ok) throw new Error("HTTP " + r.status);
  await fs.writeFile(tmp, Buffer.from(await r.arrayBuffer()));
  return execFileSync("unzip", ["-p", tmp], { maxBuffer: 1 << 28 }).toString();
}
async function binance15(base) {
  const sym = base + "USDT", out = [], now = new Date();
  for (let k = MONTHS; k >= 1; k--) {
    const ym = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1)).toISOString().slice(0, 7);
    const csv = await fetchZipCsv(`https://data.binance.vision/data/futures/um/monthly/klines/${sym}/15m/${sym}-15m-${ym}.zip`, `/tmp/k-${sym}.zip`);
    if (!csv) continue;
    for (const line of csv.split("\n")) { const x = line.split(","); if (x.length < 6 || isNaN(+x[0])) continue; out.push({ t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] }); }
  }
  return out;
}
function agg(m, dt) { const out = []; let cur = null; for (const b of m) { const t = Math.floor(b.t / dt) * dt; if (!cur || cur.t !== t) { cur = { ...b, t }; out.push(cur); } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; } } return out; }
function mock(base) { let s = [...base].reduce((x, c) => x + c.charCodeAt(0), 7) * 13; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; const n = MONTHS * 30 * 96, out = []; let p = 100; const t0 = Math.floor(Date.now() / D1) * D1 - n * M15; for (let i = 0; i < n; i++) { const sg = 0.004, o = p, c = o * (1 + (rnd() - 0.5) * 2 * sg + Math.sin(i / 900 + s % 7) * sg * 0.15); out.push({ t: t0 + i * M15, o, h: Math.max(o, c) * (1 + rnd() * sg * 0.5), l: Math.min(o, c) * (1 - rnd() * sg * 0.5), c, v: 1e7 * (1 + rnd() * (rnd() < 0.03 ? 6 : 1)) }); p = c; } return out; }

// ===== 固定幣清單 =====
const CL = JSON.parse(await fs.readFile("lab/data/coins.json", "utf8"));
const LIST19 = process.env.MOCK ? ["BTC", "ETH", "SOL", "XRP"].slice(0, N_COINS) : CL.list19;
const LIST18 = process.env.MOCK ? ["BTC", "ETH", "SOL", "XRP"].slice(0, N_COINS) : CL.list18;
const want = [...new Set([...LIST19, ...LIST18])];
const data = {};
for (const base of want) {
  if (Object.keys(data).length >= N_COINS) break;
  try { const m = process.env.MOCK ? mock(base) : await binance15(base); console.log(base, m.length); if (m.length < 35000) continue; data[base] = { m, h: agg(m, H4), d: agg(m, D1) }; } catch (e) { console.log("失敗", base, e.message); }
}
const EVENTS_LIST = [["2024-05-01","14:00","FOMC"],["2024-05-03","08:30","NFP"],["2024-05-15","08:30","CPI"],["2024-06-07","08:30","NFP"],["2024-06-12","08:30","CPI"],["2024-06-12","14:00","FOMC"],["2024-07-05","08:30","NFP"],["2024-07-11","08:30","CPI"],["2024-07-31","14:00","FOMC"],["2024-08-02","08:30","NFP"],["2024-08-14","08:30","CPI"],["2024-09-06","08:30","NFP"],["2024-09-11","08:30","CPI"],["2024-09-18","14:00","FOMC"],["2024-10-04","08:30","NFP"],["2024-10-10","08:30","CPI"],["2024-11-01","08:30","NFP"],["2024-11-07","14:00","FOMC"],["2024-11-13","08:30","CPI"],["2024-12-06","08:30","NFP"],["2024-12-11","08:30","CPI"],["2024-12-18","14:00","FOMC"],["2025-01-10","08:30","NFP"],["2025-01-15","08:30","CPI"],["2025-01-29","14:00","FOMC"],["2025-02-07","08:30","NFP"],["2025-02-12","08:30","CPI"],["2025-03-07","08:30","NFP"],["2025-03-12","08:30","CPI"],["2025-03-19","14:00","FOMC"],["2025-04-04","08:30","NFP"],["2025-04-10","08:30","CPI"],["2025-05-02","08:30","NFP"],["2025-05-07","14:00","FOMC"],["2025-05-13","08:30","CPI"],["2025-06-06","08:30","NFP"],["2025-06-11","08:30","CPI"],["2025-06-18","14:00","FOMC"],["2025-07-03","08:30","NFP"],["2025-07-15","08:30","CPI"],["2025-07-30","14:00","FOMC"],["2025-08-01","08:30","NFP"],["2025-08-12","08:30","CPI"],["2025-09-05","08:30","NFP"],["2025-09-11","08:30","CPI"],["2025-09-17","14:00","FOMC"],["2025-10-24","08:30","CPI"],["2025-10-29","14:00","FOMC"],["2025-11-20","08:30","NFP"],["2025-12-10","14:00","FOMC"],["2025-12-16","08:30","NFP"],["2025-12-18","08:30","CPI"],["2026-01-09","08:30","NFP"],["2026-01-13","08:30","CPI"],["2026-01-28","14:00","FOMC"],["2026-02-11","08:30","NFP"],["2026-02-13","08:30","CPI"],["2026-03-06","08:30","NFP"],["2026-03-11","08:30","CPI"],["2026-03-18","14:00","FOMC"],["2026-04-03","08:30","NFP"],["2026-04-10","08:30","CPI"],["2026-04-29","14:00","FOMC"],["2026-05-08","08:30","NFP"],["2026-05-12","08:30","CPI"],["2026-06-05","08:30","NFP"],["2026-06-10","08:30","CPI"],["2026-06-17","14:00","FOMC"],["2026-07-02","08:30","NFP"],["2026-07-14","08:30","CPI"],["2026-07-29","14:00","FOMC"],["2026-08-07","08:30","NFP"],["2026-08-12","08:30","CPI"],["2026-09-04","08:30","NFP"],["2026-09-11","08:30","CPI"],["2026-09-16","14:00","FOMC"],["2026-10-02","08:30","NFP"],["2026-10-14","08:30","CPI"],["2026-10-28","14:00","FOMC"],["2026-11-06","08:30","NFP"],["2026-11-10","08:30","CPI"]];
const PPI_LIST = ["2024-05-14","2024-06-13","2024-07-12","2024-08-13","2024-09-12","2024-10-11","2024-11-14","2024-12-12","2025-01-14","2025-02-13","2025-03-13","2025-04-11","2025-05-15","2025-06-12","2025-07-16","2025-08-14","2025-09-10","2025-11-25","2026-01-14","2026-01-30","2026-02-27","2026-03-18","2026-04-14","2026-05-13","2026-06-11","2026-07-15","2026-08-13","2026-09-10","2026-10-15","2026-11-13"].map(d => [d, "08:30", "PPI"]);
const coins = Object.keys(data); console.log("幣種", coins.length, elapsed());
const U19 = LIST19.filter(c => data[c]), U18 = LIST18.filter(c => data[c]);
console.log("list19 可用", U19.length, "list18 可用", U18.length);

// ===== 濾網（同現行機器人；排行依清單各算一份）=====
const dk = t => Math.floor(t / D1);
const bD = data.BTC.d, bC = bD.map(x => x.c), bE = ema(bC, 50), btcUp = new Map(); bD.forEach((b, i) => btcUp.set(dk(b.t), b.c > bE[i]));
const dc = {}; coins.forEach(cn => { const m = new Map(); data[cn].d.forEach(b => m.set(dk(b.t), b.c)); dc[cn] = m; });
const rkCache = new Map();
function top(day, U) { const key = U.key + ":" + day; if (rkCache.has(key)) return rkCache.get(key); const sc = []; for (const cn of U.list) { const a = dc[cn].get(day), b = dc[cn].get(day - 20); if (a && b) sc.push([cn, a / b - 1]); } sc.sort((x, y) => y[1] - x[1]); const s = new Set(sc.slice(0, 10).filter(x => x[1] > 0).map(x => x[0])); rkCache.set(key, s); return s; }
const okF = (cn, t, U) => btcUp.get(dk(t) - 1) === true && top(dk(t) - 1, U).has(cn);
const UNI19 = { key: "19", list: U19 }, UNI18 = { key: "18", list: U18 };

// ===== 市場狀態（第十二輪定義）、趨勢上（日內 D 用）=====
const bA = atr(bD, 14);
const stateMap = new Map(), trendUp = new Map(); bD.forEach((b, i) => { if (i < 50) return; const r5 = i >= 5 ? b.c / bD[i - 5].c - 1 : 0, ap = bA[i] / b.c; let s; if (r5 <= -0.08 || ap >= 0.045) s = "恐慌"; else if (b.c > bE[i] * 1.03) s = "趨勢上"; else if (b.c < bE[i] * 0.97) s = "趨勢下"; else s = "盤整"; stateMap.set(dk(b.t), s); trendUp.set(dk(b.t), !(r5 <= -0.08 || ap >= 0.045) && b.c > bE[i] * 1.03); });
const stateAt = t => stateMap.get(dk(t) - 1) || "未知";
const trendBlock = t => trendUp.get(dk(t) - 1) === true;
// 盤整濾網（run30 實驗二同定義）：ban(cn,t)＝進場前一日 BTC 狀態 ≠ 盤整
function stateFn(band = 0.03, pr5 = 0.08, patr = 0.045) { const m = new Map(); bD.forEach((b, i) => { if (i < 50) return; const r5 = i >= 5 ? b.c / bD[i - 5].c - 1 : 0, ap = bA[i] / b.c; let s; if (r5 <= -pr5 || ap >= patr) s = "恐慌"; else if (b.c > bE[i] * (1 + band)) s = "趨勢上"; else if (b.c < bE[i] * (1 - band)) s = "趨勢下"; else s = "盤整"; m.set(dk(b.t), s); }); return (cn, t) => m.get(dk(t) - 1) !== "盤整"; }

// ===== 指標、成本 =====
const pre = {};
for (const cn of coins) for (const tf of ["h", "m", "d"]) { const c = data[cn][tf]; (pre[cn] ||= {})[tf] = { c, a: atr(c, 14), e20: ema(c.map(x => x.c), 20), e200: ema(c.map(x => x.c), 200), v20: sma(c.map(x => x.v), 20) }; }
const LIQ = {}; for (const cn of coins) { const d = data[cn].d, m = new Map(); let s = 0; const q = d.map(b => b.c * b.v); for (let i = 0; i < d.length; i++) { s += q[i]; if (i >= 30) s -= q[i - 30]; if (i >= 29) m.set(dk(d[i].t), s / 30); } LIQ[cn] = m; }
const TIERS = [[2000e6, 0.0014], [500e6, 0.0025], [100e6, 0.0040], [0, 0.0070]];
function tieredCost(cn, t) { const v = LIQ[cn].get(dk(t) - 1); if (!(v >= 0)) return 0.0040; for (const [th, c] of TIERS) if (v >= th) return c; return 0.0070; }
const mIdx = {}; for (const cn of coins) { const m = new Map(); data[cn].m.forEach((b, i) => m.set(b.t, i)); mIdx[cn] = m; }

// ===== 重大事件日曆、美東時間換算（含夏令時）=====
function nthSunday(y, mo, n) { const d = new Date(Date.UTC(y, mo, 1)); const first = (7 - d.getUTCDay()) % 7 + 1; return Date.UTC(y, mo, first + 7 * (n - 1)); }
function etToUtc(dateStr, hm) { const [y, mo, d] = dateStr.split("-").map(Number); const [hh, mm] = hm.split(":").map(Number); const local = Date.UTC(y, mo - 1, d, hh, mm); const dstStart = nthSunday(y, 2, 2) + 2 * H1, dstEnd = nthSunday(y, 10, 1) + 2 * H1; const off = (local >= dstStart && local < dstEnd) ? 4 : 5; return local + off * H1; }
const EV = EVENTS_LIST.map(([d, t, k]) => ({ t: etToUtc(d, t), k })).sort((a, b) => a.t - b.t);
const EVP = [...EVENTS_LIST, ...PPI_LIST].map(([d, t, k]) => ({ t: etToUtc(d, t), k })).sort((a, b) => a.t - b.t);
const evBlock = t => EV.some(e => t >= e.t - 4 * H1 && t < e.t + 4 * H1); // 日內 C：FOMC／CPI／非農 前後 4h
const evNear = (t, before, after) => EVP.some(e => e.t >= t - before && e.t <= t + after);

// ===== 費率／OI（lab/data/fo-daily.json，本輪只讀不補）=====
let FO; try { FO = JSON.parse(await fs.readFile("lab/data/fo-daily.json", "utf8")); } catch { FO = { coins: {} }; }
const FR = cn => (FO.coins[cn] || { fr: {} }).fr, OI = cn => (FO.coins[cn] || { oi: {} }).oi;
const oiLast = (cn, d) => { const x = OI(cn)[d]; return x ? x[0] : NaN; };
const oiChg = (cn, d, k = 1) => { const a = oiLast(cn, d), b = oiLast(cn, d - k); return a > 0 && b > 0 ? a / b - 1 : NaN; };
const frAt = (cn, d) => { const v = FR(cn)[d]; return v == null ? NaN : v; };
if (process.env.MOCK) { for (const cn of coins) { FO.coins[cn] = { fr: {}, oi: {} }; let s = 11; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; let o = 1e9; for (const b of data[cn].d) { const d = dk(b.t); o *= 1 + (r() - 0.5) * 0.3; FO.coins[cn].oi[d] = [Math.round(o), Math.round(o * 1.05)]; FO.coins[cn].fr[d] = +((r() - 0.5) * 0.4).toFixed(4); } } }

// ===== 交易引擎（部門共用；o.costMul 成本倍數、o.stopMul 停損倍數、o.ban(cn,t) 禁多；o.mid={N,lvl,keep27} 中點移動停損出場）=====
function passF(cn, t, f) { if (f.liq) { const v = LIQ[cn].get(dk(t) - 1); if (!(v >= f.liq * 1e6)) return false; } if (f.ev && evBlock(t)) return false; if (f.trend && trendBlock(t)) return false; return true; }
function quality(P, i, q) { const b = P.c[i], rng = b.h - b.l; if (q.vol && !(b.v > q.vol * P.v20[i])) return false; if (q.cs && !(rng > 0 && (b.c - b.l) / rng >= q.cs)) return false; return true; }
function midOf(c, i, N, lvl) { let hi = -Infinity, lo = Infinity; for (let j = i - N + 1; j <= i; j++) { hi = Math.max(hi, c[j].c); lo = Math.min(lo, c[j].c); } return lo + lvl * (hi - lo); }
function trades(cn, S, U, o = {}) {
  const kind = S.kind, x = S.x, f = S.f, q = S.q, stopMul = o.stopMul || 1, costMul = o.costMul || 1, mid = o.mid;
  const tf = kind === "swing" ? "h" : "m", P = pre[cn][tf], c = P.c, a = P.a, out = [];
  const N = kind === "swing" ? 55 : 192, M = 27, stopK = (kind === "swing" ? 2 : 6) * stopMul;
  let pos = null, doneDay = -1;
  for (let i = Math.max(N, 210); i < c.length - 1; i++) {
    const b = c[i];
    if (pos) {
      let ex = null, why = "";
      if (b.l <= pos.st) { ex = Math.min(b.o, pos.st); why = pos.trail ? "中點停損" : "停損"; }
      else {
        if (x.tp && !pos.took && b.h >= pos.e + x.tp * pos.r) { pos.took = true; pos.real += x.f * x.tp; if (x.be) pos.st = Math.max(pos.st, pos.e + 0.05 * pos.r); }
        if (kind === "swing" && (!mid || mid.keep27)) { let lo = Infinity; for (let j = i - M; j < i; j++) lo = Math.min(lo, c[j].l); if (b.c < lo) { ex = b.c; why = "跌破27根低"; } }
        else if (kind !== "swing" && b.t + M15 >= pos.dayEnd) { ex = b.c; why = "收盤"; }
        if (ex == null && mid && kind === "swing") { const m = midOf(c, i, mid.N, mid.lvl); if (m > pos.st) { pos.st = m; pos.trail = true; } if (b.c < pos.st) { ex = c[i + 1].o; why = "收盤跌破中點"; } }
      }
      if (ex != null) { const left = pos.took ? 1 - x.f : 1; const gross = pos.real + left * (ex - pos.e) / pos.r, costR = pos.cost * pos.e / pos.r; out.push({ cn, t: pos.t, tx: b.t + (kind === "swing" ? H4 : M15), R: gross - costMul * costR, gross, costR, state: pos.state, why, bars: i - pos.i }); pos = null; }
      continue;
    }
    if (kind === "intra") { const day = dk(b.t); if (day === doneDay || b.t >= day * D1 + 20 * 36e5) continue; }
    let hi = -Infinity; for (let j = i - N; j < i; j++) hi = Math.max(hi, c[j].h);
    if (!(b.c > hi)) continue;
    if (kind === "swing" && !(b.c > P.e200[i])) continue;
    const t = c[i + 1].t; if (!okF(cn, t, U)) continue;
    if (kind === "intra") doneDay = dk(b.t);
    if (!quality(P, i, q)) continue;
    if (!passF(cn, t, f)) continue;
    if (o.ban && o.ban(cn, t)) continue;
    const e = c[i + 1].o, r = stopK * a[i]; if (!(r > 0) || r / e < 0.002) continue;
    let st = e - r; if (mid && kind === "swing") { const m = midOf(c, i, mid.N, mid.lvl); if (m > st && m < e) st = m; }
    pos = { e, r: e - st, st, t, i: i + 1, real: 0, took: false, trail: false, dayEnd: (dk(b.t) + 1) * D1, cost: tieredCost(cn, t), state: stateAt(t) };
  }
  return out;
}
function portfolio(ts0, from, to, maxOpen = 5) {
  const ts = ts0.filter(x => x.t >= from && x.t < to).sort((a, b) => a.t - b.t);
  let eq = 1, peak = 1, dd = 0, open = [], n = 0, w = 0, s = 0; const byState = {}, byWhy = {}, bySide = {}, byCoin = {}, byMonth = {}; let legF = 0, legP = 0;
  const settle = u => { open.sort((a, b) => a.tx - b.tx); while (open.length && open[0].tx <= u) { const o = open.shift(); eq += o.amt * o.R; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); } };
  const acc = (m, k, R) => { const v = m[k] ||= { n: 0, w: 0, s: 0 }; v.n++; if (R > 0) v.w++; v.s += R; };
  for (const x of ts) { settle(x.t); if (open.length >= maxOpen || open.some(o => o.cn === x.cn)) continue; open.push({ ...x, amt: eq * 0.01 }); n++; if (x.R > 0) w++; s += x.R; legF += x.legF || 0; legP += x.legP || 0; acc(byState, x.state || "未知", x.R); acc(byWhy, x.why || "", x.R); acc(bySide, x.side || "多", x.R); acc(byCoin, x.cn, x.R); acc(byMonth, new Date(x.t).toISOString().slice(0, 7), x.R); }
  settle(Infinity); const Y = ((to === Infinity ? Date.now() : to) - from) / (365 * D1);
  const fin = m => { const o = {}; for (const [k, v] of Object.entries(m)) o[k] = { n: v.n, win: +(v.w / v.n * 100).toFixed(1), avgR: +(v.s / v.n).toFixed(3) }; return o; };
  return { n, win: n ? +(w / n * 100).toFixed(1) : 0, avgR: n ? +(s / n).toFixed(3) : 0, legF: n ? +(legF / n).toFixed(3) : 0, legP: n ? +(legP / n).toFixed(3) : 0, cagr: eq > 0 ? +((Math.pow(eq, 1 / Y) - 1) * 100).toFixed(1) : -100, dd: +(dd * 100).toFixed(1), byState: fin(byState), byWhy: fin(byWhy), bySide: fin(bySide), byCoin: fin(byCoin), byMonth: fin(byMonth) };
}
const t0 = Math.min(...coins.map(cn => data[cn].m[0].t)) + 30 * D1, t1 = Math.max(...coins.map(cn => data[cn].m.at(-1).t)), cut = t0 + SPLIT * (t1 - t0);
const fmtD = t => new Date(t).toISOString().slice(0, 10);
const seg = (tr, mo = 5) => ({ IS: portfolio(tr, t0, cut, mo), OOS: portfolio(tr, cut, Infinity, mo), ALL: portfolio(tr, t0, Infinity, mo) });
const row = (label, r) => `| ${label} | ${r.IS.win}%/${r.IS.avgR}/${r.IS.dd}%（${r.IS.n}）| ${r.OOS.win}%/${r.OOS.avgR}/${r.OOS.dd}%（${r.OOS.n}）| ${r.ALL.win}%/${r.ALL.avgR}/${r.ALL.dd}%/${r.ALL.n} |`;
const HDR = ["| 版本 | 樣本內 勝率/平均R/回撤（筆數） | 樣本外 勝率/平均R/回撤（筆數） | 全期 勝率/平均R/回撤/筆數 |", "|---|---|---|---|"];
const okSeg = (b, x) => x.n >= 30 && x.win > b.win && x.avgR >= 0.9 * b.avgR && x.avgR > 0 && x.dd <= 1.2 * b.dd + 1e-9;
function whySeg(nm, b, x) { const why = []; if (x.n < 30) why.push(`${nm}筆數 ${x.n} < 30`); if (!(x.win > b.win)) why.push(`${nm}勝率沒提高（${b.win}→${x.win}）`); if (!(x.avgR >= 0.9 * b.avgR && x.avgR > 0)) why.push(`${nm}平均R 低於 90%（${b.avgR}→${x.avgR}）`); if (!(x.dd <= 1.2 * b.dd + 1e-9)) why.push(`${nm}回撤超過 1.2 倍（${b.dd}%→${x.dd}%）`); return why; }
function judge(base, v) { const why = [...whySeg("樣本內", base.IS, v.IS), ...whySeg("樣本外", base.OOS, v.OOS)]; return { pass: okSeg(base.IS, v.IS) && okSeg(base.OOS, v.OOS), why }; }
const J = j => `${j.pass ? "**合格**" : "**不合格**"}${j.why.length ? "；原因：" + j.why.join("；") : ""}`;
const mk = p => p ? " ✅" : " ❌";
const bySt = p => Object.entries(p.byState).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；") || "無";
const byW = p => Object.entries(p.byWhy).map(([k, v]) => `${k} ${v.n} 筆（${v.avgR}R）`).join("、") || "無";
const byC = p => Object.entries(p.byCoin).sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([k, v]) => `${k} ${v.n} 筆／${v.avgR}R`).join("；") || "無";
const bySd = p => Object.entries(p.bySide).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；") || "無";
const verdictNote = (j, v) => { const small = v.IS.n < 30 || v.OOS.n < 30; if (j.pass) return ""; const onlySize = j.why.every(w => /筆數/.test(w)); return small ? (onlySize ? "（筆數不足、數字本身過關：判不了，等樣本）" : "（筆數不足且數字也差）") : "（樣本夠，是真的差）"; };
// 按月：正月數／總月數、最好與最差月、是否靠 1–2 個月撐（最大兩個月合計R 佔總R 比例）
function monthly(p) { const ms = Object.entries(p.byMonth).sort(); if (!ms.length) return { months: 0, pos: 0, text: "無", top2: 0 }; const pos = ms.filter(([, v]) => v.avgR > 0).length; const sums = ms.map(([k, v]) => [k, v.avgR * v.n]); const tot = sums.reduce((a, x) => a + x[1], 0); const top2 = sums.map(x => x[1]).sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0); return { months: ms.length, pos, top2: tot > 0 ? +(top2 / tot).toFixed(2) : null, text: ms.map(([k, v]) => `${k.slice(2)} ${v.avgR > 0 ? "+" : ""}${v.avgR}(${v.n})`).join("、") }; }
const monthText = m => `${m.months} 個月中 ${m.pos} 個月為正${m.top2 != null ? `、最好兩個月佔總R ${Math.round(m.top2 * 100)}%` : "（總R ≤0，最好兩個月佔比不計）"}`;
const costMul = (tr, k) => tr.map(x => ({ ...x, R: x.gross - k * x.costR }));
const dIdx = {}; for (const cn of coins) { const m = new Map(); data[cn].d.forEach((b, i) => m.set(dk(b.t), i)); dIdx[cn] = m; }
const fundSum = (cn, d0, d1) => { let s = 0, k = 0; for (let d = d0; d < d1; d++) { const f = frAt(cn, d); if (!isNaN(f)) { s += f; k++; } } return { s, k }; };
const breakEven = tr => { const g = tr.reduce((a, x) => a + x.gross, 0), c = tr.reduce((a, x) => a + x.costR, 0); return c > 0 ? +(g / c).toFixed(2) : null; };
const pos2 = v => v.IS.avgR > 0 && v.OOS.avgR > 0;
const byYear = tr => { const g = {}; for (const x of tr) { const y = new Date(x.t).getUTCFullYear(); const v = g[y] ||= { n: 0, w: 0, s: 0 }; v.n++; if (x.R > 0) v.w++; v.s += x.R; } const o = {}; for (const [k, v] of Object.entries(g)) o[k] = { n: v.n, win: +(100 * v.w / v.n).toFixed(1), avgR: +(v.s / v.n).toFixed(3) }; return o; };
const yrText = o => Object.entries(o).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；") || "無";
const grp = (tr, key) => { const g = {}; for (const x of tr) { const k = x[key] ?? "未知"; const v = g[k] ||= { n: 0, w: 0, s: 0 }; v.n++; if (x.R > 0) v.w++; v.s += x.R; } const o = {}; for (const [k, v] of Object.entries(g)) o[k] = { n: v.n, win: +(100 * v.w / v.n).toFixed(1), avgR: +(v.s / v.n).toFixed(3) }; return o; };
const grpText = o => Object.entries(o).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；") || "無";
// 絕對門檻判定（無原本部門；與 run31 C17 同）
function judgeAbs(raw) { const v = seg(raw), v15 = seg(costMul(raw, 1.5)), be = breakEven(raw); const why = []; for (const [nm2, s, s15] of [["樣本內", v.IS, v15.IS], ["樣本外", v.OOS, v15.OOS]]) { if (s.n < 30) why.push(`${nm2}筆數 ${s.n} < 30`); if (!(s.avgR > 0)) why.push(`${nm2}平均R ${s.avgR} ≤ 0`); if (!(s.win > 50)) why.push(`${nm2}勝率 ${s.win}% ≤ 50%`); if (!(s15.avgR > 0)) why.push(`${nm2}成本×1.5 後平均R ${s15.avgR} ≤ 0`); } if (!(be >= 1.5)) why.push(`損益兩平成本倍數 ${be} < 1.5`); return { pass: !why.length, res: v, res15: v15, be, why, n: raw.length }; }
const smallOf = v => v.IS.n < 30 || v.OOS.n < 30;
const verdictAbs = j => j.pass ? "合格" : smallOf(j.res) ? (j.why.every(w => /筆數/.test(w)) ? "判不了（筆數不足、數字本身過關）" : "判不了（筆數不足且數字也差）") : "不合格（樣本夠，是真的差）";
const hIdx = {}; for (const cn of coins) { const m = new Map(); data[cn].h.forEach((b, i) => m.set(b.t, i)); hIdx[cn] = m; }
// 前 5 幣（進場前一日 30 日均成交額，排除 BTC／ETH，點時選取）
function top5At(t) { const d = dk(t) - 1; const sc = []; for (const cn of U19) { if (cn === "BTC" || cn === "ETH") continue; const v = LIQ[cn].get(d); if (v > 0) sc.push([cn, v]); } sc.sort((a, b) => b[1] - a[1]); return sc.slice(0, 5).map(x => x[0]); }
const EVALL = EVP.filter(e => e.t >= t0 && e.t < t1);
const feeLegs = (t, tx) => { let k = 0; for (let u = Math.ceil(t / (8 * H1)) * 8 * H1; u < tx; u += 8 * H1) k++; return k; }; // 跨幾次 8h 費率結算
const frLeg = (cn, t, tx) => { const d = dk(t); const f = frAt(cn, d - 1); return isNaN(f) ? NaN : f / 100 / 3 * feeLegs(t, tx); }; // 用前一日費率日合計／3 估每次結算（比例）

// ===== 六個上線部門（原本）=====
const XA = { tp: 0, f: 0, be: false }, XB = { tp: 1, f: 0.33, be: true }, QI = { vol: 1.5, cs: 0.6 };
const isMonUTC = t => new Date(t).getUTCDay() === 1;
const DEPTS = [
  { key: "A", name: "波段A", kind: "swing", q: {}, x: XA, f: {} },
  { key: "B", name: "波段B（1R先平1/3＋保本）", kind: "swing", q: {}, x: XB, f: {} },
  { key: "AM", name: "波段A-M（波段A＋週一 UTC 不開新單）", kind: "swing", q: {}, x: XA, f: {}, ban: (cn, t) => isMonUTC(t) },
  { key: "I2", name: "日內B（≥5 億U）", kind: "intra", q: QI, x: XA, f: { liq: 500 } },
  { key: "I3", name: "日內C（日內B＋事件前後 4h 不開單）", kind: "intra", q: QI, x: XA, f: { liq: 500, ev: true } },
  { key: "I4", name: "日內D（日內＋BTC 趨勢上不開單）", kind: "intra", q: QI, x: XA, f: { liq: 100, trend: true } },
];
const runRaw = (S, U, o = {}) => U.list.flatMap(cn => trades(cn, S, U, { ...o, ban: S.ban || o.ban }));
const RAW = {};
for (const S of DEPTS) { RAW[S.key] = runRaw(S, UNI19); console.log("原本", S.key, RAW[S.key].length, "筆（幣層）", elapsed()); }

// ===== 熔斷版組合（rules 任一條為 null＝不套；全 null＝原本）=====
// rules: { day: -2, streak: 2, week: -5, month: -8 }；只擋新開單，不平已開的單；只用已平倉（tx ≤ t）單的 R
function portfolioBrk(ts0, from, to, maxOpen = 5, rules = {}) {
  const ts = ts0.filter(x => x.t >= from && x.t < to).sort((a, b) => a.t - b.t);
  let eq = 1, peak = 1, dd = 0, open = [], n = 0, w = 0, s = 0; const byState = {}, byWhy = {}, bySide = {}, byCoin = {}, byMonth = {}; const ledger = []; const skipped = []; const byRule = { 單日: 0, 連敗: 0, 週: 0, 月: 0 };
  const settle = u => { open.sort((a, b) => a.tx - b.tx); while (open.length && open[0].tx <= u) { const o = open.shift(); eq += o.amt * o.R; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); ledger.push({ tx: o.tx, R: o.R }); } };
  const acc = (m, k, R) => { const v = m[k] ||= { n: 0, w: 0, s: 0 }; v.n++; if (R > 0) v.w++; v.s += R; };
  const sumSince = u => { let k = 0; for (let i = ledger.length - 1; i >= 0 && ledger[i].tx >= u; i--) k += ledger[i].R; return k; };
  const blocked = t => {
    const hit = [];
    if (rules.day != null) { const d0 = Math.floor(t / D1) * D1; if (sumSince(d0) <= rules.day) hit.push("單日"); }
    if (rules.week != null) { const dow = (new Date(t).getUTCDay() + 6) % 7; const w0 = Math.floor(t / D1) * D1 - dow * D1; if (sumSince(w0) <= rules.week) hit.push("週"); }
    if (rules.month != null) { const dt = new Date(t); const m0 = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1); if (sumSince(m0) <= rules.month) hit.push("月"); }
    if (rules.streak != null && ledger.length >= rules.streak) { let k = 0, last = 0; for (let i = ledger.length - 1; i >= 0 && ledger[i].R < 0; i--) { k++; last = Math.max(last, ledger[i].tx); } if (k >= rules.streak && t < last + 24 * H1) hit.push("連敗"); }
    return hit;
  };
  for (const x of ts) {
    settle(x.t);
    const hit = blocked(x.t); if (hit.length) { skipped.push(x); for (const h of hit) byRule[h]++; continue; }
    if (open.length >= maxOpen || open.some(o => o.cn === x.cn)) continue;
    open.push({ ...x, amt: eq * 0.01 }); n++; if (x.R > 0) w++; s += x.R; acc(byState, x.state || "未知", x.R); acc(byWhy, x.why || "", x.R); acc(bySide, x.side || "多", x.R); acc(byCoin, x.cn, x.R); acc(byMonth, new Date(x.t).toISOString().slice(0, 7), x.R);
  }
  settle(Infinity); const Y = ((to === Infinity ? Date.now() : to) - from) / (365 * D1);
  const fin = m => { const o = {}; for (const [k, v] of Object.entries(m)) o[k] = { n: v.n, win: +(v.w / v.n * 100).toFixed(1), avgR: +(v.s / v.n).toFixed(3) }; return o; };
  const skR = skipped.length ? +(skipped.reduce((a, x) => a + x.R, 0) / skipped.length).toFixed(3) : null, skW = skipped.length ? +(skipped.filter(x => x.R > 0).length / skipped.length * 100).toFixed(1) : null;
  return { n, win: n ? +(w / n * 100).toFixed(1) : 0, avgR: n ? +(s / n).toFixed(3) : 0, sumR: +s.toFixed(2), cagr: eq > 0 ? +((Math.pow(eq, 1 / Y) - 1) * 100).toFixed(1) : -100, dd: +(dd * 100).toFixed(1), skipped: skipped.length, skAvgR: skR, skWin: skW, byRule, byState: fin(byState), byWhy: fin(byWhy), bySide: fin(bySide), byCoin: fin(byCoin), byMonth: fin(byMonth) };
}
const segB = (tr, rules, mo = 5) => ({ IS: portfolioBrk(tr, t0, cut, mo, rules), OOS: portfolioBrk(tr, cut, Infinity, mo, rules), ALL: portfolioBrk(tr, t0, Infinity, mo, rules) });
const FULL = { day: -2, streak: 2, week: -5, month: -8 };
const NEIGH = [["單日 −1.6R", { ...FULL, day: -1.6 }], ["單日 −2.4R", { ...FULL, day: -2.4 }], ["週 −4R", { ...FULL, week: -4 }], ["週 −6R", { ...FULL, week: -6 }], ["月 −6.4R", { ...FULL, month: -6.4 }], ["月 −9.6R", { ...FULL, month: -9.6 }], ["連敗 3 筆", { ...FULL, streak: 3 }]];
const SINGLE = [["只套單日 −2R", { day: -2 }], ["只套連敗 2 筆冷卻 24h", { streak: 2 }], ["只套週 −5R", { week: -5 }], ["只套月 −8R", { month: -8 }]];

const OUT = { created: new Date().toISOString(), coins: coins.length, list19: U19, exp1: {}, exp2: {}, extra: {} };
const L = ["# 策略實驗室 第三十三輪：E 熔斷「加 vs 不加」（六部門）＋R12-F 事件日擁擠方清洗順勢（無 OI、第一級成本幣版）＋補測 事件後一小時停損集中度", "",
  `產生時間：${OUT.created}；資料幣種 ${coins.length}（固定清單 list19 ${U19.length} 幣）；Binance 15 分K ${MONTHS} 個月；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；成本一律用分級成本（≥20 億U 0.14%、5–20 億 0.25%、1–5 億 0.40%、<1 億 0.70%）；每筆風險 1%；最多 5 張`, "",
  "鐵律：合格＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；過擬合審查＝主要參數各上下 20% 後大部分變體仍合格；審查表 A 另看 成本 ×1.5／×2、停損高原、按月。實驗一「原本」＝各部門不加熔斷；實驗二無對應部門 → 絕對門檻（兩段各 ≥30 筆、兩段平均R>0、兩段勝率>50%、損益兩平成本倍數 ≥1.5、成本 ×1.5 後兩段平均R 仍 >0；鄰近過半才算通過審查）。樣本外 <30 筆＝判不了。沒過就是沒過，不放寬。", "",
  "偏誤交代（審查表 B）：幣池固定 list19（存活者偏差）；只用已收盤 K；進場用下一根開盤；成本分級；熔斷只用「已平倉（tx ≤ 開單時間）」單的 R 計算、不偷看浮動損益，日／週／月以 UTC 計；R12-F 事件時刻寫死（美東含夏令／冬令）、費率只用 d−1 以前、幣池用進場前一日 30 日均成交額 ≥20 億U 點時選取、主表未計費率（另列估算）、停損用 min(開盤,停損) 保守出、滑價另計；參數只在樣本內定、樣本外只看不調。", ""];

// ===== 實驗一：E 熔斷 加 vs 不加 =====
L.push("## 實驗一：E 熔斷「加 vs 不加」（六個上線部門；原本＝各部門不加熔斷）", "",
  "定義：進出場完全不動，新開單前檢查組合層已實現 R（UTC）：①單日 ≤ −2R 當日停單；②連續 2 筆虧損 → 最後一筆虧損平倉後 24h 內不開新單；③本週（週一 00:00 UTC 起）≤ −5R 停到下週一；④本月 ≤ −8R 停到下月 1 日；多條同時觸發取最嚴。鄰近（±20%）：單日 −1.6／−2.4R、週 −4／−6R、月 −6.4／−9.6R、連敗 3 筆。另列：四條各自單獨套用、被擋掉那批單的筆數／勝率／平均R（反事實）、成本 ×1.5／×2、按月。", "");
{
  const o = { depts: {}, tried: 0, passed: 0 };
  let passDepts = 0;
  for (const S of DEPTS) {
    const raw = RAW[S.key]; const base = segB(raw, {}), full = segB(raw, FULL); const jF = judge(base, full); o.tried++; if (jF.pass) o.passed++;
    const d = { base, full, judge: jF, neigh: {}, single: {}, extra: {} };
    L.push(`### ${S.name}`, "", ...HDR, row("原本（不加熔斷）", base), row("加熔斷（四條全套）" + mk(jF.pass), full));
    let np = 0, nn = 0;
    for (const [nm2, rl] of NEIGH) { const v = segB(raw, rl), nj = judge(base, v); o.tried++; if (nj.pass) o.passed++; nn++; if (nj.pass) np++; d.neigh[nm2] = { res: v, judge: nj }; L.push(row("　鄰近：" + nm2 + mk(nj.pass), v)); }
    for (const [nm2, rl] of SINGLE) { const v = segB(raw, rl), nj = judge(base, v); d.single[nm2] = { res: v, judge: nj }; L.push(row("　另列：" + nm2 + mk(nj.pass), v)); }
    for (const k of [1.5, 2]) { const rc = costMul(raw, k); const b2 = segB(rc, {}), v2 = segB(rc, FULL), nj = judge(b2, v2); d.extra[`成本 ×${k}`] = { base: b2, res: v2, judge: nj }; L.push(row(`　另列：成本 ×${k} 原本`, b2), row(`　另列：成本 ×${k} 加熔斷` + mk(nj.pass), v2)); }
    d.overfit = { n: nn, pass: np, ok: np * 2 > nn }; d.ok = jF.pass && d.overfit.ok; if (d.ok) passDepts++;
    const mB = monthly(base.ALL), mF = monthly(full.ALL); d.month = { base: mB, full: mF };
    const A = full.ALL;
    L.push("", `${S.name}：原本全期 ${base.ALL.n} 筆／合計 ${base.ALL.sumR}R／回撤 ${base.ALL.dd}%；加熔斷 ${A.n} 筆／合計 ${A.sumR}R／回撤 ${A.dd}%；被擋掉 ${A.skipped} 筆（反事實：勝率 ${A.skWin ?? "—"}%、平均 ${A.skAvgR ?? "—"}R）；觸發次數 單日 ${A.byRule.單日}／連敗 ${A.byRule.連敗}／週 ${A.byRule.週}／月 ${A.byRule.月}；按月（原本）${monthText(mB)}；按月（加熔斷）${monthText(mF)}；樣本外被擋 ${full.OOS.skipped} 筆（平均 ${full.OOS.skAvgR ?? "—"}R）`);
    L.push(`判定：${J(jF)}${verdictNote(jF, full)}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${d.overfit.ok ? "通過" : "未通過"} → **${d.ok ? "合格（可寫進 bot.mjs 該部門）" : (full.IS.n < 30 || full.OOS.n < 30) ? "判不了" : "不合格（該部門維持不加熔斷）"}**`);
    L.push(`【審查表】${S.name}＋E 熔斷：共試 ${1 + nn} 組（基準 1＋鄰近 ${nn}）、合格 ${(jF.pass ? 1 : 0) + np} 組；成本 ×1.5 加熔斷兩段平均R ${d.extra["成本 ×1.5"].res.IS.avgR}／${d.extra["成本 ×1.5"].res.OOS.avgR}、×2 ${d.extra["成本 ×2"].res.IS.avgR}／${d.extra["成本 ×2"].res.OOS.avgR}；按月 ${mF.months} 個月中 ${mF.pos} 個月為正（原本 ${mB.pos}）；被擋單平均 ${A.skAvgR ?? "—"}R`, "");
    o.depts[S.key] = d; console.log("熔斷", S.key, "完成", elapsed());
  }
  o.passDepts = passDepts; OUT.exp1 = o;
  L.push(`實驗一小結：六部門中 ${passDepts} 個部門「加熔斷」合格（鐵律＋鄰近過半）；共試 ${o.tried} 組、合格 ${o.passed} 組。合格的部門才可寫進 bot.mjs（只擋新開單）；不合格的部門維持不加。被擋掉的單若平均R 為正，代表熔斷在砍好單，不該加。`, "");
}

// ===== 實驗二：R12-F 無 OI、第一級成本幣版 =====
L.push("## 實驗二：R12-F 事件日擁擠方清洗順勢（無 OI、第一級成本幣 ≥20 億U 點時選取；擁擠度用 BTC 費率；無對應部門 → 絕對門檻）", "",
  "定義：事件日 d（UTC）：BTC d−5～d−1 五個費率日合計同號（全正＝多擁擠 → 只做空；全負＝空擁擠 → 只做多），不看 OI。標的＝進場前一日 30 日均成交額 ≥20 億U 的 list19 幣（點時選取）。觸發：含公布時刻的 4h K 收盤相對該根開盤逆擁擠方向 ≥1%；進場＝下一根 4h 開盤；停損＝事件 4h K 極值；出場＝1.5R 停利或持有 6 根 4h（24h）收盤平倉（同根先算停損）。鄰近（±20%）：觸發 0.8／1.2%、持有 5／7 根、R:R 1.2／1.8。另列：停損距離 ×0.5／0.75／1.25／1.5、成本 ×1.5／×2、只多／只空、各幣自己費率版、只 BTC／ETH（run32 無 OI 對照重現）、按事件類型、費率腿估算。", "");
const tier1At = t => { const d = dk(t) - 1; return U19.filter(cn => (LIQ[cn].get(d) || 0) >= 2000e6); };
function r12(opt = {}) {
  const { trig = 0.01, hold = 6, rr = 1.5, stopMul = 1, ownFR = false, pick = tier1At, costMul: cm = 1 } = opt; const out = []; let pre = 0, sig = 0, cand = 0; const coinSet = {};
  for (const ev of EVALL) {
    const d = dk(ev.t);
    for (const cn of pick(ev.t)) {
      if (!data[cn]) continue; const gcn = ownFR ? cn : "BTC"; cand++;
      let crowd = 0, okF = true; for (let k = 1; k <= 5; k++) { const f = frAt(gcn, d - k); if (isNaN(f) || f === 0) { okF = false; break; } const s = f > 0 ? 1 : -1; if (!crowd) crowd = s; else if (crowd !== s) { okF = false; break; } } if (!okF || !crowd) continue; pre++;
      const H = data[cn].h, hi = hIdx[cn]; const t4 = Math.floor(ev.t / H4) * H4; const i4 = hi.get(t4); if (i4 == null || i4 + 1 >= H.length) continue; const b4 = H[i4]; const mv = b4.c / b4.o - 1;
      const side = -crowd; if (!(side * mv >= trig)) continue; sig++;
      const M = data[cn].m, ix = mIdx[cn]; const iE = ix.get(t4 + H4); if (iE == null) continue; const e = M[iE].o; if (!(e > 0)) continue;
      const ext = side > 0 ? b4.l : b4.h; let r = Math.abs(e - ext) * stopMul; if (!(r > 0) || r / e < 0.001) continue; const st = side > 0 ? e - r : e + r, tp = side > 0 ? e + rr * r : e - rr * r; const iEnd = Math.min(iE + hold * 16 - 1, M.length - 1);
      let ex = M[iEnd].c, why = "時間平倉", tx = M[iEnd].t + M15;
      for (let i = iE; i <= iEnd; i++) { const b = M[i]; if (side > 0 ? b.l <= st : b.h >= st) { ex = side > 0 ? Math.min(b.o, st) : Math.max(b.o, st); why = "停損"; tx = b.t + M15; break; } if (side > 0 ? b.h >= tp : b.l <= tp) { ex = side > 0 ? Math.max(b.o, tp) : Math.min(b.o, tp); why = "停利"; tx = b.t + M15; break; } }
      const gross = side * (ex - e) / r, costR = tieredCost(cn, M[iE].t) * e / r, fl = frLeg(cn, M[iE].t, tx); const feeR = isNaN(fl) ? 0 : -side * fl * e / r;
      coinSet[cn] = (coinSet[cn] || 0) + 1;
      out.push({ cn, t: M[iE].t, tx, R: gross - cm * costR, gross, costR, feeR, state: stateAt(M[iE].t), why, side: side > 0 ? "多" : "空", ev: ev.k, crowd: crowd > 0 ? "多擁擠" : "空擁擠", rPct: +(r / e * 100).toFixed(2) });
    }
  }
  out.pre = pre; out.sig = sig; out.cand = cand; out.coinSet = coinSet; return out;
}
{
  const o = { neigh: {}, extra: {}, tried: 0, passed: 0 }; const cnt = j => { o.tried++; if (j.pass) o.passed++; return j; };
  const rawB = r12(); const jB = cnt(judgeAbs(rawB)); o.base = { judge: jB, res: jB.res, be: jB.be, raw: rawB.length, pre: rawB.pre, sig: rawB.sig, cand: rawB.cand, coins: rawB.coinSet };
  L.push(...HDR, row("R12-F 基準：≥20 億U 幣、BTC 費率同號、觸發 1%、1.5R／24h" + mk(jB.pass), jB.res));
  let np = 0, nn = 0;
  for (const [nm2, opt] of [["觸發 0.8%", { trig: 0.008 }], ["觸發 1.2%", { trig: 0.012 }], ["持有 5 根", { hold: 5 }], ["持有 7 根", { hold: 7 }], ["R:R 1.2", { rr: 1.2 }], ["R:R 1.8", { rr: 1.8 }]]) {
    const rr2 = r12(opt), nj = cnt(judgeAbs(rr2)); o.neigh[nm2] = { judge: nj, res: nj.res, be: nj.be, raw: rr2.length }; nn++; if (nj.pass) np++; L.push(row("　鄰近：" + nm2 + mk(nj.pass), nj.res));
  }
  const stops = {}; let sp = 0; for (const sm of [0.5, 0.75, 1.25, 1.5]) { const rr2 = r12({ stopMul: sm }), nj = cnt(judgeAbs(rr2)); stops[sm] = { judge: nj, res: nj.res, be: nj.be }; if (nj.pass) sp++; L.push(row(`　停損距離 ×${sm}` + mk(nj.pass), nj.res)); } o.stops = stops; o.plateau = `${sp}/4`;
  const v15 = seg(costMul(rawB, 1.5)), v2 = seg(costMul(rawB, 2)); o.extra["成本 ×1.5"] = { res: v15, pos: pos2(v15) }; o.extra["成本 ×2"] = { res: v2, pos: pos2(v2) };
  L.push(row("　另列：成本 ×1.5（兩段平均R>0？）" + mk(pos2(v15)), v15), row("　另列：成本 ×2（兩段平均R>0？）" + mk(pos2(v2)), v2));
  const vL = seg(rawB.filter(x => x.side === "多")), vS = seg(rawB.filter(x => x.side === "空")); o.extra["只多"] = { res: vL, pos: pos2(vL) }; o.extra["只空"] = { res: vS, pos: pos2(vS) };
  L.push(row("　另列：只做多（空擁擠清洗）" + mk(pos2(vL)), vL), row("　另列：只做空（多擁擠清洗）" + mk(pos2(vS)), vS));
  const rawOwn = r12({ ownFR: true }), jOwn = cnt(judgeAbs(rawOwn)); o.extra["各幣自己費率"] = { judge: jOwn, res: jOwn.res, be: jOwn.be, raw: rawOwn.length };
  L.push(row("　另列：各幣自己費率版" + mk(jOwn.pass), jOwn.res));
  const raw2 = r12({ pick: () => ["BTC", "ETH"] }), j2 = cnt(judgeAbs(raw2)); o.extra["只 BTC／ETH（run32 重現）"] = { judge: j2, res: j2.res, be: j2.be, raw: raw2.length };
  L.push(row("　另列：只 BTC／ETH（run32 無 OI 對照重現）" + mk(j2.pass), j2.res));
  const rawFee = rawB.map(x => ({ ...x, R: x.R + x.feeR })), vFee = seg(rawFee); o.extra["含費率腿估算"] = { res: vFee };
  L.push(row("　另列：含費率腿估算" + mk(pos2(vFee)), vFee));
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = jB.pass && o.overfit.ok; o.res = jB.res; o.month = monthly(jB.res.ALL); o.year = byYear(rawB); o.byEv = grp(rawB, "ev"); o.byCrowd = grp(rawB, "crowd"); o.byCoin = grp(rawB, "cn");
  const avgRp = rawB.length ? +(rawB.reduce((a, x) => a + x.rPct, 0) / rawB.length).toFixed(2) : null;
  L.push("", `R12-F 基準：事件×幣 候選 ${rawB.cand}、過前置（費率同號）${rawB.pre}、過觸發 ${rawB.sig}、成交 ${rawB.length} 筆（各幣自己費率版 ${rawOwn.length} 筆、只 BTC／ETH ${raw2.length} 筆）；分幣：${grpText(o.byCoin)}；平均停損距離 ${avgRp}%；損益兩平成本倍數 基準 ${jB.be}、自己費率 ${jOwn.be}、只 BTC／ETH ${j2.be}；多空：${bySd(jB.res.ALL)}；擁擠方向：${grpText(o.byCrowd)}；出場原因：${byW(jB.res.ALL)}；分狀態：${bySt(jB.res.ALL)}；按事件類型：${grpText(o.byEv)}；按月平均R：${o.month.text}；時間穩定：${monthText(o.month)}；按年：${yrText(o.year)}；成本 ×1.5 兩段平均R ${v15.IS.avgR}／${v15.OOS.avgR}、×2 ${v2.IS.avgR}／${v2.OOS.avgR}；停損高原 ${o.plateau}；含費率腿全期平均R ${vFee.ALL.avgR}`);
  L.push(`判定：${J(jB)}（${verdictAbs(jB)}）；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → **${o.ok ? "合格（新部門候選，與現有各組並列）" : verdictAbs(jB).startsWith("判不了") ? "判不了" : "不合格"}**`);
  L.push(`【審查表】R12-F：共試 ${o.tried} 組（基準 1＋鄰近 ${nn}＋停損 4＋自己費率 1＋只 BTC／ETH 1）、合格 ${o.passed} 組；成本 ×1.5 兩段平均R ${v15.IS.avgR}／${v15.OOS.avgR}${pos2(v15) ? "（仍正）" : "（轉負）"}、×2 ${v2.IS.avgR}／${v2.OOS.avgR}${pos2(v2) ? "（仍正）" : "（轉負）"}；按月 ${o.month.months} 個月中 ${o.month.pos} 個月為正；最好兩個月佔總R ${o.month.top2 != null ? Math.round(o.month.top2 * 100) + "%" : "不計（總R ≤0）"}；停損高原 ${o.plateau}；只多 ${vL.ALL.n} 筆／${vL.ALL.avgR}R、只空 ${vS.ALL.n} 筆／${vS.ALL.avgR}R`, "");
  OUT.exp2 = o; console.log("R12-F 完成", rawB.length, "筆", elapsed());
}

// ===== 補測：事件後一小時停損集中度 =====
L.push("## 補測（不佔名額）：六部門回測單「停損」出場落在 FOMC／CPI／非農／PPI 公布後 0–60 分鐘（另列 0–4 小時）的比例 vs 該窗口佔持倉時間的比例", "",
  "出處：Yang & Wang 2026 FRL（FOMC 聲明後第一小時 BTC 絕對報酬 ×1.9、成交 ×2.5–2.8）。只看集中度：若停損落在事件後 1 小時的比例遠高於該窗口佔全部持倉時間的比例，才值得排「事件後 1 小時暫時放寬停損／不開新單」的出場改良題；否則放掉。", "");
{
  const o = {};
  const inWin = (u, w) => EVP.some(e => u >= e.t && u < e.t + w);
  for (const S of DEPTS) {
    const tr = RAW[S.key].filter(x => x.t >= t0); const stops = tr.filter(x => x.why === "停損");
    const stat = w => { const k = stops.filter(x => inWin(x.tx, w)).length; let hold = 0, inW = 0; for (const x of tr) { hold += x.tx - x.t; for (const e of EVP) { const a = Math.max(x.t, e.t), b = Math.min(x.tx, e.t + w); if (b > a) inW += b - a; } } return { stopsIn: k, stopsAll: stops.length, pctStops: stops.length ? +(k / stops.length * 100).toFixed(1) : null, pctTime: hold ? +(inW / hold * 100).toFixed(1) : null, stopRIn: k ? +(stops.filter(x => inWin(x.tx, w)).reduce((a, x) => a + x.R, 0) / k).toFixed(3) : null }; };
    const s1 = stat(H1), s4 = stat(4 * H1); o[S.key] = { h1: s1, h4: s4 };
    L.push(`- ${S.name}：停損 ${s1.stopsAll} 筆，其中事件後 0–60 分 ${s1.stopsIn} 筆（${s1.pctStops ?? "—"}%；該窗口佔持倉時間 ${s1.pctTime ?? "—"}%；這些停損平均 ${s1.stopRIn ?? "—"}R）、0–4 小時 ${s4.stopsIn} 筆（${s4.pctStops ?? "—"}% vs 時間 ${s4.pctTime ?? "—"}%）→ ${s1.pctStops != null && s1.pctTime != null && s1.pctStops > 2 * s1.pctTime && s1.stopsIn >= 5 ? "**集中**（值得排出場改良）" : "不集中"}`);
  }
  OUT.extra.evStop = o; L.push("");
}

const finA = OUT.exp1; const finB = OUT.exp2;
L.push(`結論：實驗一 E 熔斷 六部門中 ${finA.passDepts} 個合格（共試 ${finA.tried} 組合格 ${finA.passed} 組）；實驗二 R12-F ${finB.ok ? "合格" : verdictAbs(finB.base.judge).startsWith("判不了") ? "判不了" : "不合格"}（全期 ${finB.res.ALL.n} 筆、樣本外 ${finB.res.OOS.n} 筆；共試 ${finB.tried} 組合格 ${finB.passed} 組；鄰近 ${finB.overfit.pass}/${finB.overfit.n}；停損高原 ${finB.plateau}）。合格者才能寫進機器人或以新一組虛擬單並列上線；判不了＝等樣本，不得當作「差」也不得上線。`);
await fs.writeFile("lab/report33.md", L.join("\n"));
await fs.writeFile("lab/results33.json", JSON.stringify(OUT));
console.log(L.join("\n"));
