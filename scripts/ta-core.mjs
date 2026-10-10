// 技術指標共用函式（與網頁相同）

export const PIV=3;
export function fmtP(p){if(p==null||!isFinite(p))return"—";const a=Math.abs(p);const d=a>=1000?1:a>=100?2:a>=1?3:a>=0.1?4:5;return p.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d})}
export function ema(a,n){const o=new Array(a.length).fill(NaN);if(a.length<n)return o;let s=0;for(let i=0;i<n;i++)s+=a[i];o[n-1]=s/n;const k=2/(n+1);for(let i=n;i<a.length;i++)o[i]=a[i]*k+o[i-1]*(1-k);return o}
export function sma(a,n){const o=new Array(a.length).fill(NaN);let s=0;for(let i=0;i<a.length;i++){s+=a[i];if(i>=n)s-=a[i-n];if(i>=n-1)o[i]=s/n}return o}
export function rsi(a,n=14){const o=new Array(a.length).fill(NaN);if(a.length<=n)return o;let g=0,l=0;for(let i=1;i<=n;i++){const d=a[i]-a[i-1];if(d>0)g+=d;else l-=d}g/=n;l/=n;o[n]=l===0?100:100-100/(1+g/l);for(let i=n+1;i<a.length;i++){const d=a[i]-a[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n;o[i]=l===0?100:100-100/(1+g/l)}return o}
export function atr(c,n=14){const o=new Array(c.length).fill(NaN);if(c.length<=n)return o;const tr=c.map((x,i)=>i?Math.max(x.h-x.l,Math.abs(x.h-c[i-1].c),Math.abs(x.l-c[i-1].c)):x.h-x.l);let s=0;for(let i=1;i<=n;i++)s+=tr[i];o[n]=s/n;for(let i=n+1;i<c.length;i++)o[i]=(o[i-1]*(n-1)+tr[i])/n;return o}
export function pivots(c){const ph=new Array(c.length).fill(false),pl=new Array(c.length).fill(false);for(let k=PIV;k<c.length-PIV;k++){let hi=true,lo=true;for(let j=k-PIV;j<=k+PIV;j++){if(j===k)continue;if(c[j].h>=c[k].h)hi=false;if(c[j].l<=c[k].l)lo=false}ph[k]=hi;pl[k]=lo}return{ph,pl}}
export function prep(c,dt){const cl=c.map(x=>x.c);const p=pivots(c);return{c,dt,e20:ema(cl,20),e50:ema(cl,50),e200:ema(cl,200),rsi:rsi(cl),atr:atr(c),vs:sma(c.map(x=>x.v),20),ph:p.ph,pl:p.pl}}
export function tIdx(T,t){let lo=0,hi=T.c.length-1,ans=-1;while(lo<=hi){const m=(lo+hi)>>1;if(T.c[m].t+T.dt<=t){ans=m;lo=m+1}else hi=m-1}return ans}
/* 支撐壓力：只用到 i 為止已確認的轉折點，相近價位合併，碰越多次越強 */
export function levels(P,i,look=200){const a=P.atr[i];const pts=[];for(let k=Math.max(0,i-look);k<=i-PIV;k++){if(P.ph[k])pts.push(P.c[k].h);if(P.pl[k])pts.push(P.c[k].l)}pts.sort((x,y)=>x-y);const out=[];for(const p of pts){const last=out[out.length-1];if(last&&p-last.hi<=0.6*a){last.hi=p;last.sum+=p;last.n++}else out.push({hi:p,sum:p,n:1})}return out.map(x=>({price:x.sum/x.n,touches:x.n}))}
export function trendAt(T,j){if(j<6)return{dir:0,pts:0,txt:"大週期資料不足"};const c=T.c[j].c,e50=T.e50[j],e200=T.e200[j],up=T.e50[j]>T.e50[j-5];
  if(!(e200>0))return{dir:0,pts:0,txt:"大週期資料不足"};
  if(c>e50&&e50>e200&&up)return{dir:1,pts:25,txt:"大週期多頭排列，均線向上"};
  if(c<e50&&e50<e200&&!up)return{dir:-1,pts:25,txt:"大週期空頭排列，均線向下"};
  if(c>e200&&e50>e200)return{dir:1,pts:12,txt:"大週期偏多，但短期轉弱"};
  if(c<e200&&e50<e200)return{dir:-1,pts:12,txt:"大週期偏空，但短期反彈"};
  return{dir:0,pts:0,txt:"大週期均線糾結，方向不明"}}
/* 費波納契：做多取最近波段的低→高，做空取高→低 */
export function fibAt(P,i,d,look=80){const s=Math.max(0,i-look),c=P.c;let ei=s,oi=s;
  if(d>0){for(let k=s;k<=i;k++)if(c[k].h>c[ei].h)ei=k;oi=s;for(let k=s;k<=ei;k++)if(c[k].l<c[oi].l)oi=k;const hi=c[ei].h,lo=c[oi].l,r=hi-lo||1e-12;
    return{hi,lo,range:hi-lo,ret:(hi-c[i].c)/r,lvl:x=>hi-x*r,ext:x=>lo+x*r,from:oi,to:ei}}
  for(let k=s;k<=i;k++)if(c[k].l<c[ei].l)ei=k;oi=s;for(let k=s;k<=ei;k++)if(c[k].h>c[oi].h)oi=k;const lo=c[ei].l,hi=c[oi].h,r=hi-lo||1e-12;
  return{hi,lo,range:hi-lo,ret:(c[i].c-lo)/r,lvl:x=>lo+x*r,ext:x=>hi-x*r,from:oi,to:ei}}
export function analyze(P,T,i,funding){
  const j=tIdx(T,P.c[i].t+P.dt);const tr=trendAt(T,j);const bar=P.c[i],a=P.atr[i],px=bar.c;
  const A={dir:tr.dir,price:px,atr:a,checks:[],score:0,i};
  const add=(k,p,max,t)=>{A.checks.push({k,p,max,t});A.score+=p};
  add("大週期趨勢",tr.pts,25,tr.txt);
  if(!tr.dir||!(a>0)){A.status="flat";A.levels=a>0?levels(P,i):[];return A}
  const d=tr.dir,L=d>0?"支撐":"壓力",Lr=d>0?"壓力":"支撐";let p,t;
  /* 均線位置 */
  const dist=d*(px-P.e20[i])/a,beyondMid=d*(px-P.e50[i])<0;
  if(beyondMid){p=2;t=d>0?"跌破 EMA50，短線結構轉弱":"站上 EMA50，短線結構轉強"}
  else if(dist<-0.5){p=7;t="回到 EMA50 附近"}
  else if(dist<=1){p=10;t="回到 EMA20 附近，沒有追"+(d>0?"高":"空")}
  else if(dist<=1.5){p=5;t="離 EMA20 稍遠"}
  else{p=0;t="離均線太遠，屬於追"+(d>0?"高":"空")}
  add("均線位置",p,10,t);
  /* 費波納契 */
  const F=fibAt(P,i,d);A.fib=F;let fp=0,ft;const rt=F.ret.toFixed(2);
  if(F.range<2*a)ft="最近波段太小，無法判斷回撤";
  else if(F.ret<0.236)ft=(d>0?"剛創波段新高":"剛創波段新低")+"，還沒回撤";
  else if(F.ret>=0.5&&F.ret<=0.618){fp=15;ft=`在黃金回撤區 0.5–0.618（目前 ${rt}）`}
  else if(F.ret>=0.382&&F.ret<=0.786){fp=8;ft=`在回撤區（目前 ${rt}）`}
  else if(F.ret>0.786){fp=0;ft=`回撤超過 0.786（目前 ${rt}），這段波段可能失效`}
  else{fp=3;ft=`回撤很淺（目前 ${rt}）`}
  add("費波納契",fp,15,ft);
  /* 支撐壓力 SNR */
  const lv=levels(P,i);A.levels=lv;
  const sup=lv.filter(x=>d*(px-x.price)>0).sort((x,y)=>d*(y.price-x.price));
  const res=lv.filter(x=>d*(x.price-px)>0).sort((x,y)=>d*(x.price-y.price));
  A.sup=sup.slice(0,2);A.res=res.slice(0,2);
  const ns=sup[0];let sp=0,st;
  if(ns&&d*(px-ns.price)<=1*a){sp=ns.touches>=2?15:9;st=`貼近${L} ${fmtP(ns.price)}（碰過 ${ns.touches} 次）`}
  else if(ns&&d*(px-ns.price)<=2*a){sp=5;st=`離${L} ${fmtP(ns.price)} 還有一段`}
  else st=`附近沒有明確${L}`;
  add("支撐壓力",sp,15,st);
  /* RSI */
  const r=P.rsi[i],rp=P.rsi[i-1],rr=d>0?r:100-r,turn=d>0?r>rp:r<rp;
  if(rr>=40&&rr<=62){p=turn?10:5;t=`RSI ${r.toFixed(0)}，${turn?"開始轉向":"還在整理"}`}
  else if(rr>62&&rr<=70){p=4;t=`RSI ${r.toFixed(0)}，偏${d>0?"熱":"冷"}`}
  else if(rr>70){p=0;t=`RSI ${r.toFixed(0)}，${d>0?"超買，不追多":"超賣，不追空"}`}
  else{p=3;t=`RSI ${r.toFixed(0)}，動能還弱`}
  add("RSI",p,10,t);
  /* 量能 */
  const good=d>0?bar.c>bar.o:bar.c<bar.o,vr=bar.v/P.vs[i];
  p=good&&vr>=1.2?5:good?3:0;t=good?`K棒${d>0?"收紅":"收黑"}，量是均量 ${isFinite(vr)?vr.toFixed(1):"—"} 倍`:"K棒方向還沒配合";
  add("量能",p,5,t);
  /* 停損 */
  let sw=d>0?Infinity:-Infinity;for(let k=Math.max(0,i-9);k<=i;k++)sw=d>0?Math.min(sw,P.c[k].l):Math.max(sw,P.c[k].h);
  let base=sw;if(ns&&d*(px-ns.price)<=3*a)base=d>0?Math.min(sw,ns.price):Math.max(sw,ns.price);
  let sl=base-d*0.3*a;if(d*(px-sl)<a)sl=px-d*a;
  const risk=d*(px-sl);A.sl=sl;A.risk=risk;
  /* 目標 */
  A.tp1=px+d*risk;A.tp1src="1R";
  const tg=res.find(x=>d*(x.price-px)>=1.5*risk&&d*(x.price-px)<=3*risk);
  A.tp2=tg?tg.price:px+d*2*risk;A.tp2src=tg?`${Lr}位（碰過 ${tg.touches} 次）`:"2R";
  A.tp3=px+d*3*risk;A.tp3src="3R";
  if(F.range>=2*a){const e=F.ext(1.618);if(d*(e-A.tp2)>=0.5*risk&&d*(e-px)<=6*risk){A.tp3=e;A.tp3src="Fib 1.618 延伸"}}
  if(d*(A.tp3-A.tp2)<0.5*risk){A.tp3=A.tp2+d*risk;A.tp3src="TP2＋1R"}
  /* 獲利空間 */
  const room=res.length?d*(res[0].price-px)/risk:Infinity;
  if(room>=2){p=10;t=res.length?`前方第一個${Lr}在 ${fmtP(res[0].price)}，空間 ${room.toFixed(1)}R`:`前方沒有明顯${Lr}`}
  else if(room>=1){p=5;t=`前方${Lr} ${fmtP(res[0].price)} 只有 ${room.toFixed(1)}R`}
  else{p=0;t=`前方${Lr} ${fmtP(res[0].price)} 太近（${room.toFixed(1)}R）`}
  add("獲利空間",p,10,t);
  /* 資金費率 */
  if(funding==null||!isFinite(funding)){p=5;t="沒有資金費率資料（不加不扣）"}
  else{const f=funding*100,fs=f.toFixed(4)+"%";const crowd=d>0?funding:-funding;
    if(crowd<=0.0001){p=10;t=`資金費率 ${fs}，${d>0?"做多":"做空"}不擁擠`}
    else if(crowd<=0.0005){p=5;t=`資金費率 ${fs}，稍微偏${d>0?"多":"空"}`}
    else{p=0;t=`資金費率 ${fs}，${d>0?"做多":"做空"}太擁擠`}}
  add("資金費率",p,10,t);
  A.wide=risk>3*a;if(A.wide){A.score-=10;A.checks.push({k:"停損距離",p:-10,max:0,t:"停損超過 3 倍 ATR，風險偏大，扣 10 分"})}
  A.score=Math.max(0,Math.min(100,A.score));
  A.status=A.score>=70?"go":A.score>=50?"watch":"no";
  A.zone=[px-d*0.3*a,px];
  return A}
/* 回測：照同樣規則，TP1 平 1/3 移停損到進場價，TP2 再平 1/3 移停損到 TP1，剩下放 TP3；同一根K同時碰到停損和目標時算停損（保守） */
export function backtest(P,T,startAt=210,maxHold=100){const n=P.c.length-1;const trades=[];let i=startAt;
  while(i<n-1){const A=analyze(P,T,i,null);if(A.status!=="go"){i++;continue}
    const d=A.dir,e=A.price,R=A.risk;let sl=A.sl,stage=0,real=0,left=1,j=i+1;
    for(;j<n&&j<=i+maxHold;j++){const b=P.c[j],adv=d>0?b.l:b.h,fav=d>0?b.h:b.l;
      if(d*(adv-sl)<=0){real+=left*d*(sl-e)/R;left=0;break}
      if(stage<1&&d*(fav-A.tp1)>=0){real+=d*(A.tp1-e)/R/3;left-=1/3;stage=1;sl=e}
      if(stage<2&&d*(fav-A.tp2)>=0){real+=d*(A.tp2-e)/R/3;left-=1/3;stage=2;sl=A.tp1}
      if(stage<3&&d*(fav-A.tp3)>=0){real+=d*(A.tp3-e)/R*left;left=0;stage=3;break}}
    if(left>1e-9){const b=P.c[Math.min(j,n-1)];real+=left*d*(b.c-e)/R}
    real-=0.001*e/R;trades.push({i,r:real,stage,dir:d});i=Math.min(j,n-1)+1}
  const wins=trades.filter(x=>x.r>0).length,tot=trades.reduce((s,x)=>s+x.r,0);
  return{n:trades.length,winRate:trades.length?wins/trades.length:0,avg:trades.length?tot/trades.length:0,total:tot,trades,bars:n-startAt}}
