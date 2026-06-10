/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-undef */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  LayoutDashboard, 
  Calendar as CalendarIcon, 
  List, 
  Upload, 
  TrendingUp, 
  DollarSign, 
  Target,
  BarChart3,
  Activity,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  AlertCircle,
  X,
  Trash2,
  Plus,
  Cloud,
  CloudOff,
  CloudLightning
} from 'lucide-react';

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, onSnapshot, deleteDoc, writeBatch } from 'firebase/firestore';

const appId = typeof window !== 'undefined' && window.__app_id ? window.__app_id : 'trade-log-app';

let firebaseConfig = null;
if (typeof window !== 'undefined' && window.__firebase_config) {
  try {
    firebaseConfig = typeof window.__firebase_config === 'string' 
      ? JSON.parse(window.__firebase_config) 
      : window.__firebase_config;
  } catch (err) {
    console.error("Failed to parse window.__firebase_config safely:", err);
  }
}

let app, auth, db;
if (firebaseConfig && firebaseConfig.apiKey) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (err) {
    console.error("Firebase initialization failed: ", err);
  }
}

const generateUUID = () => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
};

const initialTrades = [
  { id: "1", dateOpen: "2026-06-01", dateClose: "2026-06-02", ticker: "MU", type: "Option", side: "Long", pnl: 57.75 },
  { id: "2", dateOpen: "2026-06-02", dateClose: "2026-06-02", ticker: "TSLA", type: "Option", side: "Short", pnl: -320.00 },
  { id: "3", dateOpen: "2026-06-03", dateClose: "2026-06-04", ticker: "MRVL", type: "Option", side: "Long", pnl: 104.68 },
  { id: "4", dateOpen: "2026-06-04", dateClose: "2026-06-04", ticker: "MSFT", type: "Option", side: "Long", pnl: 61.75 },
  { id: "5", dateOpen: "2026-06-03", dateClose: "2026-06-04", ticker: "HOOD", type: "Option", side: "Long", pnl: 44.75 }
];

const parseCSVLine = (text) => {
  if (!text || typeof text !== 'string') return [];
  const result = [];
  let startValueIdx = 0;
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') {
      inQuotes = !inQuotes;
    } else if (text[i] === ',' && !inQuotes) {
      result.push(text.substring(startValueIdx, i).replace(/^["']|["']$/g, '').trim());
      startValueIdx = i + 1;
    }
  }
  result.push(text.substring(startValueIdx).replace(/^["']|["']$/g, '').trim());
  return result;
};

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
  const [mappings, setMappings] = useState({
    dateOpen: '', dateClose: '', ticker: '', type: '', side: '', pnl: ''
  });
  const [isMappingMode, setIsMappingMode] = useState(false);

  const [calendarYear, setCalendarYear] = useState(2026);
  const [calendarMonth, setCalendarMonth] = useState(5); 

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTrade, setNewTrade] = useState({
    dateOpen: new Date().toISOString().split('T')[0],
    dateClose: new Date().toISOString().split('T')[0],
    ticker: '', type: 'Stock', side: 'Long', pnl: ''
  });

  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const [confirmModal, setConfirmModal] = useState(null);
  const triggerConfirm = (message, onConfirm) => {
    setConfirmModal({ message, onConfirm });
  };

  useEffect(() => {
    if (!auth) {
      showToast("Running in local session mode (offline database).", "info");
      return;
    }
    const initAuth = async () => {
      try {
        setIsSyncing(true);
        if (typeof window !== 'undefined' && window.__initial_auth_token) {
          await signInWithCustomToken(auth, window.__initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        setSyncError("Cloud Sync Disabled: Auth rejected mapping.");
        console.error(err);
      } finally {
        setIsSyncing(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, [showToast]);

  useEffect(() => {
    if (!db || !user) return;
    setIsSyncing(true);
    
    const tradesCol = collection(db, 'artifacts', appId, 'users', user.uid, 'trades');
    const unsubscribe = onSnapshot(tradesCol, (snapshot) => {
      const dbTrades = [];
      snapshot.forEach(doc => {
        dbTrades.push({ id: doc.id, ...doc.data() });
      });
      if (dbTrades.length > 0) {
        setTrades(dbTrades);
      }
      setIsSyncing(false);
    }, (err) => {
      setSyncError("Firestore access restricted. Session read offline.");
      setIsSyncing(false);
      console.error(err);
    });

    return () => unsubscribe();
  }, [user]);

  const handleAddTrade = async (tradeToSave) => {
    const formatted = {
      ...tradeToSave,
      pnl: parseFloat(tradeToSave.pnl) || 0,
      dateOpen: tradeToSave.dateOpen || tradeToSave.dateClose,
    };

    if (db && user) {
      setIsSyncing(true);
      try {
        const docId = generateUUID();
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'trades', docId);
        await setDoc(docRef, formatted);
        showToast("Trade successfully synchronized with cloud storage.");
      } catch (err) {
        showToast("Local fallback triggered. Saved to volatile engine memory.", "error");
        setTrades(prev => [...prev, { id: generateUUID(), ...formatted }]);
      } finally {
        setIsSyncing(false);
      }
    } else {
      setTrades(prev => [...prev, { id: generateUUID(), ...formatted }]);
      showToast("Trade saved locally.");
    }
  };

  const handleDeleteTrade = async (id) => {
    if (db && user) {
      setIsSyncing(true);
      try {
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'trades', id);
        await deleteDoc(docRef);
        showToast("Record removed from remote servers.");
      } catch (err) {
        showToast("Could not contact cloud network.", "error");
      } finally {
        setIsSyncing(false);
      }
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
        trades.forEach(t => {
          const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'trades', t.id);
          batch.delete(docRef);
        });
        await batch.commit();
        setTrades([]);
        showToast("Cloud records purged successfully.");
      } catch (err) {
        showToast("Failed to perform complete database purge.", "error");
      } finally {
        setIsSyncing(false);
      }
    } else {
      setTrades([]);
      showToast("Local memory workspace reset.");
    }
  };

  const loadSampleData = () => {
    setTrades(initialTrades);
    showToast("Demo logs successfully restored!");
  };

  const handleBulkImport = async (importedList) => {
    if (db && user) {
      setIsSyncing(true);
      try {
        const batch = writeBatch(db);
        importedList.forEach(t => {
          const docId = generateUUID();
          const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'trades', docId);
          batch.set(docRef, t);
        });
        await batch.commit();
        showToast(`Successfully processed and synced ${importedList.length} transactions.`);
      } catch (err) {
        showToast("Bulk network sync interrupted. Saved to local session state.", "error");
        setTrades(prev => [...prev, ...importedList.map(t => ({ ...t, id: generateUUID() }))]);
      } finally {
        setIsSyncing(false);
      }
    } else {
      setTrades(prev => [...prev, ...importedList.map(t => ({ ...t, id: generateUUID() }))]);
      showToast(`Imported ${importedList.length} trades locally.`);
    }
  };

  const processTastytradeFIFO = (lines) => {
    try {
      if (!lines || lines.length === 0) return null;
      const headers = parseCSVLine(lines[0]);
      
      const idxDate = headers.findIndex(h => h && h.toLowerCase() === 'date');
      const idxType = headers.findIndex(h => h && h.toLowerCase() === 'type');
      const idxAction = headers.findIndex(h => h && h.toLowerCase() === 'action');
      const idxSymbol = headers.findIndex(h => h && h.toLowerCase() === 'symbol');
      const idxUnderlying = headers.findIndex(h => h && h.toLowerCase() === 'underlying symbol');
      const idxInstrument = headers.findIndex(h => h && h.toLowerCase() === 'instrument type');
      const idxQuantity = headers.findIndex(h => h && h.toLowerCase() === 'quantity');
      const idxTotal = headers.findIndex(h => h && h.toLowerCase() === 'total');

      if (idxDate === -1 || idxAction === -1 || idxSymbol === -1 || idxTotal === -1) {
        return null;
      }

      const tradeRows = lines.slice(1).map(line => {
        const cells = parseCSVLine(line);
        if (cells.length <= Math.max(idxDate, idxAction, idxSymbol, idxTotal)) return null;
        
        const typeVal = cells[idxType] || '';
        const actionVal = cells[idxAction] || '';
        
        if (typeVal !== 'Trade' && typeVal !== 'Receive Deliver') return null;
        
        return {
          date: cells[idxDate],
          type: typeVal,
          action: actionVal,
          symbol: (cells[idxSymbol] || '').replace(/\s+/g, ' ').trim(),
          underlying: (cells[idxUnderlying] || cells[idxSymbol] || '').trim(),
          instrument: cells[idxInstrument] || 'Stock',
          quantity: Math.abs(parseInt(cells[idxQuantity], 10)) || 1,
          total: parseFloat((cells[idxTotal] || '').replace(/[^0-9.-]/g, '')) || 0
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

      const openPositions = {}; 
      const completedClosedTrades = [];

      tradeRows.forEach(row => {
        const symbol = row.symbol;
        const action = row.action;
        
        const isOpening = action.includes('_OPEN') || action === 'BUY' || action === 'SELL';
        const isClosing = action.includes('_CLOSE') || action === 'Expiration' || action === 'Assignment' || action === 'Exercise';

        if (!openPositions[symbol]) {
          openPositions[symbol] = [];
        }

        if (isOpening) {
          openPositions[symbol].push({
            qtyRemaining: row.quantity,
            totalCost: row.total,
            dateOpen: row.date.split('T')[0],
            side: action.includes('BUY') ? 'Long' : 'Short',
            ticker: row.underlying.toUpperCase(),
            instrument: row.instrument === 'Equity Option' ? 'Option' : row.instrument
          });
        } else if (isClosing) {
          let qtyToClose = row.quantity;
          const queue = openPositions[symbol];

          while (qtyToClose > 0 && queue && queue.length > 0) {
            const firstOpen = queue[0];
            const matchQty = Math.min(qtyToClose, firstOpen.qtyRemaining);

            const openCostProportional = (firstOpen.totalCost / firstOpen.qtyRemaining) * matchQty;
            const closeCreditProportional = (row.total / row.quantity) * matchQty;
            const pnl = openCostProportional + closeCreditProportional;

            completedClosedTrades.push({
              dateOpen: firstOpen.dateOpen,
              dateClose: row.date.split('T')[0],
              ticker: firstOpen.ticker,
              type: firstOpen.instrument,
              side: firstOpen.side,
              pnl: pnl
            });

            qtyToClose -= matchQty;
            firstOpen.qtyRemaining -= matchQty;

            if (firstOpen.qtyRemaining <= 0) {
              queue.shift();
            }
          }

          if (qtyToClose > 0) {
            completedClosedTrades.push({
              dateOpen: row.date.split('T')[0],
              dateClose: row.date.split('T')[0],
              ticker: row.underlying.toUpperCase() + " (Pre-Open)",
              type: row.instrument === 'Equity Option' ? 'Option' : row.instrument,
              side: action.includes('BUY') ? 'Short' : 'Long',
              pnl: (row.total / row.quantity) * qtyToClose
            });
          }
        }
      });

      return completedClosedTrades;
    } catch (err) {
      console.error("Tastytrade FIFO handling exception:", err);
      return null;
    }
  };

  const startCsvMapping = () => {
    if (!csvText || !csvText.trim()) {
      showToast("Please paste CSV text before executing engine actions.", "error");
      return;
    }

    const cleanPattern = new RegExp('\\[' + 'source' + ':\\s*\\d+\\]', 'gi');
    let cleanedInput = csvText.replace(cleanPattern, '');
    
    let rawLines = cleanedInput.split(/\r?\n/);
    let sanitizedLines = [];
    let activeRowBuffer = "";

    for (let line of rawLines) {
      line = line.trim();
      if (!line) continue;

      if (!activeRowBuffer) {
        activeRowBuffer = line;
      } else {
        if (/^\d{4}-\d{2}-\d{2}/.test(line) || /^date,/i.test(line)) {
          sanitizedLines.push(activeRowBuffer);
          activeRowBuffer = line;
        } else {
          activeRowBuffer += " " + line;
        }
      }
    }
    if (activeRowBuffer) sanitizedLines.push(activeRowBuffer);

    if (sanitizedLines.length < 2) {
      showToast("Parsed content array is empty. Verify spreadsheet row formatting.", "error");
      return;
    }

    const fifoMatchedTrades = processTastytradeFIFO(sanitizedLines);
    if (fifoMatchedTrades && fifoMatchedTrades.length > 0) {
      handleBulkImport(fifoMatchedTrades);
      setCsvText('');
      setIsMappingMode(false);
      return;
    }

    const headers = parseCSVLine(sanitizedLines[0]);
    const previewRows = sanitizedLines.slice(1, 4).map(line => parseCSVLine(line));

    setCsvPreviewHeaders(headers || []);
    setCsvPreviewRows(previewRows || []);

    const detected = { dateOpen: '', dateClose: '', ticker: '', type: '', side: '', pnl: '' };
    headers.forEach((h, index) => {
      if (!h) return;
      const lower = h.toLowerCase();
      if (lower.includes('open') && lower.includes('date')) detected.dateOpen = String(index);
      else if (lower.includes('close') && lower.includes('date')) detected.dateClose = String(index);
      else if (lower.includes('date') && !detected.dateClose) detected.dateClose = String(index);
      else if (lower.includes('ticker') || lower.includes('symbol')) detected.ticker = String(index);
      else if (lower.includes('type') || lower.includes('asset')) detected.type = String(index);
      else if (lower.includes('side') || lower.includes('action')) detected.side = String(index);
      else if (lower.includes('pnl') || lower.includes('p/l') || lower.includes('profit') || lower.includes('gain') || lower.includes('total')) detected.pnl = String(index);
    });

    setMappings(detected);
    setIsMappingMode(true);
  };

  const executeCsvImport = () => {
    if (!mappings.dateClose || !mappings.ticker || !mappings.pnl) {
      showToast("Required validation failure: Map Closed Date, Ticker, and Net P/L.", "error");
      return;
    }

    try {
      const cleanPattern = new RegExp('\\[' + 'source' + ':\\s*\\d+\\]', 'gi');
      let cleanedInput = csvText.replace(cleanPattern, '');
      
      let rawLines = cleanedInput.split(/\r?\n/);
      let sanitizedLines = [];
      let activeRowBuffer = "";

      for (let line of rawLines) {
        line = line.trim();
        if (!line) continue;
        if (!activeRowBuffer) { activeRowBuffer = line; } 
        else {
          if (/^\d{4}-\d{2}-\d{2}/.test(line) || /^date,/i.test(line)) {
            sanitizedLines.push(activeRowBuffer);
            activeRowBuffer = line;
          } else {
            activeRowBuffer += " " + line;
          }
        }
      }
      if (activeRowBuffer) sanitizedLines.push(activeRowBuffer);

      const rows = sanitizedLines.slice(1);
      const parsedTrades = [];

      rows.forEach(row => {
        const cells = parseCSVLine(row);
        if (cells.length < 2) return;

        const dateCloseVal = cells[parseInt(mappings.dateClose, 10)];
        const tickerVal = cells[parseInt(mappings.ticker, 10)];
        const pnlRaw = cells[parseInt(mappings.pnl, 10)];

        if (!dateCloseVal || !tickerVal || pnlRaw === undefined) return;

        const dateOpenVal = mappings.dateOpen ? cells[parseInt(mappings.dateOpen, 10)] : dateCloseVal;
        const typeVal = mappings.type ? cells[parseInt(mappings.type, 10)] : 'Stock';
        const sideVal = mappings.side ? cells[parseInt(mappings.side, 10)] : 'Long';
        const cleanedPnl = parseFloat(pnlRaw.replace(/[^0-9.-]/g, '')) || 0;

        parsedTrades.push({
          dateOpen: dateOpenVal || dateCloseVal,
          dateClose: dateCloseVal.split('T')[0],
          ticker: tickerVal.split(' ')[0].toUpperCase(),
          type: typeVal || 'Stock',
          side: sideVal || 'Long',
          pnl: cleanedPnl
        });
      });

      if (parsedTrades.length > 0) {
        handleBulkImport(parsedTrades);
        setIsMappingMode(false);
        setCsvText('');
      } else {
        showToast("Alignment error. Zero records matched column requirements.", "error");
      }
    } catch (err) {
      showToast("CSV engine internal stream structural anomaly.", "error");
    }
  };

  const processedTrades = useMemo(() => {
    return (trades || []).filter(t => {
      if (selectedTicker !== 'All' && t.ticker !== selectedTicker) return false;
      if (selectedType !== 'All' && t.type !== selectedType) return false;

      const closeDate = new Date(t.dateClose);
      const today = new Date();
      today.setHours(0,0,0,0);

      switch (dateFilter) {
        case 'today': {
          const tDate = new Date(t.dateClose + 'T00:00:00');
          const check = new Date();
          return tDate.getDate() === check.getDate() && 
                 tDate.getMonth() === check.getMonth() && 
                 tDate.getFullYear() === check.getFullYear();
        }
        case 'week': {
          const startOfWeek = new Date(today);
          startOfWeek.setDate(today.getDate() - today.getDay());
          return closeDate >= startOfWeek;
        }
        case 'month': {
          return closeDate.getMonth() === today.getMonth() && closeDate.getFullYear() === today.getFullYear();
        }
        case 'year': {
          return closeDate.getFullYear() === today.getFullYear();
        }
        case 'custom': {
          if (startDate) {
            const startLimit = new Date(startDate + 'T00:00:00');
            if (closeDate < startLimit) return false;
          }
          if (endDate) {
            const endLimit = new Date(endDate + 'T23:59:59');
            if (closeDate > endLimit) return false;
          }
          return true;
        }
        case 'all':
        default:
          return true;
      }
    });
  }, [trades, dateFilter, startDate, endDate, selectedTicker, selectedType]);

  const tickerOptions = useMemo(() => {
    const list = new Set((trades || []).map(t => t.ticker));
    return ['All', ...Array.from(list).sort()];
  }, [trades]);

  const typeOptions = useMemo(() => {
    const list = new Set((trades || []).map(t => t.type));
    return ['All', ...Array.from(list).sort()];
  }, [trades]);

  const metrics = useMemo(() => {
    if (!processedTrades || processedTrades.length === 0) {
      return { totalPnl: 0, winRate: 0, profitFactor: 0, totalTrades: 0, wins: 0, losses: 0, avgWin: 0, avgLoss: 0 };
    }

    let grossProfit = 0; let grossLoss = 0; let wins = 0; let losses = 0;

    processedTrades.forEach(t => {
      const pnl = parseFloat(t.pnl) || 0;
      if (pnl > 0) { grossProfit += pnl; wins++; } 
      else if (pnl < 0) { grossLoss += Math.abs(pnl); losses++; }
    });

    const totalPnl = grossProfit - grossLoss;
    const winRate = ((wins / processedTrades.length) * 100).toFixed(1);
    const profitFactor = grossLoss === 0 ? grossProfit : (grossProfit / grossLoss).toFixed(2);
    const avgWin = wins > 0 ? (grossProfit / wins).toFixed(2) : 0;
    const avgLoss = losses > 0 ? (grossLoss / losses).toFixed(2) : 0;

    return { totalPnl, winRate, profitFactor, totalTrades: processedTrades.length, wins, losses, avgWin, avgLoss };
  }, [processedTrades]);

  const tickerStats = useMemo(() => {
    const data = {};
    (processedTrades || []).forEach(t => {
      if (!data[t.ticker]) data[t.ticker] = { pnl: 0, count: 0, wins: 0 };
      data[t.ticker].pnl += parseFloat(t.pnl) || 0;
      data[t.ticker].count += 1;
      if (parseFloat(t.pnl) > 0) data[t.ticker].wins += 1;
    });
    return Object.entries(data)
      .map(([ticker, stats]) => ({
        ticker, pnl: stats.pnl, trades: stats.count,
        winRate: ((stats.wins / stats.count) * 100).toFixed(0)
      }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [processedTrades]);

  const equityCurvePoints = useMemo(() => {
    const sorted = [...(processedTrades || [])].sort((a, b) => new Date(a.dateClose) - new Date(b.dateClose));
    let runningSum = 0;
    return sorted.map((t, idx) => {
      runningSum += parseFloat(t.pnl);
      return { label: t.dateClose, pnl: runningSum, tradeIndex: idx + 1 };
    });
  }, [processedTrades]);

  const renderDashboard = () => {
    const buildEquityCurve = () => {
      if (!equityCurvePoints || equityCurvePoints.length < 2) {
        return (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <Activity className="h-10 w-10 mb-2 text-slate-300" />
            <p className="text-sm font-medium">Insufficient trade data to render trend analytics</p>
            <p className="text-xs text-slate-400">Add or import 2 or more close executions to view performance trajectory</p>
          </div>
        );
      }

      const pnlValues = equityCurvePoints.map(p => p.pnl);
      const minPnl = Math.min(0, ...pnlValues);
      const maxPnl = Math.max(10, ...pnlValues);
      const pnlRange = maxPnl - minPnl;

      const width = 600; const height = 240; const padding = 30;
      const getX = (index) => padding + (index / (equityCurvePoints.length - 1)) * (width - 2 * padding);
      const getY = (val) => height - padding - ((val - minPnl) / pnlRange) * (height - 2 * padding);

      let linePath = `M ${getX(0)} ${getY(equityCurvePoints[0].pnl)}`;
      for (let i = 1; i < equityCurvePoints.length; i++) {
        linePath += ` L ${getX(i)} ${getY(equityCurvePoints[i].pnl)}`;
      }
      const zeroY = getY(0);

      return (
        <div className="w-full">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
            <line x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} stroke="#cbd5e1" strokeDasharray="3" strokeWidth="1.5" />
            <path d={`${linePath} L ${getX(equityCurvePoints.length - 1)} ${height - padding} L ${getX(0)} ${height - padding} Z`} fill="url(#equityGradient)" opacity="0.12" />
            <path d={linePath} fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {equityCurvePoints.map((point, idx) => (
              <circle key={idx} cx={getX(idx)} cy={getY(point.pnl)} r="3.5" fill="#ffffff" stroke={point.pnl >= 0 ? '#10b981' : '#f43f5e'} strokeWidth="2" className="cursor-pointer transition hover:scale-150" />
            ))}
            <defs>
              <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0ea5e9" /><stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
            </defs>
          </svg>
          <div className="flex justify-between px-6 py-2 text-[10px] text-slate-400 font-semibold border-t border-slate-100">
            <span>START</span><span>CUMULATIVE PERFORMANCE STATUS</span><span>END</span>
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className={`p-3 rounded-full ${metrics.totalPnl >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Net P/L</p>
              <h3 className={`text-2xl font-bold ${metrics.totalPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                ${metrics.totalPnl.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 rounded-full bg-blue-100 text-blue-600">
              <Target className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Win Rate</p>
              <h3 className="text-2xl font-bold text-slate-800">{metrics.winRate}%</h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 rounded-full bg-purple-100 text-purple-600">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Profit Factor</p>
              <h3 className="text-2xl font-bold text-slate-800">{metrics.profitFactor}</h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 rounded-full bg-orange-100 text-orange-600">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Average Win / Loss</p>
              <h3 className="text-lg font-bold text-slate-800">
                <span className="text-emerald-600">${parseFloat(metrics.avgWin).toFixed(0)}</span>
                <span className="text-slate-300 mx-1">/</span>
                <span className="text-rose-600">-${parseFloat(metrics.avgLoss).toFixed(0)}</span>
              </h3>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white lg:col-span-2 rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider flex items-center">
                <Activity className="mr-2 h-4 w-4 text-sky-500" /> Equity Curve Tracking
              </h2>
            </div>
            <div className="p-6">{buildEquityCurve()}</div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between">
            <div className="p-5 border-b border-slate-100 bg-slate-50">
              <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider flex items-center">
                <Target className="mr-2 h-4 w-4 text-indigo-500" /> Performance Ratios
              </h2>
            </div>
            <div className="p-6 space-y-4 flex-1 flex flex-col justify-center">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-sm">Winning Trades</span>
                <span className="font-semibold text-emerald-600 text-sm">{metrics.wins} trades</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full" style={{ width: `${metrics.winRate}%` }}></div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-sm">Losing Trades</span>
                <span className="font-semibold text-rose-600 text-sm">{metrics.losses} trades</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-rose-500 h-full" style={{ width: `${100 - metrics.winRate}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50">
            <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider flex items-center">
              <BarChart3 className="mr-2 h-
