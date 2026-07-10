import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Package, QrCode, ClipboardCheck, ShoppingCart, ChevronLeft, LayoutDashboard,
  Plus, Minus, Check, AlertTriangle, History, X, Copy, Key, LogOut, ClipboardList, Trash2
} from "lucide-react";

/* ————————————————————————————————————————————————
   LAGERBUCH · Klickdummy v2
   Zwei Flows, ein Datenstand (alles in-memory):
   1) Helfer:innen  – Zugang per Token/Fahrzeug-Code, mobil, nur Entnahme + Check
   2) Verwaltung    – Desktop, alle Funktionen inkl. Soll-Bestückung & Tokens
   ———————————————————————————————————————————————— */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

:root{
  --rot:#C8000F; --rot-dk:#A2000C; --rot-bg:#FBE9EB;
  --tinte:#1A1D20; --stahl:#5B6570; --linie:#D9DDE1;
  --papier:#EEF0F1; --karte:#FFFFFF;
  --gelb:#B26A00; --gelb-bg:#FBF1DC;
  --ok:#1E7A3C; --ok-bg:#E4F2E9;
  --display:'Barlow Condensed','Arial Narrow',sans-serif;
  --body:'Barlow',system-ui,sans-serif;
  --mono:'IBM Plex Mono',ui-monospace,monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--body)}
button{font:inherit;cursor:pointer;background:none;border:none;color:inherit}
button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--tinte);outline-offset:2px;border-radius:6px}
input,select{font:inherit}

.root{min-height:100vh;background:var(--papier);color:var(--tinte);font-family:var(--body)}

/* ——— Bausteine ——— */
.card{background:var(--karte);border:1px solid var(--linie);border-radius:14px;overflow:hidden}
.card + .card{margin-top:10px}
.cardpad{padding:13px 14px}
.cardtitle{font-family:var(--display);font-weight:600;font-size:13.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--stahl);padding:11px 14px 0}
.row{display:flex;align-items:center;gap:11px;width:100%;text-align:left;padding:12px 14px;border-top:1px solid var(--linie)}
.row:first-child{border-top:none}
.rowmain{flex:1;min-width:0}
.rowname{font-weight:600;font-size:14.5px;line-height:1.25}
.rowmeta{display:flex;align-items:center;gap:7px;margin-top:5px;flex-wrap:wrap}
.rowmeta small{font-size:12px;color:var(--stahl)}
.bignum{font-family:var(--display);font-weight:700;font-size:26px;line-height:1;text-align:right}
.bignum small{display:block;font-family:var(--body);font-weight:500;font-size:10.5px;color:var(--stahl);letter-spacing:.03em;margin-top:2px}
.fach{font-family:var(--mono);font-size:10.5px;font-weight:600;border:1.5px solid var(--tinte);border-radius:5px;padding:1px 6px;background:var(--karte);white-space:nowrap}
.chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;border-radius:99px;padding:2.5px 9px;white-space:nowrap}
.chip-rot{background:var(--rot-bg);color:var(--rot)}
.chip-gelb{background:var(--gelb-bg);color:var(--gelb)}
.chip-ok{background:var(--ok-bg);color:var(--ok)}
.chip-grau{background:#E7EAEC;color:var(--stahl)}
.btn{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;border-radius:11px;padding:12px 14px;font-weight:700;font-size:14.5px}
.btn-rot{background:var(--rot);color:#fff}
.btn-rot:active{background:var(--rot-dk)}
.btn-tinte{background:var(--tinte);color:#fff}
.btn-ghost{border:1.5px solid var(--linie);background:var(--karte);color:var(--tinte)}
.btn.slim{width:auto;padding:9px 13px;font-size:13px;border-radius:9px}
.btn[disabled]{opacity:.45;cursor:default}
.btnrow{display:flex;gap:9px}
.stepper{display:flex;align-items:center;border:1.5px solid var(--linie);border-radius:11px;background:var(--karte)}
.stepbtn{width:42px;height:42px;display:flex;align-items:center;justify-content:center}
.stepval{min-width:44px;text-align:center;font-family:var(--display);font-weight:700;font-size:21px}
.stepper.sm .stepbtn{width:30px;height:30px}
.stepper.sm .stepval{min-width:28px;font-size:15px}
.filter{font-size:12.5px;font-weight:600;border:1.5px solid var(--linie);background:var(--karte);border-radius:99px;padding:5px 12px;color:var(--stahl)}
.filter.on{border-color:var(--tinte);color:var(--tinte)}
.filters{display:flex;gap:7px;margin:0 2px 12px;flex-wrap:wrap}
.input{width:100%;border:1.5px solid var(--linie);border-radius:10px;padding:10px 12px;font:500 14px var(--body);background:#fff;color:var(--tinte)}
.label{font:600 11.5px var(--display);letter-spacing:.09em;text-transform:uppercase;color:var(--stahl);margin:0 0 5px;display:block}
.footnote{font-family:var(--mono);font-size:10.5px;color:var(--stahl);margin:12px 4px 0;line-height:1.6}
.empty{padding:24px 18px;text-align:center;color:var(--stahl);font-size:13.5px;line-height:1.55}
.strike{text-decoration:line-through;color:var(--stahl)}
.demochip{font-family:var(--mono);font-size:10px;font-weight:600;letter-spacing:.12em;border:1.5px solid var(--tinte);border-radius:5px;padding:2px 7px}
.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:26px;z-index:99;background:var(--tinte);color:#fff;border-radius:12px;padding:11px 16px;font-size:13px;font-weight:500;display:flex;gap:9px;align-items:center;box-shadow:0 12px 30px rgba(12,18,24,.35);max-width:min(520px,92vw)}
.checkcircle{width:30px;height:30px;border-radius:99px;border:2px solid var(--linie);flex:none;display:flex;align-items:center;justify-content:center;background:var(--karte)}
.checkcircle.done{background:var(--ok);border-color:var(--ok);color:#fff}
.checkcircle.fehl{background:var(--rot-bg);border-color:var(--rot);color:var(--rot)}

/* ——— Gate ——— */
.gate{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:26px 18px}
.gatebar{width:52px;height:5px;background:var(--rot);border-radius:3px;margin-bottom:12px}
.gatebrand{font-family:var(--display);font-weight:700;font-size:36px;letter-spacing:.07em}
.gatebrand span{color:var(--rot)}
.gatesub{color:var(--stahl);font-size:13.5px;margin-top:3px}
.gatecards{display:grid;grid-template-columns:repeat(auto-fit,minmax(272px,1fr));gap:14px;width:100%;max-width:680px;margin-top:26px}
.gatecard{background:var(--karte);border:1px solid var(--linie);border-radius:16px;padding:18px 16px;display:flex;flex-direction:column;gap:12px}
.gatecard h2{font-family:var(--display);font-weight:700;font-size:19px;letter-spacing:.05em}
.gatecard p{font-size:13px;color:var(--stahl);line-height:1.5}
.tokeninput{font:600 21px var(--mono);letter-spacing:.16em;text-align:center;text-transform:uppercase}
.gateerr{color:var(--rot);font-size:12.5px;font-weight:600}

/* ——— Helfer (Phone-Frame) ——— */
.stage{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px;background:#DDE1E3}
.app{width:100%;max-width:410px;height:calc(100vh - 62px);max-height:820px;min-height:580px;background:var(--papier);border-radius:22px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 26px 70px rgba(12,18,24,.30);position:relative}
.stripe{height:5px;background:var(--rot);flex:none}
.topbar{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 14px 9px;background:var(--karte);border-bottom:1px solid var(--linie)}
.brand{font-family:var(--display);font-weight:700;font-size:20px;letter-spacing:.07em}
.brand span{color:var(--rot)}
.brandsub{font-size:11px;color:var(--stahl);margin-top:1px}
.content{flex:1;overflow-y:auto;padding:14px 14px 18px;-webkit-overflow-scrolling:touch}
.screenhead{font-family:var(--display);font-weight:700;font-size:17px;letter-spacing:.08em;text-transform:uppercase;color:var(--stahl);margin:2px 2px 10px}
.tabbar{flex:none;display:flex;background:var(--karte);border-top:1px solid var(--linie)}
.tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 2px 8px;color:var(--stahl);border-top:2.5px solid transparent}
.tab.on{color:var(--rot);border-top-color:var(--rot)}
.tab span{font-family:var(--display);font-weight:600;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase}
.framecap{font-family:var(--mono);font-size:10.5px;color:var(--stahl);margin-top:11px;text-align:center}
.scanwrap{position:relative;background:#14181B;border-radius:16px;height:280px;width:100%;overflow:hidden;display:flex;align-items:center;justify-content:center}
.scanframe{position:absolute;inset:14%}
.scancorner{position:absolute;width:26px;height:26px;border:3px solid #fff;opacity:.9}
.sc-tl{top:0;left:0;border-right:none;border-bottom:none;border-radius:8px 0 0 0}
.sc-tr{top:0;right:0;border-left:none;border-bottom:none;border-radius:0 8px 0 0}
.sc-bl{bottom:0;left:0;border-right:none;border-top:none;border-radius:0 0 0 8px}
.sc-br{bottom:0;right:0;border-left:none;border-top:none;border-radius:0 0 8px 0}
.scanline{position:absolute;left:8%;right:8%;height:2px;background:var(--rot);box-shadow:0 0 14px 2px rgba(200,0,15,.75);top:16%;animation:scan 2.6s ease-in-out infinite}
@keyframes scan{0%{top:16%}50%{top:82%}100%{top:16%}}
@media (prefers-reduced-motion: reduce){.scanline{animation:none;top:49%}}
.scanhint{position:relative;color:#B9C2C8;font-size:12.5px;text-align:center;padding:0 40px;line-height:1.5}
.summary{position:sticky;bottom:6px;margin-top:14px;background:var(--tinte);color:#fff;border-radius:14px;padding:12px 13px;display:flex;align-items:center;gap:11px;box-shadow:0 10px 26px rgba(12,18,24,.32)}
.summary .info{flex:1;min-width:0}
.summary .info b{font-family:var(--display);font-size:16px;letter-spacing:.03em}
.summary .info div{font-size:11.5px;opacity:.75;margin-top:1px}
.summary .go{background:var(--rot);color:#fff;border-radius:9px;padding:10px 13px;font-weight:700;font-size:13.5px;white-space:nowrap;display:flex;gap:6px;align-items:center}
.fachhead{font-family:var(--display);font-weight:600;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--stahl);margin:15px 2px 7px}
.sheetdim{position:absolute;inset:0;background:rgba(16,20,24,.5);z-index:30;display:flex;align-items:flex-end}
.sheet{background:var(--papier);border-radius:20px 20px 0 0;width:100%;max-height:82%;overflow-y:auto;padding:16px 14px 18px}
.sheettitle{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px}
.sheettitle h2{font-family:var(--display);font-weight:700;font-size:19px;letter-spacing:.05em}
.journal{font-family:var(--mono);font-size:11.5px}
.journal .row{padding:9px 14px;gap:9px;align-items:baseline}
.jts{color:var(--stahl);white-space:nowrap}
.jdelta{font-weight:600;white-space:nowrap}
.jdelta.minus{color:var(--rot)} .jdelta.plus{color:var(--ok)}

/* ——— Verwaltung (Desktop) ——— */
.adm{display:flex;min-height:100vh}
.side{width:218px;flex:none;background:var(--tinte);color:#fff;display:flex;flex-direction:column;padding:16px 10px 12px;position:sticky;top:0;height:100vh}
.side .brand{color:#fff;padding:0 8px}
.side .brandsub{color:#8A949C;padding:0 8px}
.snav{margin-top:20px;display:flex;flex-direction:column;gap:2px;flex:1}
.sitem{display:flex;align-items:center;gap:10px;padding:10px 11px;border-radius:9px;color:#AEB8BF;font-weight:600;font-size:13.5px;border-left:3px solid transparent;text-align:left;width:100%}
.sitem.on{background:rgba(255,255,255,.08);color:#fff;border-left-color:var(--rot)}
.sitem .cnt{margin-left:auto;background:var(--rot);color:#fff;font-size:10.5px;font-weight:700;border-radius:99px;min-width:18px;height:18px;display:flex;align-items:center;justify-content:center;padding:0 5px}
.main{flex:1;min-width:0;padding:24px 26px 60px;overflow-y:auto;height:100vh}
.mainhead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.mainhead h1{font-family:var(--display);font-weight:700;font-size:26px;letter-spacing:.04em}
.mainhead p{width:100%;font-size:13px;color:var(--stahl);margin-top:-6px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:14px}
.kpi{background:var(--karte);border:1px solid var(--linie);border-left:4px solid var(--stahl);border-radius:12px;padding:12px 14px}
.kpi.rot{border-left-color:var(--rot)} .kpi.gelb{border-left-color:var(--gelb)} .kpi.ok{border-left-color:var(--ok)}
.kpi b{font-family:var(--display);font-weight:700;font-size:30px;line-height:1}
.kpi div{font-size:12px;color:var(--stahl);font-weight:600;margin-top:3px}
.tbl{width:100%;border-collapse:collapse;font-size:13.5px}
.tbl th{font:600 11px var(--display);letter-spacing:.1em;text-transform:uppercase;color:var(--stahl);text-align:left;padding:9px 12px;border-bottom:1.5px solid var(--linie);white-space:nowrap}
.tbl td{padding:10px 12px;border-bottom:1px solid var(--linie);vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}
.tbl tr.click:hover{background:#F6F8F9;cursor:pointer}
.tbl .num{font-family:var(--display);font-weight:700;font-size:17px}
.mono{font-family:var(--mono);font-size:12px}
.drawerdim{position:fixed;inset:0;background:rgba(16,20,24,.45);z-index:60;display:flex;justify-content:flex-end}
.drawer{width:min(430px,100%);background:var(--papier);height:100%;overflow-y:auto;padding:18px 16px 30px;box-shadow:-18px 0 50px rgba(0,0,0,.25)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.vehchips{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}

@media (max-width:760px){
  .adm{flex-direction:column}
  .side{width:100%;height:auto;position:static;flex-direction:row;align-items:center;padding:10px;overflow-x:auto}
  .snav{flex-direction:row;margin:0 0 0 10px;flex:none}
  .sitem{white-space:nowrap;border-left:none;border-bottom:3px solid transparent;padding:8px 10px}
  .sitem.on{border-bottom-color:var(--rot)}
  .side .brandsub,.side .logout-label{display:none}
  .main{height:auto;padding:16px 14px 60px}
}
`;

/* ————— Demo-Stammdaten ————— */
const SEED_ARTIKEL = [
  { id:"mull6",  name:"Mullbinde 4 m × 6 cm",          einheit:"Stk.", fach:"A2", mindest:20, chargen:[{nr:"2403-118", verfall:"2027-03", menge:24}] },
  { id:"mull8",  name:"Mullbinde 4 m × 8 cm",          einheit:"Stk.", fach:"A2", mindest:15, chargen:[{nr:"2311-072", verfall:"2027-11", menge:6}] },
  { id:"vpg",    name:"Verbandpäckchen G",             einheit:"Stk.", fach:"A1", mindest:10, chargen:[{nr:"2108-441", verfall:"2026-08", menge:7},{nr:"2402-090", verfall:"2028-02", menge:11}] },
  { id:"komp",   name:"Kompressen 10 × 10 cm, steril", einheit:"Pkg.", fach:"A3", mindest:30, chargen:[{nr:"2405-233", verfall:"2028-05", menge:40}] },
  { id:"wsv",    name:"Wundschnellverband 6 cm × 1 m", einheit:"Stk.", fach:"A3", mindest:10, chargen:[{nr:"2312-019", verfall:"2027-12", menge:2}] },
  { id:"dreieck",name:"Dreiecktuch DIN 13168",         einheit:"Stk.", fach:"A4", mindest:15, chargen:[{nr:"2301-555", verfall:"2030-01", menge:25}] },
  { id:"decke",  name:"Rettungsdecke gold/silber",     einheit:"Stk.", fach:"B1", mindest:10, chargen:[{nr:"2404-777", verfall:"2029-04", menge:12}] },
  { id:"nacl",   name:"NaCl 0,9 % Spüllösung 500 ml",  einheit:"Fl.",  fach:"B2", mindest:8,  chargen:[{nr:"2307-102", verfall:"2026-07", menge:4},{nr:"2501-260", verfall:"2027-01", menge:5}] },
  { id:"kalt",   name:"Kältesofortkompresse",          einheit:"Stk.", fach:"B3", mindest:12, chargen:[{nr:"2406-310", verfall:"2028-06", menge:14}] },
  { id:"handm",  name:"Handschuhe Nitril Gr. M",       einheit:"Box",  fach:"C1", mindest:6,  chargen:[{nr:"2410-664", verfall:"2029-10", menge:3}] },
  { id:"handl",  name:"Handschuhe Nitril Gr. L",       einheit:"Box",  fach:"C1", mindest:6,  chargen:[{nr:"2410-665", verfall:"2029-10", menge:8}] },
  { id:"desi",   name:"Händedesinfektion 500 ml",      einheit:"Fl.",  fach:"C2", mindest:4,  chargen:[{nr:"2409-021", verfall:"2026-09", menge:5}] },
];

const SEED_FAHRZEUGE = [
  { id:"rtw1", name:"RTW 1", kennung:"XX-RK 100", faecher:[
    { id:"f1", fach:"Schrank 1 · Verbandmaterial",  items:[{art:"vpg",soll:4},{art:"mull6",soll:6},{art:"komp",soll:10},{art:"wsv",soll:2}] },
    { id:"f2", fach:"Schrank 3 · Kreislauf & Wärme", items:[{art:"nacl",soll:4},{art:"decke",soll:2},{art:"kalt",soll:2}] },
    { id:"f3", fach:"Fach 5 · Hygiene",             items:[{art:"handm",soll:1},{art:"handl",soll:1},{art:"desi",soll:1}] },
  ]},
  { id:"ktw1", name:"KTW 1", kennung:"XX-RK 200", faecher:[
    { id:"f1", fach:"Schrank 1 · Verband",  items:[{art:"vpg",soll:2},{art:"mull6",soll:4},{art:"komp",soll:6}] },
    { id:"f2", fach:"Fach 2 · Hygiene",     items:[{art:"handm",soll:1},{art:"desi",soll:1},{art:"decke",soll:2}] },
  ]},
];

const SEED_TOKENS = [
  { code:"831-042", scope:"rtw1",  label:"RTW 1",     erstellt:"01.07.2026", aktiv:true },
  { code:"852-017", scope:"ktw1",  label:"KTW 1",     erstellt:"01.07.2026", aktiv:true },
  { code:"555-010", scope:"lager", label:"Handlager", erstellt:"14.05.2026", aktiv:true },
  { code:"555-003", scope:"lager", label:"Handlager", erstellt:"02.01.2026", aktiv:false },
];

const SEED_JOURNAL = [
  { id:1, ts:"09.07. 19:41", artId:"nacl",  delta:-2,  label:"Entnahme · Sanitätsdienst Stadtfest", quelle:"Token 555-010" },
  { id:2, ts:"08.07. 18:05", artId:"komp",  delta:+20, label:"Wareneingang · Lieferung Sanmed",     quelle:"Verwaltung" },
  { id:3, ts:"05.07. 10:12", artId:"handm", delta:-1,  label:"Entnahme · Handlager",                quelle:"Token 555-010" },
];

/* ————— Pure Helfer ————— */
const bestandOf = (a) => a.chargen.reduce((s, c) => s + c.menge, 0);
const pad2 = (n) => String(n).padStart(2, "0");
const fmtVerfall = (v) => { const [y, m] = v.split("-"); return `${m}/${y.slice(2)}`; };

function verfallStatus(v) {
  const [y, m] = v.split("-").map(Number);
  const ende = new Date(y, m, 0);
  const tage = Math.ceil((ende - new Date()) / 86400000);
  if (tage < 0)   return { tone:"rot",  text:"abgelaufen", tage };
  if (tage <= 31) return { tone:"rot",  text:`läuft ${fmtVerfall(v)} ab`, tage };
  if (tage <= 56) return { tone:"gelb", text:`fällig ${fmtVerfall(v)}`, tage };
  return { tone:"ok", text:`bis ${fmtVerfall(v)}`, tage };
}
function artikelStatus(a) {
  const unter = bestandOf(a) < a.mindest;
  let ablauf = null;
  for (const c of a.chargen) {
    if (c.menge <= 0) continue;
    const s = verfallStatus(c.verfall);
    if (s.tone !== "ok" && (!ablauf || s.tage < ablauf.tage)) ablauf = s;
  }
  return { unter, ablauf };
}
function fefoEntnahme(chargen, menge) {
  const sortiert = [...chargen].sort((x, y) => x.verfall.localeCompare(y.verfall));
  let rest = menge;
  return sortiert.map((c) => {
    if (rest <= 0) return c;
    const nimm = Math.min(c.menge, rest); rest -= nimm;
    return { ...c, menge: c.menge - nimm };
  }).filter((c) => c.menge > 0);
}
const jetztTs = () => { const d = new Date();
  return `${pad2(d.getDate())}.${pad2(d.getMonth()+1)}. ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const vorschlagFuer = (a) => a.mindest * 2 - bestandOf(a);
const zufallsCode = () => `${100+Math.floor(Math.random()*900)}-${String(Math.floor(Math.random()*1000)).padStart(3,"0")}`;

/* ————— Kleinteile ————— */
function Plakette({ verfall }) {
  const s = verfallStatus(verfall);
  const farbe = s.tone === "rot" ? "var(--rot)" : s.tone === "gelb" ? "var(--gelb)" : "var(--ok)";
  const monat = Number(verfall.split("-")[1]);
  const ticks = [];
  for (let i = 0; i < 12; i++) {
    const w = ((i * 30 - 90) * Math.PI) / 180;
    const aktiv = i === monat - 1;
    const r1 = aktiv ? 13.5 : 15.2, r2 = 18.6;
    ticks.push(<line key={i}
      x1={20 + r1*Math.cos(w)} y1={20 + r1*Math.sin(w)}
      x2={20 + r2*Math.cos(w)} y2={20 + r2*Math.sin(w)}
      stroke={aktiv ? farbe : "#C7CDD1"} strokeWidth={aktiv ? 3.4 : 1.7} strokeLinecap="round" />);
  }
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" role="img" aria-label={`Verfall ${fmtVerfall(verfall)}`} style={{flex:"none"}}>
      <circle cx="20" cy="20" r="19" fill="#fff" stroke={farbe} strokeWidth="1.6" />
      {ticks}
      <text x="20" y="23.4" textAnchor="middle" style={{font:"600 8.6px var(--mono)", fill:"var(--tinte)"}}>{fmtVerfall(verfall)}</text>
    </svg>
  );
}

function Stepper({ wert, setWert, min = 1, max = 999, sm = false }) {
  return (
    <div className={`stepper${sm ? " sm" : ""}`}>
      <button className="stepbtn" aria-label="Menge verringern" onClick={() => setWert(Math.max(min, wert - 1))}><Minus size={sm?14:18}/></button>
      <div className="stepval" aria-live="polite">{wert}</div>
      <button className="stepbtn" aria-label="Menge erhöhen" onClick={() => setWert(Math.min(max, wert + 1))}><Plus size={sm?14:18}/></button>
    </div>
  );
}

const StatusChips = ({ a }) => {
  const st = artikelStatus(a);
  if (!st.unter && !st.ablauf) return <span className="chip chip-ok">ok</span>;
  return (<>
    {st.unter && <span className="chip chip-rot"><AlertTriangle size={11}/> unter Mindestbestand</span>}
    {st.ablauf && <span className={`chip chip-${st.ablauf.tone}`}>Charge {st.ablauf.text}</span>}
  </>);
};

/* ═════════════ GATE ═════════════ */
function Gate({ tokens, onHelfer, onAdmin }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState(null);
  const aktive = tokens.filter((t) => t.aktiv);

  function pruefen(c) {
    const norm = (c ?? code).trim().toUpperCase();
    const t = aktive.find((x) => x.code.toUpperCase() === norm);
    if (t) onHelfer(t); else setErr("Code nicht gefunden oder gesperrt.");
  }
  return (
    <div className="gate">
      <div className="gatebar" />
      <div className="gatebrand">LAGER<span>BUCH</span></div>
      <div className="gatesub">DRK Bereitschaft Musterstadt · Materialverwaltung</div>
      <div className="gatecards">
        <div className="gatecard">
          <h2>Im Dienst</h2>
          <p>Für Helfer:innen: Code vom Regal- oder Fahrzeugetikett eingeben – ohne Konto, ohne Passwort. Nur Entnahme &amp; Fahrzeug-Check.</p>
          <input className="input tokeninput" placeholder="000-000" value={code}
            aria-label="Zugangs-Code"
            onChange={(e) => { setCode(e.target.value); setErr(null); }}
            onKeyDown={(e) => e.key === "Enter" && pruefen()} />
          {err && <div className="gateerr">{err}</div>}
          <button className="btn btn-rot" onClick={() => pruefen()}>Weiter</button>
          <button className="btn btn-ghost" onClick={() => pruefen(aktive.find((t) => t.scope === "rtw1")?.code)}>
            <QrCode size={16}/> Fahrzeug-Code scannen (Demo)
          </button>
          <div className="footnote" style={{margin:0}}>Demo-Codes: {aktive.map((t) => t.code).join(" · ")}</div>
        </div>
        <div className="gatecard">
          <h2>Verwaltung</h2>
          <p>Volles Lagerbuch: Artikel &amp; Chargen, Soll-Bestückung der Fahrzeuge, Bestellvorschläge, Journal und Zugangs-Codes.</p>
          <div style={{flex:1}} />
          <button className="btn btn-tinte" onClick={onAdmin}><Key size={16}/> Mit Pocket ID anmelden (Demo)</button>
          <div className="footnote" style={{margin:0}}>Im echten Tool: OIDC-Login, Rolle „Lagerwart“.</div>
        </div>
      </div>
      <div style={{marginTop:22}}><span className="demochip">KLICKDUMMY · DATEN NUR IM SPEICHER</span></div>
    </div>
  );
}

/* ═════════════ HELFER-FLOW (mobil) ═════════════ */
function HelferView({ artikel, byId, fahrzeuge, token, buchen, onExit, setToast }) {
  const [tab, setTab] = useState(token.scope === "lager" ? "scan" : "check");
  const [detailId, setDetailId] = useState(null);
  const [vehId, setVehId] = useState(token.scope !== "lager" ? token.scope : fahrzeuge[0].id);
  const [checks, setChecks] = useState({});
  const [sheet, setSheet] = useState(false);
  const scanIx = useRef(0);

  const veh = fahrzeuge.find((f) => f.id === vehId);
  const sollItems = veh.faecher.flatMap((f) => f.items);
  const check = checks[vehId] ?? {};
  const setCheck = (fn) => setChecks((c) => ({ ...c, [vehId]: fn(c[vehId] ?? {}) }));
  const geprueft = sollItems.filter((it) => check[it.art] != null).length;
  const fehlListe = sollItems
    .map((it) => ({ ...it, fehlt: it.soll - (check[it.art] ?? it.soll) }))
    .filter((it) => check[it.art] != null && it.fehlt > 0);
  const fehlSumme = fehlListe.reduce((s, f) => s + f.fehlt, 0);

  function simulateScan(id) {
    const seq = ["mull6", "nacl", "handm", "vpg"];
    const artId = id ?? seq[scanIx.current++ % seq.length];
    setToast({ icon:<QrCode size={16}/>, msg:`Code erkannt: ${byId[artId].name}` });
    setDetailId(artId);
  }

  function checkAbbuchen() {
    fehlListe.forEach((f) => {
      const menge = Math.min(f.fehlt, bestandOf(byId[f.art]));
      if (menge > 0) buchen(f.art, -menge, `Entnahme · ${veh.name}-Check`, `Token ${token.code}`);
    });
    setChecks((c) => ({ ...c, [vehId]: {} })); setSheet(false); setTab("scan");
    setToast({ icon:<Check size={16}/>, msg:`Check abgeschlossen – ${fehlListe.length} Entnahmen gebucht` });
  }

  /* — Screens — */
  const Scan = () => (<>
    <div className="screenhead">Entnahme per Scan</div>
    <button className="scanwrap" onClick={() => simulateScan()} aria-label="Scan simulieren">
      <div className="scanframe">
        <div className="scancorner sc-tl"/><div className="scancorner sc-tr"/>
        <div className="scancorner sc-bl"/><div className="scancorner sc-br"/>
      </div>
      <div className="scanline"/>
      <div className="scanhint">QR-Code auf dem Regaletikett<br/>im Rahmen platzieren</div>
    </button>
    <p className="footnote">DEMO · Antippen simuliert einen Scan.</p>
    <div className="filters" style={{marginTop:8}}>
      {["mull6","nacl","handm"].map((id) => (
        <button key={id} className="filter" onClick={() => simulateScan(id)}>{byId[id].name}</button>
      ))}
    </div>
  </>);

  const Detail = ({ id }) => {
    const a = byId[id];
    const [menge, setMenge] = useState(1);
    const bestand = bestandOf(a);
    const chargenSortiert = [...a.chargen].sort((x, y) => x.verfall.localeCompare(y.verfall));
    return (<>
      <button className="filter" style={{display:"inline-flex",alignItems:"center",gap:5,marginBottom:12}}
        onClick={() => setDetailId(null)}><ChevronLeft size={15}/> Zurück</button>
      <div style={{display:"flex",alignItems:"flex-start",gap:10,margin:"0 2px 6px"}}>
        <h1 style={{font:"700 24px var(--display)",lineHeight:1.12,flex:1}}>{a.name}</h1>
        <span className="fach" style={{marginTop:6}}>{a.fach}</span>
      </div>
      <div className="card cardpad">
        <div style={{fontSize:12,color:"var(--stahl)",fontWeight:600,letterSpacing:".04em"}}>BESTAND HANDLAGER</div>
        <div style={{font:"700 36px var(--display)",lineHeight:1.05}}>{bestand} <span style={{fontSize:16}}>{a.einheit}</span></div>
      </div>
      <div className="card">
        <div className="cardtitle">Entnahme</div>
        <div className="cardpad" style={{display:"grid",gap:10}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:13.5,color:"var(--stahl)",fontWeight:500}}>Menge</span>
            <Stepper wert={menge} setWert={setMenge} max={Math.max(bestand,1)} />
          </div>
          <button className="btn btn-rot" disabled={bestand===0}
            onClick={() => { const m = Math.min(menge,bestand);
              buchen(a.id, -m, "Entnahme · Handlager", `Token ${token.code}`);
              setToast({icon:<Check size={16}/>, msg:`Entnahme gebucht: ${m} × ${a.name}`}); setMenge(1); }}>
            <Minus size={16}/> Entnahme buchen
          </button>
        </div>
      </div>
      <div className="card">
        <div className="cardtitle">Nächste Charge zuerst (FEFO)</div>
        {chargenSortiert.map((c) => {
          const s = verfallStatus(c.verfall);
          return (
            <div className="row" key={c.nr}>
              <Plakette verfall={c.verfall}/>
              <div className="rowmain">
                <div style={{font:"600 12.5px var(--mono)"}}>Charge {c.nr}</div>
                <div className="rowmeta"><span className={`chip chip-${s.tone}`}>{s.text}</span></div>
              </div>
              <div className="bignum" style={{fontSize:20}}>{c.menge}<small>{a.einheit}</small></div>
            </div>
          );
        })}
      </div>
    </>);
  };

  const CheckScreen = () => (<>
    <div className="screenhead">Fahrzeug-Check</div>
    {token.scope === "lager" && (
      <div className="filters">
        {fahrzeuge.map((f) => (
          <button key={f.id} className={`filter${f.id===vehId?" on":""}`} onClick={() => setVehId(f.id)}>{f.name}</button>
        ))}
      </div>
    )}
    <div className="card cardpad" style={{display:"flex",alignItems:"center",gap:12}}>
      <div style={{flex:1}}>
        <div style={{font:"700 20px var(--display)"}}>{veh.name} <span style={{color:"var(--stahl)",fontSize:14}}>· {veh.kennung}</span></div>
        <div style={{fontSize:12.5,color:"var(--stahl)",marginTop:2}}>Fehlmengen werden automatisch zur Packliste.</div>
      </div>
      <div className="bignum">{geprueft}/{sollItems.length}<small>geprüft</small></div>
    </div>
    {veh.faecher.map((f) => (
      <div key={f.id}>
        <div className="fachhead">{f.fach}</div>
        <div className="card">
          {f.items.map((it) => {
            const a = byId[it.art];
            const ist = check[it.art];
            const zustand = ist == null ? "offen" : ist >= it.soll ? "done" : "fehl";
            return (
              <div className="row" key={it.art}>
                <button className={`checkcircle ${zustand==="done"?"done":zustand==="fehl"?"fehl":""}`}
                  aria-label={ist==null?`${a.name} als vollständig markieren`:`${a.name} zurücksetzen`}
                  onClick={() => setCheck((c) => {
                    const n = {...c};
                    if (ist == null) n[it.art] = it.soll; else delete n[it.art];
                    return n;
                  })}>
                  {zustand==="done" && <Check size={16}/>}
                  {zustand==="fehl" && <AlertTriangle size={14}/>}
                </button>
                <div className="rowmain">
                  <div className="rowname">{a.name}</div>
                  <div className="rowmeta">
                    <small>Soll {it.soll} {a.einheit}</small>
                    {zustand==="fehl" && <span className="chip chip-rot">fehlt {it.soll - ist}</span>}
                  </div>
                </div>
                <Stepper sm min={0} max={it.soll} wert={ist ?? it.soll}
                  setWert={(v) => setCheck((c) => ({...c, [it.art]: v}))} />
              </div>
            );
          })}
        </div>
      </div>
    ))}
    {geprueft > 0 && (
      <div className="summary">
        <div className="info">
          {fehlSumme > 0
            ? (<><b>{fehlSumme} Teile fehlen</b><div>{fehlListe.length} Positionen aus dem Handlager holen</div></>)
            : (<><b>Alles vollständig</b><div>{geprueft} von {sollItems.length} geprüft</div></>)}
        </div>
        {fehlSumme > 0
          ? <button className="go" onClick={() => setSheet(true)}>Fehlliste</button>
          : <button className="go" style={{background:"var(--ok)"}}
              onClick={() => { setChecks((c)=>({...c,[vehId]:{}}));
                setToast({icon:<Check size={16}/>, msg:`${veh.name} vollständig – Check abgeschlossen`}); }}>Abschließen</button>}
      </div>
    )}
  </>);

  return (
    <div className="stage">
      <div className="app">
        <div className="stripe"/>
        <header className="topbar">
          <div>
            <div className="brand">LAGER<span>BUCH</span></div>
            <div className="brandsub">Zugang: Token {token.code} · {token.label}</div>
          </div>
          <button className="filter" style={{display:"flex",alignItems:"center",gap:5}} onClick={onExit}>
            <X size={13}/> Beenden
          </button>
        </header>
        <main className="content" key={detailId ? "d"+detailId : tab+vehId}>
          {detailId ? <Detail id={detailId}/> : tab === "scan" ? <Scan/> : <CheckScreen/>}
        </main>
        {sheet && (
          <div className="sheetdim" onClick={() => setSheet(false)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheettitle">
                <h2>Aus dem Handlager holen</h2>
                <button aria-label="Schließen" onClick={() => setSheet(false)}><X size={20}/></button>
              </div>
              <div className="card">
                {fehlListe.map((f) => {
                  const a = byId[f.art];
                  const knapp = bestandOf(a) < f.fehlt;
                  return (
                    <div className="row" key={f.art}>
                      <div className="bignum" style={{fontSize:21,minWidth:34,textAlign:"left"}}>{f.fehlt}×</div>
                      <div className="rowmain">
                        <div className="rowname">{a.name}</div>
                        <div className="rowmeta">
                          <span className="fach">{a.fach}</span>
                          {knapp && <span className="chip chip-gelb"><AlertTriangle size={11}/> nur {bestandOf(a)} im Lager</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{display:"grid",gap:9,marginTop:12}}>
                <button className="btn btn-rot" onClick={checkAbbuchen}><Check size={16}/> Vom Handlager abbuchen ({fehlSumme})</button>
                <button className="btn btn-ghost" onClick={() => setSheet(false)}>Zurück zum Check</button>
              </div>
            </div>
          </div>
        )}
        <nav className="tabbar">
          <button className={`tab${tab==="scan" && !detailId ?" on":""}`} onClick={() => {setDetailId(null);setTab("scan");}}>
            <QrCode size={20}/><span>Entnahme</span>
          </button>
          <button className={`tab${tab==="check" && !detailId ?" on":""}`} onClick={() => {setDetailId(null);setTab("check");}}>
            <ClipboardCheck size={20}/><span>Fahrzeug-Check</span>
          </button>
        </nav>
      </div>
      <div className="framecap">HELFER-ANSICHT · mobile-first, läuft auf jedem Diensthandy</div>
    </div>
  );
}

/* ═════════════ VERWALTUNG (Desktop) ═════════════ */
function AdminView({ artikel, setArtikel, byId, journal, fahrzeuge, setFahrzeuge, tokens, setTokens, buchen, onExit, setToast }) {
  const [sec, setSec] = useState("uebersicht");
  const [drawerArt, setDrawerArt] = useState(null);   // Artikel-ID
  const [neuOffen, setNeuOffen] = useState(false);
  const [bestellt, setBestellt] = useState({});
  const [vehId, setVehId] = useState(fahrzeuge[0].id);

  const unterListe = artikel.filter((a) => bestandOf(a) < a.mindest);
  const ablaufListe = artikel.filter((a) => artikelStatus(a).ablauf);
  const offene = unterListe.filter((a) => !bestellt[a.id]);
  const veh = fahrzeuge.find((f) => f.id === vehId);

  const nav = [
    { k:"uebersicht", label:"Übersicht",       icon:LayoutDashboard },
    { k:"artikel",    label:"Artikel",          icon:Package },
    { k:"soll",       label:"Soll-Bestückung",  icon:ClipboardList },
    { k:"bestellung", label:"Bestellung",       icon:ShoppingCart, cnt:offene.length },
    { k:"journal",    label:"Journal",          icon:History },
    { k:"tokens",     label:"Zugänge",          icon:Key },
  ];

  /* — Soll-Editor-Aktionen — */
  const patchVeh = (fn) => setFahrzeuge((fs) => fs.map((f) => f.id === vehId ? fn(f) : f));
  const setSoll = (fachId, art, soll) => patchVeh((f) => ({...f, faecher: f.faecher.map((x) =>
    x.id !== fachId ? x : {...x, items: x.items.map((i) => i.art === art ? {...i, soll} : i)})}));
  const removeItem = (fachId, art) => patchVeh((f) => ({...f, faecher: f.faecher.map((x) =>
    x.id !== fachId ? x : {...x, items: x.items.filter((i) => i.art !== art)})}));
  const addItem = (fachId, art) => { if (!art) return;
    patchVeh((f) => ({...f, faecher: f.faecher.map((x) =>
      x.id !== fachId ? x : x.items.some((i) => i.art === art) ? x : {...x, items:[...x.items, {art, soll:1}]})}));
  };
  const addFach = (name) => { if (!name.trim()) return;
    patchVeh((f) => ({...f, faecher:[...f.faecher, {id:"f"+Date.now(), fach:name.trim(), items:[]}]}));
  };

  /* ——— Screens ——— */
  const Uebersicht = () => (<>
    <div className="mainhead"><h1>Übersicht</h1><span className="mono" style={{color:"var(--stahl)"}}>{jetztTs()} Uhr</span></div>
    <div className="kpis">
      <div className={`kpi ${unterListe.length? "rot":"ok"}`}><b>{unterListe.length}</b><div>Artikel unter Mindestbestand</div></div>
      <div className={`kpi ${ablaufListe.length? "gelb":"ok"}`}><b>{ablaufListe.length}</b><div>Chargen bald fällig / abgelaufen</div></div>
      <div className="kpi"><b>{offene.length}</b><div>offene Bestellpositionen</div></div>
      <div className="kpi"><b>{journal.length}</b><div>Buchungen im Journal</div></div>
    </div>
    <div className="card">
      <div className="cardtitle">Kritische Artikel</div>
      {unterListe.length === 0 && ablaufListe.length === 0 && <div className="empty">Alles im grünen Bereich.</div>}
      {[...new Set([...unterListe, ...ablaufListe])].map((a) => (
        <button className="row" key={a.id} onClick={() => setDrawerArt(a.id)}>
          <div className="rowmain">
            <div className="rowname">{a.name}</div>
            <div className="rowmeta"><span className="fach">{a.fach}</span><StatusChips a={a}/></div>
          </div>
          <div className="bignum" style={{fontSize:20}}>{bestandOf(a)}<small>/ min. {a.mindest}</small></div>
        </button>
      ))}
    </div>
    <div className="card journal">
      <div className="cardtitle">Letzte Buchungen</div>
      {journal.slice(0,5).map((j) => (
        <div className="row" key={j.id}>
          <span className="jts">{j.ts}</span>
          <span style={{flex:1}}>{byId[j.artId]?.name} · {j.label}</span>
          <span className={`jdelta ${j.delta<0?"minus":"plus"}`}>{j.delta>0?"+":""}{j.delta}</span>
        </div>
      ))}
    </div>
  </>);

  const ArtikelTbl = () => (<>
    <div className="mainhead">
      <h1>Artikel &amp; Bestand</h1>
      <button className="btn btn-rot slim" onClick={() => setNeuOffen(true)}><Plus size={15}/> Neuer Artikel</button>
      <p>Handlager · Klick auf eine Zeile öffnet Chargen, Buchung und Stammdaten.</p>
    </div>
    <div className="card" style={{overflowX:"auto"}}>
      <table className="tbl">
        <thead><tr><th>Artikel</th><th>Fach</th><th>Bestand</th><th>Min.</th><th>Nächster Verfall</th><th>Status</th></tr></thead>
        <tbody>
          {artikel.map((a) => {
            const naechste = [...a.chargen].sort((x,y) => x.verfall.localeCompare(y.verfall))[0];
            return (
              <tr key={a.id} className="click" onClick={() => setDrawerArt(a.id)}>
                <td style={{fontWeight:600}}>{a.name}</td>
                <td><span className="fach">{a.fach}</span></td>
                <td className="num">{bestandOf(a)} <span style={{font:"500 11px var(--body)",color:"var(--stahl)"}}>{a.einheit}</span></td>
                <td className="mono">{a.mindest}</td>
                <td>{naechste ? <span style={{display:"inline-flex",alignItems:"center",gap:7}}><Plakette verfall={naechste.verfall}/><span className="mono">{naechste.nr}</span></span> : <span className="chip chip-grau">leer</span>}</td>
                <td><div style={{display:"flex",gap:6,flexWrap:"wrap"}}><StatusChips a={a}/></div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </>);

  const SollEditor = () => {
    const [neuFach, setNeuFach] = useState("");
    return (<>
      <div className="mainhead"><h1>Soll-Bestückung</h1>
        <p>Ziel-Zustand je Fahrzeug und Fach – Grundlage für den Helfer-Check und die Fehllisten.</p>
      </div>
      <div className="vehchips">
        {fahrzeuge.map((f) => (
          <button key={f.id} className={`filter${f.id===vehId?" on":""}`} onClick={() => setVehId(f.id)}>
            {f.name} · {f.kennung}
          </button>
        ))}
      </div>
      {veh.faecher.map((f) => {
        const frei = artikel.filter((a) => !f.items.some((i) => i.art === a.id));
        return (
          <div className="card" key={f.id}>
            <div className="cardtitle">{f.fach}</div>
            {f.items.length === 0 && <div className="empty">Noch keine Positionen in diesem Fach.</div>}
            {f.items.map((it) => (
              <div className="row" key={it.art}>
                <div className="rowmain">
                  <div className="rowname">{byId[it.art]?.name}</div>
                  <div className="rowmeta"><small>Handlager-Fach</small><span className="fach">{byId[it.art]?.fach}</span></div>
                </div>
                <Stepper sm min={1} wert={it.soll} setWert={(v) => setSoll(f.id, it.art, v)} />
                <button aria-label="Position entfernen" onClick={() => removeItem(f.id, it.art)}
                  style={{color:"var(--stahl)",padding:6}}><Trash2 size={16}/></button>
              </div>
            ))}
            <div className="row" style={{gap:9}}>
              <select className="input" defaultValue="" style={{flex:1}} aria-label="Artikel hinzufügen"
                onChange={(e) => { addItem(f.id, e.target.value); e.target.value = ""; }}>
                <option value="" disabled>Artikel hinzufügen …</option>
                {frei.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
        );
      })}
      <div className="card cardpad" style={{display:"flex",gap:9,alignItems:"center"}}>
        <input className="input" placeholder="Neues Fach, z. B. „Schrank 4 · Atmung“" value={neuFach}
          onChange={(e) => setNeuFach(e.target.value)} onKeyDown={(e) => { if (e.key==="Enter"){ addFach(neuFach); setNeuFach(""); }}}/>
        <button className="btn btn-ghost slim" onClick={() => { addFach(neuFach); setNeuFach(""); }}><Plus size={15}/> Fach</button>
      </div>
      <p className="footnote">Änderungen wirken sofort im Helfer-Check. Fahrzeuge anlegen/löschen: im echten Tool.</p>
    </>);
  };

  const Bestellung = () => (<>
    <div className="mainhead">
      <h1>Bestellvorschlag</h1>
      <button className="btn btn-ghost slim" onClick={() => {
        const txt = offene.map((a) => `${vorschlagFuer(a)} × ${a.name}`).join("\n");
        try { navigator.clipboard?.writeText(txt); } catch (e) {}
        setToast({icon:<Copy size={15}/>, msg:"Bestellliste kopiert (Demo)"});
      }}><Copy size={15}/> Liste kopieren</button>
      <p>Automatisch aus den Buchungen abgeleitet · Vorschlag = 2 × Mindestbestand − Bestand.</p>
    </div>
    <div className="card" style={{overflowX:"auto"}}>
      {unterListe.length === 0 ? <div className="empty">Alles über Mindestbestand – nichts zu bestellen.</div> : (
        <table className="tbl">
          <thead><tr><th></th><th>Artikel</th><th>Bestand / Min.</th><th>Vorschlag</th><th>Status</th></tr></thead>
          <tbody>
            {unterListe.map((a) => (
              <tr key={a.id}>
                <td><button className={`checkcircle ${bestellt[a.id]?"done":""}`}
                  aria-label={bestellt[a.id]?"Bestellung zurücknehmen":"Als bestellt markieren"}
                  onClick={() => setBestellt((b) => ({...b, [a.id]: !b[a.id]}))}>
                  {bestellt[a.id] && <Check size={15}/>}</button></td>
                <td style={{fontWeight:600}} className={bestellt[a.id]?"strike":""}>{a.name}</td>
                <td className="mono">{bestandOf(a)} / {a.mindest}</td>
                <td className="num">{vorschlagFuer(a)} <span style={{font:"500 11px var(--body)",color:"var(--stahl)"}}>{a.einheit}</span></td>
                <td>{bestellt[a.id] ? <span className="chip chip-ok">bestellt</span> : <span className="chip chip-rot">offen</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  </>);

  const Journal = () => (<>
    <div className="mainhead"><h1>Journal</h1><p>Append-only Buchungsjournal – Bestand ist immer die Summe der Buchungen.</p></div>
    <div className="card" style={{overflowX:"auto"}}>
      <table className="tbl">
        <thead><tr><th>Zeit</th><th>Artikel</th><th>Vorgang</th><th>Δ</th><th>Quelle</th></tr></thead>
        <tbody>
          {journal.map((j) => (
            <tr key={j.id}>
              <td className="mono">{j.ts}</td>
              <td style={{fontWeight:600}}>{byId[j.artId]?.name ?? "–"}</td>
              <td>{j.label}</td>
              <td className={`mono jdelta ${j.delta<0?"minus":"plus"}`}>{j.delta>0?"+":""}{j.delta}</td>
              <td><span className="chip chip-grau mono" style={{fontSize:10.5}}>{j.quelle}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>);

  const Tokens = () => {
    const [scope, setScope] = useState("lager");
    const scopeLabel = (s) => s === "lager" ? "Handlager" : fahrzeuge.find((f) => f.id === s)?.name ?? s;
    return (<>
      <div className="mainhead">
        <h1>Zugänge für Helfer:innen</h1>
        <div style={{display:"flex",gap:8}}>
          <select className="input" style={{width:"auto"}} value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Bereich">
            <option value="lager">Handlager</option>
            {fahrzeuge.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button className="btn btn-rot slim" onClick={() => {
            const t = { code: zufallsCode(), scope, label: scopeLabel(scope), erstellt: jetztTs().split(" ")[0] + "2026", aktiv: true };
            setTokens((ts) => [t, ...ts]);
            setToast({icon:<Key size={15}/>, msg:`Neuer Code ${t.code} für ${t.label} erzeugt`});
          }}><Plus size={15}/> Code erzeugen</button>
        </div>
        <p>Codes hängen als Etikett im Fahrzeug bzw. am Regal – kein Konto, keine Personenzuordnung.</p>
      </div>
      <div className="card" style={{overflowX:"auto"}}>
        <table className="tbl">
          <thead><tr><th>Code</th><th>Bereich</th><th>Erstellt</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.code}>
                <td className="mono" style={{fontWeight:600,letterSpacing:".08em"}}>{t.code}</td>
                <td>{t.label}</td>
                <td className="mono">{t.erstellt}</td>
                <td>{t.aktiv ? <span className="chip chip-ok">aktiv</span> : <span className="chip chip-grau">gesperrt</span>}</td>
                <td style={{textAlign:"right"}}>
                  <button className="filter" onClick={() => setTokens((ts) => ts.map((x) => x.code===t.code ? {...x, aktiv:!x.aktiv} : x))}>
                    {t.aktiv ? "Sperren" : "Aktivieren"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>);
  };

  /* — Artikel-Drawer — */
  const Drawer = ({ id }) => {
    const a = byId[id];
    const [menge, setMenge] = useState(1);
    const [chMenge, setChMenge] = useState(10);
    const [chVerfall, setChVerfall] = useState("2028-06");
    const bestand = bestandOf(a);
    const patchArt = (fn) => setArtikel((as) => as.map((x) => x.id === id ? fn(x) : x));
    return (
      <div className="drawerdim" onClick={() => setDrawerArt(null)}>
        <div className="drawer" onClick={(e) => e.stopPropagation()}>
          <div className="sheettitle">
            <h2>{a.name}</h2>
            <button aria-label="Schließen" onClick={() => setDrawerArt(null)}><X size={20}/></button>
          </div>
          <div className="rowmeta" style={{margin:"0 0 12px"}}><StatusChips a={a}/></div>

          <div className="card cardpad grid2">
            <div>
              <span className="label">Bestand</span>
              <div style={{font:"700 30px var(--display)"}}>{bestand} <span style={{fontSize:14}}>{a.einheit}</span></div>
            </div>
            <div>
              <span className="label">Mindestbestand</span>
              <Stepper sm min={0} wert={a.mindest} setWert={(v) => patchArt((x) => ({...x, mindest:v}))}/>
            </div>
            <div>
              <span className="label">Fach im Handlager</span>
              <input className="input" value={a.fach} onChange={(e) => patchArt((x) => ({...x, fach:e.target.value.toUpperCase()}))}/>
            </div>
            <div>
              <span className="label">Einheit</span>
              <select className="input" value={a.einheit} onChange={(e) => patchArt((x) => ({...x, einheit:e.target.value}))}>
                {["Stk.","Pkg.","Fl.","Box"].map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div className="card">
            <div className="cardtitle">Buchung</div>
            <div className="cardpad" style={{display:"grid",gap:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13.5,color:"var(--stahl)"}}>Menge</span>
                <Stepper wert={menge} setWert={setMenge}/>
              </div>
              <div className="btnrow">
                <button className="btn btn-rot" disabled={bestand===0} onClick={() => {
                  const m = Math.min(menge, bestand);
                  buchen(a.id, -m, "Entnahme · Handlager", "Verwaltung");
                  setToast({icon:<Check size={16}/>, msg:`Entnahme gebucht: ${m} × ${a.name}`}); setMenge(1);
                }}><Minus size={15}/> Entnahme</button>
                <button className="btn btn-ghost" onClick={() => {
                  buchen(a.id, menge, "Wareneingang", "Verwaltung");
                  setToast({icon:<Check size={16}/>, msg:`Zugang gebucht: ${menge} × ${a.name}`}); setMenge(1);
                }}><Plus size={15}/> Zugang</button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="cardtitle">Chargen · älteste zuerst (FEFO)</div>
            {a.chargen.length === 0 && <div className="empty">Keine Chargen im Bestand.</div>}
            {[...a.chargen].sort((x,y) => x.verfall.localeCompare(y.verfall)).map((c) => {
              const s = verfallStatus(c.verfall);
              return (
                <div className="row" key={c.nr}>
                  <Plakette verfall={c.verfall}/>
                  <div className="rowmain">
                    <div style={{font:"600 12.5px var(--mono)"}}>Charge {c.nr}</div>
                    <div className="rowmeta"><span className={`chip chip-${s.tone}`}>{s.text}</span></div>
                  </div>
                  <div className="bignum" style={{fontSize:19}}>{c.menge}<small>{a.einheit}</small></div>
                </div>
              );
            })}
            <div className="row" style={{gap:8,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:120}}>
                <span className="label">Verfall</span>
                <input className="input" type="month" value={chVerfall} onChange={(e) => setChVerfall(e.target.value)}/>
              </div>
              <div>
                <span className="label">Menge</span>
                <Stepper sm wert={chMenge} setWert={setChMenge}/>
              </div>
              <button className="btn btn-ghost slim" style={{alignSelf:"flex-end"}} onClick={() => {
                if (!chVerfall) return;
                patchArt((x) => ({...x, chargen:[...x.chargen, {nr:"NEU-"+zufallsCode(), verfall:chVerfall, menge:chMenge}]}));
                setToast({icon:<Check size={15}/>, msg:`Charge angelegt: ${chMenge} × ${a.name}`});
              }}><Plus size={14}/> Charge</button>
            </div>
          </div>

          <div className="card journal">
            <div className="cardtitle">Letzte Buchungen</div>
            {journal.filter((j) => j.artId === id).slice(0,5).map((j) => (
              <div className="row" key={j.id}>
                <span className="jts">{j.ts}</span>
                <span style={{flex:1}}>{j.label} · <span style={{color:"var(--stahl)"}}>{j.quelle}</span></span>
                <span className={`jdelta ${j.delta<0?"minus":"plus"}`}>{j.delta>0?"+":""}{j.delta}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  /* — Neuer Artikel — */
  const NeuDrawer = () => {
    const [name, setName] = useState("");
    const [einheit, setEinheit] = useState("Stk.");
    const [fach, setFach] = useState("A1");
    const [mindest, setMindest] = useState(5);
    return (
      <div className="drawerdim" onClick={() => setNeuOffen(false)}>
        <div className="drawer" onClick={(e) => e.stopPropagation()}>
          <div className="sheettitle"><h2>Neuer Artikel</h2>
            <button aria-label="Schließen" onClick={() => setNeuOffen(false)}><X size={20}/></button></div>
          <div className="card cardpad" style={{display:"grid",gap:12}}>
            <div><span className="label">Bezeichnung</span>
              <input className="input" placeholder="z. B. Beatmungsfilter HME" value={name} onChange={(e) => setName(e.target.value)}/></div>
            <div className="grid2">
              <div><span className="label">Einheit</span>
                <select className="input" value={einheit} onChange={(e) => setEinheit(e.target.value)}>
                  {["Stk.","Pkg.","Fl.","Box"].map((u) => <option key={u}>{u}</option>)}</select></div>
              <div><span className="label">Fach</span>
                <input className="input" value={fach} onChange={(e) => setFach(e.target.value.toUpperCase())}/></div>
            </div>
            <div><span className="label">Mindestbestand</span><Stepper sm min={0} wert={mindest} setWert={setMindest}/></div>
            <button className="btn btn-rot" disabled={!name.trim()} onClick={() => {
              const id = "a" + Date.now();
              setArtikel((as) => [...as, { id, name:name.trim(), einheit, fach, mindest, chargen:[] }]);
              setNeuOffen(false); setDrawerArt(id);
              setToast({icon:<Check size={16}/>, msg:`Artikel angelegt: ${name.trim()} – Bestand über Zugang buchen`});
            }}><Plus size={16}/> Artikel anlegen</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="adm">
      <aside className="side">
        <div>
          <div className="brand">LAGER<span>BUCH</span></div>
          <div className="brandsub">Verwaltung · DRK Bereitschaft Musterstadt</div>
        </div>
        <nav className="snav">
          {nav.map((n) => {
            const Icon = n.icon;
            return (
              <button key={n.k} className={`sitem${sec===n.k?" on":""}`} onClick={() => setSec(n.k)}>
                <Icon size={17}/>{n.label}{n.cnt > 0 && <span className="cnt">{n.cnt}</span>}
              </button>
            );
          })}
        </nav>
        <button className="sitem" onClick={onExit}><LogOut size={17}/><span className="logout-label">Abmelden</span></button>
      </aside>
      <main className="main">
        {sec==="uebersicht" && <Uebersicht/>}
        {sec==="artikel" && <ArtikelTbl/>}
        {sec==="soll" && <SollEditor/>}
        {sec==="bestellung" && <Bestellung/>}
        {sec==="journal" && <Journal/>}
        {sec==="tokens" && <Tokens/>}
      </main>
      {drawerArt && <Drawer id={drawerArt} key={drawerArt}/>}
      {neuOffen && <NeuDrawer/>}
    </div>
  );
}

/* ═════════════ ROOT ═════════════ */
export default function App() {
  const [mode, setMode] = useState("gate");            // gate | helfer | admin
  const [helferToken, setHelferToken] = useState(null);
  const [artikel, setArtikel] = useState(SEED_ARTIKEL);
  const [fahrzeuge, setFahrzeuge] = useState(SEED_FAHRZEUGE);
  const [tokens, setTokens] = useState(SEED_TOKENS);
  const [journal, setJournal] = useState(SEED_JOURNAL);
  const [toast, setToast] = useState(null);
  const jId = useRef(10);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const byId = useMemo(() => Object.fromEntries(artikel.map((a) => [a.id, a])), [artikel]);

  function buchen(artId, delta, label, quelle) {
    setArtikel((prev) => prev.map((a) => {
      if (a.id !== artId) return a;
      if (delta < 0) return { ...a, chargen: fefoEntnahme(a.chargen, -delta) };
      return { ...a, chargen: [...a.chargen, { nr:"WE-"+zufallsCode(), verfall:"2028-12", menge:delta }] };
    }));
    setJournal((j) => [{ id: jId.current++, ts: jetztTs(), artId, delta, label, quelle }, ...j]);
  }

  return (
    <div className="root">
      <style>{CSS}</style>
      {mode === "gate" && (
        <Gate tokens={tokens}
          onHelfer={(t) => { setHelferToken(t); setMode("helfer"); }}
          onAdmin={() => setMode("admin")} />
      )}
      {mode === "helfer" && helferToken && (
        <HelferView artikel={artikel} byId={byId} fahrzeuge={fahrzeuge} token={helferToken}
          buchen={buchen} setToast={setToast} onExit={() => setMode("gate")} />
      )}
      {mode === "admin" && (
        <AdminView artikel={artikel} setArtikel={setArtikel} byId={byId} journal={journal}
          fahrzeuge={fahrzeuge} setFahrzeuge={setFahrzeuge} tokens={tokens} setTokens={setTokens}
          buchen={buchen} setToast={setToast} onExit={() => setMode("gate")} />
      )}
      {toast && <div className="toast" role="status">{toast.icon}{toast.msg}</div>}
    </div>
  );
}

