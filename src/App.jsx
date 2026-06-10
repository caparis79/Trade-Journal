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

// NEW ROBUST PARSER: Handles complex quotes, escaped fields, and standard commas safely
const parseCSVLine = (text) => {
  if (!text || typeof text !== 'string') return [];
  const cleanLine = text.trim();
  if (!cleanLine) return [];
  
  const matches = [];
  // This regex matches either content inside double quotes or content between commas
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
      regex.lastIndex++; // Prevent infinite loops
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
            completed.push({ dateOpen: row.date.split('T')[0], dateClose: row.date.split('T')[0], ticker: row.underlying.toUpperCase() + " (Pre-Open)", type: row.instrument === 'Equity Option' ? 'Option' : row.instrument, side: act.includes('BUY') ? 'Short' : 'Long', pnl:
