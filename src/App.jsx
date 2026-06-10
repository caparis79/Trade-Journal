/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-undef */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  LayoutDashboard, Calendar as CalendarIcon, List, Upload, TrendingUp, 
  DollarSign, Target, BarChart3, Activity, ChevronLeft, ChevronRight, 
  Filter, CheckCircle2, AlertCircle, X, Trash2, Plus, Cloud, CloudOff, CloudLightning
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, onSnapshot, deleteDoc, writeBatch } from 'firebase/firestore';

const appId = typeof window !== 'undefined' && window.__app_id ? window.__app_id : 'trade-log-app';
let firebaseConfig = null;
if (typeof window !== 'undefined' && window.__firebase_config) {
  try {
    firebaseConfig = typeof window.__firebase_config === 'string' ? JSON.parse(window.__firebase_config) : window.__firebase_config;
  } catch (err) { console.error("Firebase config parse error:", err); }
}

let app, auth, db;
if (firebaseConfig?.apiKey) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (err) { console.error("Firebase initialization failed:", err); }
}

const generateUUID = () => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) return window.crypto.randomUUID();
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
};

// ROBUST PARSER: Handles complex quotes, commas inside fields, and empty parameters safely
const parseCSVLine = (text) => {
  if (!text || typeof text !== 'string') return [];
  const cleanLine = text.trim();
  if (!cleanLine) return [];
  
  const matches = [];
  const regex = /"([^"]*)"|([^,]+)|(?<=,)(?=,)|(?<=,)$|^$/g;
  let match;
  
  while ((match = regex.exec(cleanLine)) !== null) {
    if (match[1] !== undefined) {
      matches.push(match[1].trim());
    } else if (match[2] !== undefined) {
      matches.push(match[2].trim());
    } else {
      matches.push("");
    }
    if (regex.lastIndex === match.index) {
      regex.lastIndex++;
    }
  }
  return matches;
};

const initialTrades = [
  { id: "1", dateOpen: "2026-06-01", dateClose: "2026-06-02", ticker: "MU", type: "Option", side: "Long", pnl: 57.75 },
  { id: "2", dateOpen: "2026-06-02", dateClose: "2026-06-02", ticker: "TSLA", type: "Option", side: "Short", pnl: -320.00 },
  { id: "3", dateOpen: "2026-06-03", dateClose: "2026-06-04", ticker: "MRVL", type: "Option", side: "Long", pnl: 104.68 },
  { id: "4", dateOpen: "2026-06-04", dateClose: "2026-06-04", ticker: "MSFT", type: "Option", side: "Long", pnl: 61.75 },
  { id: "5", dateOpen: "2026-06-03", dateClose: "2026-06-04", ticker: "HOOD", type: "Option", side: "Long", pnl: 44.75 }
];

export default function App() {
  const [trades, setTrades] = useState(initialTrades);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [dateFilter, setDateFilter] = useState('all'); 
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedTicker, setSelectedTicker] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [csvText, setCsvText] = useState('');
  const [csvPreviewHeaders, setCsvPreviewHeaders] = useState([]);
  const [csvPreviewRows, setCsvPreviewRows] = useState([]);
  const [mappings, setMappings] = useState({ dateOpen: '', dateClose: '', ticker: '', type: '', side: '', pnl: '' });
  const [isMappingMode, setIsMappingMode] = useState(false);
  const [calendarYear, setCalendarYear] = useState(2026);
  const [calendarMonth, setCalendarMonth] = useState(5); 
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTrade, setNewTrade] = useState({ dateOpen: new Date().toISOString().split('T')[0], dateClose: new Date().toISOString().split('T')[0], ticker: '', type: 'Stock', side: 'Long', pnl: '' });
  const [toast, setToast] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  const showToast = useCallback((message, type = 'success') => setToast({ message, type }), []);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); } }, [toast]);
  const triggerConfirm = (message, onConfirm) => setConfirmModal({ message, onConfirm });

  useEffect(() => {
    if (!auth) { showToast("Running in local session mode (offline database).", "info"); return; }
    const initAuth = async () => {
      try {
        setIsSyncing(true);
        if (typeof window !== 'undefined' && window.__initial_auth_token) { await signInWithCustomToken(auth, window.__initial_auth_token); } 
        else { await signInAnonymously(auth); }
      } catch (err) { setSyncError("Cloud Sync Disabled: Auth rejected mapping."); } finally { setIsSyncing(false); }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!db || !user) return;
    setIsSyncing(true);
    const tradesCol = collection(db, 'artifacts', appId, 'users', user.uid, 'trades');
    return onSnapshot(tradesCol, (snap) => {
      const dbTrades = [];
      snap.forEach(doc => dbTrades.push({ id: doc.id, ...doc.data() }));
      if (dbTrades.length > 0) setTrades(dbTrades);
      setIsSyncing(false);
    }, (err) => { setSyncError("Firestore access restricted."); setIsSyncing(false); });
  }, [user]);

  const handleAddTrade = async (tradeToSave) => {
    const formatted = { ...tradeToSave, pnl: parseFloat(tradeToSave.pnl) || 0, dateOpen: tradeToSave.dateOpen || tradeToSave.dateClose };
    if (db && user) {
      setIsSyncing(true);
      try {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'trades', generateUUID()), formatted);
        showToast("Trade synchronized with cloud storage.");
      } catch (err) {
        setTrades(prev => [...prev, { id: generateUUID(), ...formatted }]);
        showToast("Saved to session memory (Offline fallback).", "error");
      } finally { setIsSyncing(false); }
    } else {
      setTrades(prev => [...prev, { id: generateUUID(), ...formatted }]);
      showToast("Trade saved locally.");
    }
  };

  const handleDeleteTrade = async (id) => {
    if (db && user) {
      setIsSyncing(true);
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'trades', id));
        showToast("Record removed from remote servers.");
      } catch (err) { showToast("Could not contact cloud network.", "error"); } finally { setIsSyncing(false); }
    } else {
      setTrades(prev => prev.filter(t => t.id !== id));
      showToast("Record removed from session table.");
    }
  };

  const handleClearAll = async () => {
    if (db && user) {
      setIsSyncing(true);
      try {
        const batch = writeBatch(db);
        trades.forEach(t => batch.delete(doc(db, 'artifacts', appId, 'users', user.uid, 'trades', t.id)));
        await batch.commit(); setTrades([]); showToast("Cloud records purged.");
      } catch (err) { showToast("Purge failed.", "error"); } finally { setIsSyncing(false); }
    } else { setTrades([]); showToast("Local memory workspace reset."); }
  };

  const handleBulkImport = async (importedList) => {
    if (db && user) {
      setIsSyncing(true);
      try {
        const batch = writeBatch(db);
        importedList.forEach(t => batch.set(doc(db, 'artifacts', appId, 'users', user.uid, 'trades', generateUUID()), t));
        await batch.commit(); showToast(`Imported and synced ${importedList.length} transactions.`);
      } catch (err) {
        setTrades(prev => [...prev, ...importedList.map(t => ({ ...t, id: generateUUID() }))]);
        showToast("Network sync interrupted. Saved locally.", "error");
      } finally { setIsSyncing(false); }
    } else {
      setTrades(prev => [...prev, ...importedList.map(t => ({ ...t, id: generateUUID() }))]);
      showToast(`Imported ${importedList.length} trades locally.`);
    }
  };

  const processTastytradeFIFO = (lines) => {
    try {
      if (!lines?.length) return null;
      const hdrs = parseCSVLine(lines[0]).map(h => h?.toLowerCase() || '');
      const getIdx = (k) => hdrs.findIndex(h => h.includes(k));
      const iDate = getIdx('date'), iType = getIdx('type'), iAct = getIdx('action'), iSym = getIdx('symbol'), iUnd = getIdx('underlying'), iInst = getIdx('instrument'), iQty = getIdx('quantity'), iTot = getIdx('total');
      if ([iDate, iAct, iSym, iTot].some(i => i === -1)) return null;

      const tradeRows = lines.slice(1).map(line => {
        const c = parseCSVLine(line);
        if (c.length <= Math.max(iDate, iAct, iSym, iTot) || (c[iType] !== 'Trade' && c[iType] !== 'Receive Deliver')) return null;
        return {
          date: c[iDate], action: c[iAct], symbol: c[iSym].replace(/\s+/g, ' ').trim(),
          underlying: (c[iUnd] || c[iSym]).trim(), instrument: c[iInst] || 'Stock',
          quantity: Math.abs(parseInt(c[iQty], 10)) || 1, total: parseFloat((c[iTot] || '').replace(/[^0-9.-]/g, '')) || 0
        };
      }).filter(Boolean).sort((a, b) => new Date(a.date) - new Date(b.date));

      const opens = {}; const completed = [];
      tradeRows.forEach(row => {
        const sym = row.symbol, act = row.action;
        const isOpen = act.includes('_OPEN') || act === 'BUY' || act === 'SELL';
        if (!opens[sym]) opens[sym] = [];
        if (isOpen) {
          opens[sym].push({ qtyRemaining: row.quantity, totalCost: row.total, dateOpen: row.date.split('T')[0], side: act.includes('BUY') ? 'Long' : 'Short', ticker: row.underlying.toUpperCase(), instrument: row.instrument === 'Equity Option' ? 'Option' : row.instrument });
        } else {
          let qtyToClose = row.quantity;
          while (qtyToClose > 0 && opens[sym]?.length > 0) {
            const firstOpen = opens[sym][0];
            const matchQty = Math.min(qtyToClose, firstOpen.qtyRemaining);
            completed.push({
              dateOpen: firstOpen.dateOpen, dateClose: row.date.split('T')[0], ticker: firstOpen.ticker, type: firstOpen.instrument, side: firstOpen.side,
              pnl: ((firstOpen.totalCost / firstOpen.qtyRemaining) * matchQty) + ((row.total / row.quantity) * matchQty)
            });
            qtyToClose -= matchQty; firstOpen.qtyRemaining -= matchQty;
            if (firstOpen.qtyRemaining <= 0) opens[sym].shift();
          }
          if (qtyToClose > 0) {
            completed.push({ dateOpen: row.date.split('T')[0], dateClose: row.date.split('T')[0], ticker: row.underlying.toUpperCase() + " (Pre-Open)", type: row.instrument === 'Equity Option' ? 'Option' : row.instrument, side: act.includes('BUY') ? 'Short' : 'Long', pnl: (row.total / row.quantity) * qtyToClose });
          }
        }
      });
      return completed;
    } catch (err) { return null; }
  };

  const getSanitizedLines = () => {
    const cleanPattern = new RegExp('\\[' + 'source' + ':\\s*\\d+\\]', 'gi');
    const rawLines = csvText.replace(cleanPattern, '').split(/\r?\n/);
    const sanitized = []; let buffer = "";
    for (let line of rawLines) {
      line = line.trim(); if (!line) continue;
      if (!buffer) buffer = line;
      else {
        if (/^\d{4}-\d{2}-\d{2}/.test(line) || /^date,/i.test(line)) { sanitized.push(buffer); buffer = line; } 
        else { buffer += " " + line; }
      }
    }
    if (buffer) sanitized.push(buffer);
    return sanitized;
  };

  const startCsvMapping = () => {
    if (!csvText?.trim()) { showToast("Please paste CSV text first.", "error"); return; }
    const lines = getSanitizedLines();
    if (lines.length < 2) { showToast("Format parse error. Missing structural rows.", "error"); return; }
    
    const fifoTrades = processTastytradeFIFO(lines);
    if (fifoTrades?.length > 0) { handleBulkImport(fifoTrades); setCsvText(''); setIsMappingMode(false); return; }

    const headers = parseCSVLine(lines[0]);
    setCsvPreviewHeaders(headers); setCsvPreviewRows(lines.slice(1, 4).map(l => parseCSVLine(l)));

    const detected = { dateOpen: '', dateClose: '', ticker: '', type: '', side: '', pnl: '' };
    headers.forEach((h, idx) => {
      if (!h) return; const l = h.toLowerCase();
      if (l.includes('open') && l.includes('date')) detected.dateOpen = String(idx);
      else if (l.includes('close') && l.includes('date')) detected.dateClose = String(idx);
      else if (l.includes('date') && !detected.dateClose) detected.dateClose = String(idx);
      else if (l.includes('ticker') || l.includes('symbol')) detected.ticker = String(idx);
      else if (l.includes('type') || l.includes('asset')) detected.type = String(idx);
      else if (l.includes('side') || l.includes('action')) detected.side = String(idx);
      else if (l.includes('pnl') || l.includes('p/l') || l.includes('profit') || l.includes('total')) detected.pnl = String(idx);
    });
    setMappings(detected); setIsMappingMode(true);
  };

  const executeCsvImport = () => {
    if (!mappings.dateClose || !mappings.ticker || !mappings.pnl) { showToast("Mapping failure: Missing required columns.", "error"); return; }
    try {
      const lines = getSanitizedLines().slice(1);
      const parsed = [];
      lines.forEach(row => {
        const cells = parseCSVLine(row); if (cells.length < 2) return;
        const dClose = cells[parseInt(mappings.dateClose, 10)];
        const tk = cells[parseInt(mappings.ticker, 10)];
        const pRaw = cells[parseInt(mappings.pnl, 10)];
        if (!dClose || !tk || pRaw === undefined) return;

        parsed.push({
          dateOpen: mappings.dateOpen ? cells[parseInt(mappings.dateOpen, 10)] : dClose,
          dateClose: dClose.split('T')[0], ticker: tk.split(' ')[0].toUpperCase(),
          type: mappings.type ? cells[parseInt(mappings.type, 10)] : 'Stock',
          side: mappings.side ? cells[parseInt(mappings.side, 10)] : 'Long',
          pnl: parseFloat(pRaw.replace(/[^0-9.-]/g, '')) || 0
        });
      });
      if (parsed.length > 0) { handleBulkImport(parsed); setIsMappingMode(false); setCsvText(''); } 
      else { showToast("Zero records matched mapping criteria.", "error"); }
    } catch (e) { showToast("CSV processing stream structural anomaly.", "error"); }
  };

  const processedTrades = useMemo(() => {
    return trades.filter(t => {
      if (selectedTicker !== 'All' && t.ticker !== selectedTicker) return false;
      if (selectedType !== 'All' && t.type !== selectedType) return false;
      const cDate = new Date(t.dateClose); const today = new Date(); today.setHours(0,0,0,0);
      switch (dateFilter) {
        case 'today': const tD = new Date(t.dateClose + 'T00:00:00'); const check = new Date(); return tD.getDate() === check.getDate() && tD.getMonth() === check.getMonth() && tD.getFullYear() === check.getFullYear();
        case 'week': const sW = new Date(today); sW.setDate(today.getDate() - today.getDay()); return cDate >= sW;
        case 'month': return cDate.getMonth() === today.getMonth() && cDate.getFullYear() === today.getFullYear();
        case 'year': return cDate.getFullYear() === today.getFullYear();
        case 'custom':
          if (startDate && cDate < new Date(startDate + 'T00:00:00')) return false;
          if (endDate && cDate > new Date(endDate + 'T23:59:59')) return false;
          return true;
        default: return true;
      }
    });
  }, [trades, dateFilter, startDate, endDate, selectedTicker, selectedType]);

  const tickerOptions = useMemo(() => ['All', ...Array.from(new Set(trades.map(t => t.ticker))).sort()], [trades]);
  const typeOptions = useMemo(() => ['All', ...Array.from(new Set(trades.map(t => t.type))).sort()], [trades]);

  const metrics = useMemo(() => {
    if (!processedTrades.length) return { totalPnl: 0, winRate: 0, profitFactor: 0, totalTrades: 0, wins: 0, losses: 0, avgWin: 0, avgLoss: 0 };
    let gp = 0, gl = 0, w = 0, l = 0;
    processedTrades.forEach(t => {
      const v = parseFloat(t.pnl) || 0;
      if (v > 0) { gp += v; w++; } else if (v < 0) { gl += Math.abs(v); l++; }
    });
    return {
      totalPnl: gp - gl, winRate: ((w / processedTrades.length) * 100).toFixed(1),
      profitFactor: gl === 0 ? gp.toFixed(2) : (gp / gl).toFixed(2), totalTrades: processedTrades.length,
      wins: w, losses: l, avgWin: w > 0 ? (gp / w).toFixed(2) : 0, avgLoss: l > 0 ? (gl / l).toFixed(2) : 0
    };
  }, [processedTrades]);

  const tickerStats = useMemo(() => {
    const data = {};
    processedTrades.forEach(t => {
      if (!data[t.ticker]) data[t.ticker] = { pnl: 0, count: 0, wins: 0 };
      data[t.ticker].pnl += parseFloat(t.pnl) || 0; data[t.ticker].count++;
      if (parseFloat(t.pnl) > 0) data[t.ticker].wins++;
    });
    return Object.entries(data).map(([ticker, s]) => ({ ticker, pnl: s.pnl, trades: s.count, winRate: ((s.wins / s.count) * 100).toFixed(0) })).sort((a, b) => b.pnl - a.pnl);
  }, [processedTrades]);

  const equityCurvePoints = useMemo(() => {
    const sorted = [...processedTrades].sort((a, b) => new Date(a.dateClose) - new Date(b.dateClose));
    let sum = 0; return sorted.map((t, idx) => { sum += parseFloat(t.pnl); return { label: t.dateClose, pnl: sum, idx: idx + 1 }; });
  }, [processedTrades]);

  const renderDashboard = () => {
    const pnlV = equityCurvePoints.map(p => p.pnl);
    const minP = Math.min(0, ...pnlV); const maxP = Math.max(10, ...pnlV); const rng = maxP - minP;
    const w = 600, h = 220, pad = 25;
    const getX = (i) => pad + (i / (equityCurvePoints.length - 1)) * (w - 2 * pad);
    const getY = (v) => h - pad - ((v - minP) / rng) * (h - 2 * pad);
    let path = equityCurvePoints.length > 1 ? `M ${getX(0)} ${getY(equityCurvePoints[0].pnl)}` : '';
    for (let i = 1; i < equityCurvePoints.length; i++) path += ` L ${getX(i)} ${getY(equityCurvePoints[i].pnl)}`;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className={`p-3 rounded-full ${metrics.totalPnl >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}><DollarSign size={22} /></div>
            <div><p className="text-xs text-slate-500 font-semibold">Net P/L</p><h3 className={`text-xl font-bold ${metrics.totalPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>${metrics.totalPnl.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</h3></div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 rounded-full bg-blue-100 text-blue-600"><Target size={22} /></div>
            <div><p className="text-xs text-slate-500 font-semibold">Win Rate</p><h3 className="text-xl font-bold text-slate-800">{metrics.winRate}%</h3></div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 rounded-full bg-purple-100 text-purple-600"><TrendingUp size={22} /></div>
            <div><p className="text-xs text-slate-500 font-semibold">Profit Factor</p><h3 className="text-xl font-bold text-slate-800">{metrics.profitFactor}</h3></div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 rounded-full bg-orange-100 text-orange-600"><Activity size={22} /></div>
            <div><p className="text-xs text-slate-500 font-semibold">Avg Win / Loss</p><h3 className="text-base font-bold text-slate-800"><span className="text-emerald-600">${parseFloat(metrics.avgWin).toFixed(0)}</span><span className="text-slate-300 mx-1">/</span><span className="text-rose-600">-${parseFloat(metrics.avgLoss).toFixed(0)}</span></h3></div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white lg:col-span-2 rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center"><h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center"><Activity className="mr-2 h-4 w-4 text-sky-500" /> Equity Curve Tracking</h2></div>
            <div className="p-5 flex-1 flex flex-col justify-center">
              {equityCurvePoints.length < 2 ? (
                <div className="h-44 flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200"><p className="text-xs font-medium">Add 2+ close executions to generate analytics timeline</p></div>
              ) : (
                <div className="w-full">
                  <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto overflow-visible select-none">
                    <line x1={pad} y1={getY(0)} x2={w - pad} y2={getY(0)} stroke="#cbd5e1" strokeDasharray="3" strokeWidth="1" />
                    <path d={`${path} L ${getX(equityCurvePoints.length - 1)} ${h - pad} L ${getX(0)} ${h - pad} Z`} fill="url(#eqG)" opacity="0.1" />
                    <path d={path} fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    {equityCurvePoints.map((pt, idx) => <circle key={idx} cx={getX(idx)} cy={getY(pt.pnl)} r="3" fill="#ffffff" stroke={pt.pnl >= 0 ? '#10b981' : '#f43f5e'} strokeWidth="1.5" />)}
                    <defs><linearGradient id="eqG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0ea5e9" /><stop offset="100%" stopColor="#38bdf8" /></linearGradient></defs>
                  </svg>
                </div>
              )}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between">
            <div className="p-4 border-b border-slate-100 bg-slate-50"><h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center"><Target className="mr-2 h-4 w-4 text-indigo-500" /> Performance Ratio Split</h2></div>
            <div className="p-5 space-y-4 flex-1 flex flex-col justify-center">
              <div className="flex justify-between items-center text-xs"><span className="text-slate-500">Wins</span><span className="font-semibold text-emerald-600">{metrics.wins} trades</span></div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden"><div className="bg-emerald-500 h-full" style={{ width: `${metrics.winRate}%` }}></div></div>
              <div className="flex justify-between items-center text-xs"><span className="text-slate-500">Losses</span><span className="font-semibold text-rose-600">{metrics.losses} trades</span></div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden"><div className="bg-rose-500 h-full" style={{ width: `${100 - metrics.winRate}%` }}></div></div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50"><h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center"><BarChart3 className="mr-2 h-4 w-4 text-emerald-500" /> Performance Breakdown by Ticker</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-white border-b border-slate-200 text-slate-500 uppercase font-semibold">
                  <th className="p-3">Ticker</th><th className="p-3">Executions</th><th className="p-3">Avg Win Rate</th><th className="p-3 text-right">Aggregate P/L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {tickerStats.length === 0 ? (<tr><td colSpan="4" className="p-4 text-center text-slate-400">No trading records within target filters</td></tr>) : 
                tickerStats.map((t) => (
                  <tr key={t.ticker} className="hover:bg-slate-50/60 transition">
                    <td className="p-3 font-bold text-slate-900">{t.ticker}</td><td className="p-3">{t.trades} trades</td><td className="p-3">{t.winRate}%</td>
                    <td className={`p-3 text-right font-bold ${t.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>${t.pnl.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderCalendar = () => {
    const days = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const fDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const cPnl = {};
    trades.forEach(t => {
      const p = t.dateClose.split('-');
      if (parseInt(p[0], 10) === calendarYear && (parseInt(p[1], 10) - 1) === calendarMonth) {
        cPnl[parseInt(p[2], 10)] = (cPnl[parseInt(p[2], 10)] || 0) + parseFloat(t.pnl);
      }
    });

    const shiftMonth = (d) => {
      if (d === 'p') { if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(y => y - 1); } else setCalendarMonth(m => m - 1); } 
      else { if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(y => y + 1); } else setCalendarMonth(m => m + 1); }
    };

    const cells = [];
    for (let i = 0; i < fDay; i++) cells.push(<div key={`e-${i}`} className="p-3 bg-slate-50/30 border border-slate-100 min-h-[75px]"></div>);
    for (let i = 1; i <= days; i++) {
      const val = cPnl[i]; let bg = "bg-white hover:bg-slate-50/50"; let txt = "text-slate-400";
      if (val > 0) { bg = "bg-emerald-50 border-emerald-100 hover:bg-emerald-100/40"; txt = "text-emerald-600 font-bold"; }
      else if (val < 0) { bg = "bg-rose-50 border-rose-100 hover:bg-rose-100/40"; txt = "text-rose-600 font-bold"; }
      cells.push(
        <div key={`d-${i}`} className={`p-2 border border-slate-100 flex flex-col justify-between min-h-[80px] transition ${bg}`}>
          <span className="text-[10px] font-bold text-slate-400">{i}</span>
          {val !== undefined && <span className={`text-right text-[11px] ${txt}`}>{val > 0 ? '+' : ''}${val.toFixed(2)}</span>}
        </div>
      );
    }

    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 flex items-center"><CalendarIcon className="mr-2 h-4 w-4 text-indigo-500" /> {months[calendarMonth]} {calendarYear}</h2>
          <div className="flex space-x-1">
            <button onClick={() => shiftMonth('p')} className="p-1.5 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-600"><ChevronLeft size={14} /></button>
            <button onClick={() => { const n = new Date(); setCalendarYear(n.getFullYear()); setCalendarMonth(n.getMonth()); }} className="px-2.5 py-1 border border-slate-200 rounded-lg text-[10px] font-bold bg-white hover:bg-slate-50 text-slate-700">Current</button>
            <button onClick={() => shiftMonth('n')} className="p-1.5 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-600"><ChevronRight size={14} /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 text-center border-b border-slate-100 bg-slate-50/50 text-[9px] font-bold text-slate-400 py-2 uppercase tracking-wider">
          <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
        </div>
        <div className="grid grid-cols-7">{cells}</div>
      </div>
    );
  };

  const renderLog = () => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
        <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center"><List className="mr-2 h-4 w-4 text-emerald-500" /> Transaction Execution Sheets</h2>
        <button onClick={() => setIsAddModalOpen(true)} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm flex items-center transition"><Plus size={13} className="mr-1" /> Log Trade</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse whitespace-nowrap text-xs">
          <thead>
            <tr className="bg-white border-b border-slate-200 text-slate-500 uppercase font-semibold">
              <th className="p-3">Open Date</th><th className="p-3">Close Date</th><th className="p-3">Ticker</th><th className="p-3">Type</th><th className="p-3">Side</th><th className="p-3 text-right">Net Profit / Loss</th><th className="p-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
            {processedTrades.length === 0 ? (<tr><td colSpan="7" className="p-6 text-center text-slate-400">No records found matching filters.</td></tr>) : 
            [...processedTrades].sort((a,b) => new Date(b.dateClose) - new Date(a.dateClose)).map((t, i) => (
              <tr key={t.id || i} className="hover:bg-slate-50/60 transition">
                <td className="p-3 text-slate-500">{t.dateOpen}</td><td className="p-3 text-slate-800 font-semibold">{t.dateClose}</td>
                <td className="p-3 font-bold text-slate-900">{t.ticker}</td>
                <td className="p-3"><span>{t.type}</span></td>
                <td className="p-3"><span className={`font-bold ${t.side.toLowerCase() === 'long' ? 'text-sky-600' : 'text-purple-600'}`}>{t.side}</span></td>
                <td className={`p-3 text-right font-bold ${t.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{t.pnl >= 0 ? '+' : ''}${parseFloat(t.pnl).toFixed(2)}</td>
                <td className="p-3 text-center"><button onClick={() => triggerConfirm(`Delete execution reference for ${t.ticker}?`, () => handleDeleteTrade(t.id))} className="p-1 text-slate-400 hover:text-rose-600 rounded transition"><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderImport = () => (
    <div className="space-y-6">
      {!isMappingMode ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div><h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center mb-1"><Upload className="mr-2 h-4 w-4 text-indigo-500" /> Direct Brokerage Processing Core</h2><p className="text-xs text-slate-400">Pasting text scans for custom spreadsheet formatting and triggers automated Tastytrade structural FIFO matching rules.</p></div>
          <div className="space-y-3">
            <textarea className="w-full h-40 p-3 border border-slate-200 rounded-lg text-xs font-mono bg-slate-50/40" placeholder="Paste data records right here..." value={csvText} onChange={(e) => setCsvText(e.target.value)}></textarea>
            <div className="flex flex-wrap gap-2 pt-1 text-xs">
              <button onClick={startCsvMapping} className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-sm">Ingest File Streams</button>
              <button onClick={() => { setTrades(initialTrades); showToast("Demo logs restored."); }} className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold">Load Sandbox State</button>
              <div className="flex-grow"></div>
              <button onClick={() => triggerConfirm("Purge active table cache?", handleClearAll)} className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg font-semibold flex items-center"><Trash2 size={13} className="mr-1" /> Purge Cache</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-5">
          <div className="flex justify-between items-center"><h2 className="text-sm font-bold text-slate-800">Column Configuration Interface</h2><button onClick={() => setIsMappingMode(false)} className="text-slate-400"><X size={16} /></button></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {['dateClose', 'ticker', 'pnl'].map((field) => (
              <div key={field}>
                <label className="block font-bold text-slate-500 mb-1 capitalize">{field === 'pnl' ? 'Profit / Loss' : field}</label>
                <select className="w-full p-2 border border-slate-200 rounded-lg" value={mappings[field] || ''} onChange={(e) => setMappings({ ...mappings, [field]: e.target.value })}><option value="">-- Bind Header --</option>{csvPreviewHeaders.map((h, i) => <option key={i} value={i}>{h}</option>)}</select>
              </div>
            ))}
          </div>
          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 text-xs">
            <button onClick={() => setIsMappingMode(false)} className="px-3.5 py-1.5 bg-slate-100 rounded-lg font-semibold">Cancel</button>
            <button onClick={executeCsvImport} className="px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg font-bold">Apply Ingestion</button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-900 antialiased">
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center space-x-2 text-xs font-semibold">
          {toast.type === 'error' ? <AlertCircle className="text-rose-500 h-4 w-4" /> : <CheckCircle2 className="text-emerald-500 h-4 w-4" />}
          <span>{toast.message}</span>
        </div>
      )}

      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-5 max-w-xs w-full space-y-4 shadow-xl text-xs">
            <h3 className="font-bold text-slate-800">Verification Request</h3><p className="text-slate-500">{confirmModal.message}</p>
            <div className="flex justify-end space-x-2 pt-1">
              <button onClick={() => setConfirmModal(null)} className="px-3 py-1.5 bg-slate-100 rounded-lg font-semibold">Cancel</button>
              <button onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }} className="px-3 py-1.5 bg-rose-600 text-white rounded-lg font-bold">Execute</button>
            </div>
          </div>
        </div>
      )}

      {isAddModalOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-5 max-w-sm w-full space-y-4 shadow-xl text-xs">
            <div className="flex justify-between items-center"><h3 className="font-bold text-slate-800 uppercase tracking-wider">Log Executed Asset Entry</h3><button onClick={() => setIsAddModalOpen(false)} className="text-slate-400"><X size={15} /></button></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-slate-400 font-bold mb-1">Ticker</label><input type="text" placeholder="NVDA" className="w-full p-2 border border-slate-200 rounded-lg font-bold" value={newTrade.ticker} onChange={(e) => setNewTrade({ ...newTrade, ticker: e.target.value.toUpperCase() })} /></div>
              <div><label className="block text-slate-400 font-bold mb-1">Net P/L ($)</label><input type="number" placeholder="250.00" className="w-full p-2 border border-slate-200 rounded-lg" value={newTrade.pnl} onChange={(e) => setNewTrade({ ...newTrade, pnl: e.target.value })} /></div>
              <div><label className="block text-slate-400 font-bold mb-1">Asset Class</label><select className="w-full p-2 border border-slate-200 rounded-lg" value={newTrade.type} onChange={(e) => setNewTrade({ ...newTrade, type: e.target.value })}><option value="Stock">Stock</option><option value="Option">Option</option><option value="Future">Future</option></select></div>
              <div><label className="block text-slate-400 font-bold mb-1">Side</label><select className="w-full p-2 border border-slate-200 rounded-lg" value={newTrade.side} onChange={(e) => setNewTrade({ ...newTrade, side: e.target.value })}><option value="Long">Long</option><option value="Short">Short</option></select></div>
              <div><label className="block text-slate-400 font-bold mb-1">Open Date</label><input type="date" className="w-full p-2 border border-slate-200 rounded-lg" value={newTrade.dateOpen} onChange={(e) => setNewTrade({ ...newTrade, dateOpen: e.target.value })} /></div>
              <div><label className="block text-slate-400 font-bold mb-1">Close Date</label><input type="date" className="w-full p-2 border border-slate-200 rounded-lg font-bold" value={newTrade.dateClose} onChange={(e) => setNewTrade({ ...newTrade, dateClose: e.target.value })} /></div>
            </div>
            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
              <button onClick={() => setIsAddModalOpen(false)} className="px-3.5 py-1.5 bg-slate-100 rounded-lg font-semibold">Dismiss</button>
              <button onClick={() => { if (!newTrade.ticker || !newTrade.pnl) return; handleAddTrade(newTrade); setIsAddModalOpen(false); setNewTrade({ dateOpen: new Date().toISOString().split('T')[0], dateClose: new Date().toISOString().split('T')[0], ticker: '', type: 'Stock', side: 'Long', pnl: '' }); }} className="px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg font-bold">Save Record</button>
            </div>
          </div>
        </div>
      )}

      <aside className="w-full md:w-60 bg-slate-900 text-slate-300 flex-shrink-0 flex flex-col justify-between">
        <div className="p-5">
          <h1 className="text-lg font-black text-white flex items-center"><TrendingUp className="mr-2 text-emerald-400 h-5 w-5" /> TradeJournal</h1>
          <nav className="space-y-1 mt-6 text-xs font-bold">
            {[
              { id: 'dashboard', label: 'Portfolio Dashboard', icon: LayoutDashboard },
              { id: 'calendar', label: 'P/L Calendar', icon: CalendarIcon },
              { id: 'log', label: 'Executed Trade Log', icon: List },
              { id: 'import', label: 'CSV File Importer', icon: Upload }
            ].map(tab => {
              const Icon = tab.icon;
              return <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`w-full flex items-center px-3 py-2.5 rounded-lg ${activeTab === tab.id ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800/50'}`}><Icon className="h-4 w-4 mr-3" /> {tab.label}</button>;
            })}
          </nav>
        </div>
        <div className="p-3 bg-slate-950 border-t border-slate-800 m-3 rounded-lg space-y-1 text-[10px] font-semibold">
          <div className="flex items-center justify-between text-slate-400">
            <span>Database Connection</span>
            {isSyncing ? (<span className="text-yellow-500 flex items-center"><CloudLightning size={11} className="mr-1 animate-pulse" /> Syncing</span>) : db && user ? (<span className="text-emerald-500 flex items-center"><Cloud size={11} className="mr-1" /> Cloud Sync</span>) : (<span className="text-slate-400 flex items-center"><CloudOff size={11} className="mr-1" /> Session Memory</span>)}
          </div>
          {syncError && <p className="text-rose-400 tracking-tight">{syncError}</p>}
        </div>
      </aside>

      <main className="flex-1 p-5 lg:p-6 overflow-y-auto max-h-screen">
        <header className="mb-5 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row justify-between lg:items-center gap-3 text-xs">
          <h2 className="font-bold text-slate-700 flex items-center"><Filter className="mr-2 h-4 w-4 text-indigo-500" /> Metric Control Pipeline</h2>
          <div className="flex flex-wrap items-center gap-3 font-semibold">
            <div className="flex flex-col"><span className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Time Limit</span><select className="p-1.5 border border-slate-200 rounded-md bg-slate-50" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}><option value="all">All Time</option><option value="today">Today</option><option value="week">This Week</option><option value="month">This Month</option><option value="year">This Year</option><option value="custom">Custom Range</option></select></div>
            {dateFilter === 'custom' && (
              <>
                <div className="flex flex-col"><span className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Start</span><input type="date" className="p-1 border border-slate-200 rounded-md bg-slate-50" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
                <div className="flex flex-col"><span className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">End</span><input type="date" className="p-1 border border-slate-200 rounded-md bg-slate-50" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
              </>
            )}
            <div className="flex flex-col"><span className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Ticker</span><select className="p-1.5 border border-slate-200 rounded-md bg-slate-50" value={selectedTicker} onChange={(e) => setSelectedTicker(e.target.value)}>{tickerOptions.map(tk => <option key={tk} value={tk}>{tk}</option>)}</select></div>
            <div className="flex flex-col"><span className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Asset</span><select className="p-1.5 border border-slate-200 rounded-md bg-slate-50" value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>{typeOptions.map(tp => <option key={tp} value={tp}>{tp}</option>)}</select></div>
          </div>
        </header>

        <div className="max-w-5xl mx-auto">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'calendar' && renderCalendar()}
          {activeTab === 'log' && renderLog()}
          {activeTab === 'import' && renderImport()}
        </div>
      </main>
    </div>
  );
}
