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

// Firebase SDK imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, onSnapshot, deleteDoc, writeBatch } from 'firebase/firestore';

// --- Safe Global Environment Resolution for Vercel Builds ---
const appId = typeof window !== 'undefined' && window.__app_id ? window.__app_id : 'trade-log-app';
const firebaseConfig = typeof window !== 'undefined' && window.__firebase_config ? JSON.parse(window.__firebase_config) : null;

let app, auth, db;
if (firebaseConfig) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (err) {
    console.error("Firebase init failed: ", err);
  }
}

// --- Environment-Aware Safe UUID Generator ---
const generateUUID = () => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  // Fallback safe alphanumeric generator for headless build-time environments
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
};

// --- Hardcoded Initial/Fallback Dataset ---
const initialTrades = [
  { id: "1", dateOpen: "2026-06-01", dateClose: "2026-06-02", ticker: "MU", type: "Option", side: "Long", pnl: 57.75 },
  { id: "2", dateOpen: "2026-06-02", dateClose: "2026-06-02", ticker: "TSLA", type: "Option", side: "Short", pnl: -320.00 },
  { id: "3", dateOpen: "2026-06-03", dateClose: "2026-06-04", ticker: "MRVL", type: "Option", side: "Long", pnl: 104.68 },
  { id: "4", dateOpen: "2026-06-04", dateClose: "2026-06-04", ticker: "MSFT", type: "Option", side: "Long", pnl: 61.75 },
  { id: "5", dateOpen: "2026-06-03", dateClose: "2026-06-04", ticker: "HOOD", type: "Option", side: "Long", pnl: 44.75 }
];

// Helper to cleanly parse CSV lines while respecting quotes with commas
const parseCSVLine = (text) => {
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
  
  // --- Firebase Auth & Sync State ---
  const [user, setUser] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);

  // --- Filter States ---
  const [dateFilter, setDateFilter] = useState('all'); 
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedTicker, setSelectedTicker] = useState('All');
  const [selectedType, setSelectedType] = useState('All');

  // --- CSV Import Mapping UI States ---
  const [csvText, setCsvText] = useState('');
  const [csvPreviewHeaders, setCsvPreviewHeaders] = useState([]);
  const [csvPreviewRows, setCsvPreviewRows] = useState([]);
  const [mappings, setMappings] = useState({
    dateOpen: '',
    dateClose: '',
    ticker: '',
    type: '',
    side: '',
    pnl: ''
  });
  const [isMappingMode, setIsMappingMode] = useState(false);

  // --- Calendar Navigation State ---
  const [calendarYear, setCalendarYear] = useState(2026);
  const [calendarMonth, setCalendarMonth] = useState(5); 

  // --- Manual Trade Modal State ---
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTrade, setNewTrade] = useState({
    dateOpen: new Date().toISOString().split('T')[0],
    dateClose: new Date().toISOString().split('T')[0],
    ticker: '',
    type: 'Stock',
    side: 'Long',
    pnl: ''
  });

  // --- Notification Message Toast State (Memoized to prevent hook churn) ---
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // --- Custom Confirm Modal State ---
  const [confirmModal, setConfirmModal] = useState(null);
  const triggerConfirm = (message, onConfirm) => {
    setConfirmModal({ message, onConfirm });
  };

  // --- Auth Integration & Setup ---
  useEffect(() => {
    if (!auth) {
      showToast("Running in local session mode (database connection unconfigured).", "info");
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
        setSyncError("Authentication failed: Cloud Sync is disabled.");
        console.error(err);
      } finally {
        setIsSyncing(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, [showToast]);

  // --- Synchronize with Firestore Database ---
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
      setSyncError("Failed to fetch cloud records. Saving offline.");
      setIsSyncing(false);
      console.error(err);
    });

    return () => unsubscribe();
  }, [user]);

  // --- Save Operations ---
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
        showToast("Trade saved to secure cloud account.");
      } catch (err) {
        showToast("Could not save to cloud. Saved in local memory instead.", "error");
        setTrades(prev => [...prev, { id: generateUUID(), ...formatted }]);
      } finally {
        setIsSyncing(false);
      }
    } else {
      setTrades(prev => [...prev, { id: generateUUID(), ...formatted }]);
      showToast("Trade saved to current session.");
    }
  };

  const handleDeleteTrade = async (id) => {
    if (db && user) {
      setIsSyncing(true);
      try {
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'trades', id);
        await deleteDoc(docRef);
        showToast("Trade deleted from cloud.");
      } catch (err) {
        showToast("Failed to delete from cloud database.", "error");
      } finally {
        setIsSyncing(false);
      }
    } else {
      setTrades(prev => prev.filter(t => t.id !== id));
      showToast("Trade removed.");
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
        showToast("All trades purged from secure cloud.");
      } catch (err) {
        showToast("Failed to purge cloud entries.", "error");
      } finally {
        setIsSyncing(false);
      }
    } else {
      setTrades([]);
      showToast("All trades cleared from local session.");
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
        showToast(`Successfully imported ${importedList.length} matched trades.`);
      } catch (err) {
        showToast("Cloud sync failed. Importing to local session.", "error");
        setTrades(prev => [...prev, ...importedList.map(t => ({ ...t, id: generateUUID() }))]);
      } finally {
        setIsSyncing(false);
      }
    } else {
      setTrades(prev => [...prev, ...importedList.map(t => ({ ...t, id: generateUUID() }))]);
      showToast(`Imported ${importedList.length} matched trades.`);
    }
  };

  // --- Tastytrade FIFO Processing Engine ---
  const processTastytradeFIFO = (lines) => {
    try {
      const headers = parseCSVLine(lines[0]);
      
      const idxDate = headers.findIndex(h => h.toLowerCase() === 'date');
      const idxType = headers.findIndex(h => h.toLowerCase() === 'type');
      const idxAction = headers.findIndex(h => h.toLowerCase() === 'action');
      const idxSymbol = headers.findIndex(h => h.toLowerCase() === 'symbol');
      const idxUnderlying = headers.findIndex(h => h.toLowerCase() === 'underlying symbol');
      const idxInstrument = headers.findIndex(h => h.toLowerCase() === 'instrument type');
      const idxQuantity = headers.findIndex(h => h.toLowerCase() === 'quantity');
      const idxTotal = headers.findIndex(h => h.toLowerCase() === 'total');

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

  // --- CSV Parser & Text Sanitizer ---
  const startCsvMapping = () => {
    if (!csvText || !csvText.trim()) {
      showToast("Please paste CSV data first.", "error");
      return;
    }

    let cleanedInput = csvText.replace(/\/gi, '');
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
      showToast("Malformed content layout. Verify raw data health.", "error");
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
      showToast("Map at least Ticker, Date Closed, and Net P/L columns.", "error");
      return;
    }

    try {
      let cleanedInput = csvText.replace(/\/gi, '');
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
        showToast("No valid data parsed. Review mapping alignment fields.", "error");
      }
    } catch (err) {
      showToast("Manual processing parser fault structural anomaly.", "error");
    }
  };

  // --- Dynamic Filters Processing ---
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

  // --- Statistics Calculations ---
  const metrics = useMemo(() => {
    if (!processedTrades || processedTrades.length === 0) {
      return { totalPnl: 0, winRate: 0, profitFactor: 0, totalTrades: 0, wins: 0, losses: 0, avgWin: 0, avgLoss: 0 };
    }

    let grossProfit = 0;
    let grossLoss = 0;
    let wins = 0;
    let losses = 0;

    processedTrades.forEach(t => {
      const pnl = parseFloat(t.pnl) || 0;
      if (pnl > 0) {
        grossProfit += pnl;
        wins++;
      } else if (pnl < 0) {
        grossLoss += Math.abs(pnl);
        losses++;
      }
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
        ticker,
        pnl: stats.pnl,
        trades: stats.count,
        winRate: ((stats.wins / stats.count) * 100).toFixed(0)
      }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [processedTrades]);

  const equityCurvePoints = useMemo(() => {
    const sorted = [...(processedTrades || [])].sort((a, b) => new Date(a.dateClose) - new Date(b.dateClose));
    let runningSum = 0;
    return sorted.map((t, idx) => {
      runningSum += parseFloat(t.pnl);
      return {
        label: t.dateClose,
        pnl: runningSum,
        tradeIndex: idx + 1
      };
    });
  }, [processedTrades]);

  // --- Views Layout Modules ---
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

      const width = 600;
      const height = 240;
      const padding = 30;

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
            <path
              d={`${linePath} L ${getX(equityCurvePoints.length - 1)} ${height - padding} L ${getX(0)} ${height - padding} Z`}
              fill="url(#equityGradient)"
              opacity="0.12"
            />
            <path
              d={linePath}
              fill="none"
              stroke="#0ea5e9"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {equityCurvePoints.map((point, idx) => (
              <circle
                key={idx}
                cx={getX(idx)}
                cy={getY(point.pnl)}
                r="3.5"
                fill="#ffffff"
                stroke={point.pnl >= 0 ? '#10b981' : '#f43f5e'}
                strokeWidth="2"
                className="cursor-pointer transition hover:scale-150"
              />
            ))}
            <defs>
              <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0ea5e9" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
            </defs>
          </svg>
          <div className="flex justify-between px-6 py-2 text-[10px] text-slate-400 font-semibold border-t border-slate-100">
            <span>START</span>
            <span>CUMULATIVE PERFORMANCE (CURVE PROGRESSION)</span>
            <span>END</span>
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
            <div className="p-6">
              {buildEquityCurve()}
            </div>
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
              <BarChart3 className="mr-2 h-4 w-4 text-emerald-500" /> Performance Breakdown by Ticker
            </h2>
          </div>
          <div className="p-0 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="p-4 font-semibold">Ticker</th>
                  <th className="p-4 font-semibold">Number of Trades</th>
                  <th className="p-4 font-semibold">Average Win Rate</th>
                  <th className="p-4 font-semibold text-right">Aggregate P/L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tickerStats.length === 0 ? (
                  <tr><td colSpan="4" className="p-4 text-center text-slate-500">No records found within current filter choices</td></tr>
                ) : tickerStats.map((t) => (
                  <tr key={t.ticker} className="hover:bg-slate-50 transition">
                    <td className="p-4 font-bold text-slate-800">{t.ticker}</td>
                    <td className="p-4 text-slate-600 font-medium">{t.trades} executions</td>
                    <td className="p-4 text-slate-600 font-semibold">{t.winRate}%</td>
                    <td className={`p-4 text-right font-semibold ${t.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      ${t.pnl.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </td>
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
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const monthlyPnl = {};
    (trades || []).forEach(t => {
      const parts = t.dateClose.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      
      if (y === calendarYear && m === calendarMonth) {
        monthlyPnl[d] = (monthlyPnl[d] || 0) + parseFloat(t.pnl);
      }
    });

    const changeMonth = (direction) => {
      if (direction === 'prev') {
        if (calendarMonth === 0) {
          setCalendarMonth(11);
          setCalendarYear(prev => prev - 1);
        } else {
          setCalendarMonth(prev => prev - 1);
        }
      } else {
        if (calendarMonth === 11) {
          setCalendarMonth(0);
          setCalendarYear(prev => prev + 1);
        } else {
          setCalendarMonth(prev => prev + 1);
        }
      }
    };

    const calendarCells = [];
    for (let i = 0; i < firstDay; i++) {
      calendarCells.push(<div key={`empty-${i}`} className="p-4 bg-slate-50/40 border border-slate-100 min-h-[90px]"></div>);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      const pnl = monthlyPnl[i];
      let bgClass = "bg-white hover:bg-slate-50/50";
      let textClass = "text-slate-400";
      
      if (pnl > 0) { bgClass = "bg-emerald-50 border-emerald-100 hover:bg-emerald-100/50"; textClass = "text-emerald-700 font-semibold"; }
      else if (pnl < 0) { bgClass = "bg-rose-50 border-rose-100 hover:bg-rose-100/50"; textClass = "text-rose-700 font-semibold"; }

      calendarCells.push(
        <div key={`day-${i}`} className={`p-3 border border-slate-100 flex flex-col justify-between min-h-[95px] transition ${bgClass}`}>
          <span className="text-xs font-bold text-slate-500">{i}</span>
          {pnl !== undefined && (
            <span className={`text-right text-xs ${textClass}`}>
              {pnl > 0 ? '+' : ''}${pnl.toFixed(2)}
            </span>
          )}
        </div>
      );
    }

    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center">
            <CalendarIcon className="mr-2 h-5 w-5 text-indigo-500" /> {monthNames[calendarMonth]} {calendarYear}
          </h2>
          <div className="flex items-center space-x-2">
            <button onClick={() => changeMonth('prev')} className="p-2 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-600 transition">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => {
              const now = new Date();
              setCalendarYear(now.getFullYear());
              setCalendarMonth(now.getMonth());
            }} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 transition">
              Today
            </button>
            <button onClick={() => changeMonth('next')} className="p-2 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-600 transition">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 text-center border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold text-slate-400 py-3 uppercase tracking-wider">
          <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
        </div>
        <div className="grid grid-cols-7">
          {calendarCells}
        </div>
      </div>
    );
  };

  const renderLog = () => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider flex items-center">
          <List className="mr-2 h-4 w-4 text-emerald-500" /> Executed Transactions Log
        </h2>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center transition"
        >
          <Plus size={14} className="mr-1.5" /> Add Trade Record
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse whitespace-nowrap">
          <thead>
            <tr className="bg-white border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
              <th className="p-4 font-semibold">Open Date</th>
              <th className="p-4 font-semibold">Close Date</th>
              <th className="p-4 font-semibold">Ticker</th>
              <th className="p-4 font-semibold">Type</th>
              <th className="p-4 font-semibold">Side</th>
              <th className="p-4 font-semibold text-right">Net Profit / Loss</th>
              <th className="p-4 font-semibold text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {processedTrades.length === 0 ? (
              <tr><td colSpan="7" className="p-8 text-center text-slate-500 font-medium">No recorded trades match active filter structures.</td></tr>
            ) : processedTrades.sort((a,b) => new Date(b.dateClose) - new Date(a.dateOpen)).map((t, i) => (
              <tr key={t.id || i} className="hover:bg-slate-50 transition text-sm">
                <td className="p-4 text-slate-600">{t.dateOpen}</td>
                <td className="p-4 text-slate-800 font-medium">{t.dateClose}</td>
                <td className="p-4 font-bold text-slate-900">{t.ticker}</td>
                <td className="p-4">
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px] font-semibold">{t.type}</span>
                </td>
                <td className="p-4">
                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${t.side.toLowerCase() === 'long' ? 'bg-sky-50 text-sky-700' : 'bg-purple-50 text-purple-700'}`}>
                    {t.side}
                  </span>
                </td>
                <td className={`p-4 text-right font-semibold ${t.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {t.pnl >= 0 ? '+' : ''}${parseFloat(t.pnl).toFixed(2)}
                </td>
                <td className="p-4 text-center">
                  <button
                    onClick={() => triggerConfirm(`Are you sure you want to delete trade on ${t.ticker}?`, () => handleDeleteTrade(t.id))}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
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
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider flex items-center mb-1">
              <Upload className="mr-2 h-4 w-4 text-indigo-500" /> Interactive Brokerage Import
            </h2>
            <p className="text-xs text-slate-500">Paste raw CSV files from your brokerage. The engine auto-detects Tastytrade configuration files and calculates closed trade profits via matching engine parameters.</p>
          </div>
          
          <div className="space-y-3">
            <textarea 
              className="w-full h-44 p-4 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs font-mono bg-slate-50/50"
              placeholder={`Paste transaction history layout lines context straight here...`}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            ></textarea>
            
            <div className="flex flex-wrap gap-2 pt-2">
              <button 
                onClick={startCsvMapping}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
              >
                Process File & Track Trades
              </button>
              
              <button 
                onClick={loadSampleData}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
              >
                Restore Demo Logs
              </button>
              
              <div className="flex-grow"></div>
              
              <button 
                onClick={() => triggerConfirm("Are you sure you want to purge all active records?", handleClearAll)}
                className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-semibold transition flex items-center"
              >
                <Trash2 size={13} className="mr-1.5" /> Purge Trade Database
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-base font-bold text-slate-800 flex items-center">
              <Upload className="mr-2 h-5 w-5 text-indigo-500" /> Manual Fallback Column Mapping
            </h2>
            <button onClick={() => setIsMappingMode(false)} className="p-1 text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Date Closed (Required)</label>
              <select 
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
                value={mappings.dateClose || ''}
                onChange={(e) => setMappings({ ...mappings, dateClose: e.target.value })}
              >
                <option value="">-- Choose Column --</option>
                {(csvPreviewHeaders || []).map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Ticker / Symbol (Required)</label>
              <select 
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
                value={mappings.ticker || ''}
                onChange={(e) => setMappings({ ...mappings, ticker: e.target.value })}
              >
                <option value="">-- Choose Column --</option>
                {(csvPreviewHeaders || []).map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Profit / Loss (Required)</label>
              <select 
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
                value={mappings.pnl || ''}
                onChange={(e) => setMappings({ ...mappings, pnl: e.target.value })}
              >
                <option value="">-- Choose Column --</option>
                {(csvPreviewHeaders || []).map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Date Opened (Optional)</label>
              <select 
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
                value={mappings.dateOpen || ''}
                onChange={(e) => setMappings({ ...mappings, dateOpen: e.target.value })}
              >
                <option value="">Same as Date Closed</option>
                {(csvPreviewHeaders || []).map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Asset Type (Optional)</label>
              <select 
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
                value={mappings.type || ''}
                onChange={(e) => setMappings({ ...mappings, type: e.target.value })}
              >
                <option value="">Default: Stock</option>
                {(csvPreviewHeaders || []).map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Side (Optional)</label>
              <select 
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
                value={mappings.side || ''}
                onChange={(e) => setMappings({ ...mappings, side: e.target.value })}
              >
                <option value="">Default: Long</option>
                {(csvPreviewHeaders || []).map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
            <button onClick={() => setIsMappingMode(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold">
              Cancel
            </button>
            <button onClick={executeCsvImport} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold shadow-sm">
              Confirm Import
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-900 antialiased">
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-lg border border-slate-800 flex items-center space-x-3">
          {toast.type === 'error' ? <AlertCircle className="text-rose-500 h-5 w-5" /> : <CheckCircle2 className="text-emerald-500 h-5 w-5" />}
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}

      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-800">Confirm Action</h3>
            <p className="text-xs text-slate-500">{confirmModal.message}</p>
            <div className="flex justify-end space-x-2 pt-2">
              <button onClick={() => setConfirmModal(null)} className="px-3.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold">
                Dismiss
              </button>
              <button onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }} className="px-3.5 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {isAddModalOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Log Manual Executed Trade</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Ticker</label>
                <input 
                  type="text" 
                  placeholder="e.g. NVDA" 
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-lg font-bold"
                  value={newTrade.ticker}
                  onChange={(e) => setNewTrade({ ...newTrade, ticker: e.target.value.toUpperCase() })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Net P/L ($)</label>
                <input 
                  type="number" 
                  placeholder="e.g. 150.00" 
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
                  value={newTrade.pnl}
                  onChange={(e) => setNewTrade({ ...newTrade, pnl: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Asset Type</label>
                <select 
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
                  value={newTrade.type}
                  onChange={(e) => setNewTrade({ ...newTrade, type: e.target.value })}
                >
                  <option value="Stock">Stock</option>
                  <option value="Option">Option</option>
                  <option value="Future">Future</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Side</label>
                <select 
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
                  value={newTrade.side}
                  onChange={(e) => setNewTrade({ ...newTrade, side: e.target.value })}
                >
                  <option value="Long">Long</option>
                  <option value="Short">Short</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Opened Date</label>
                <input type="date" className="w-full text-xs p-2.5 border border-slate-200 rounded-lg" value={newTrade.dateOpen} onChange={(e) => setNewTrade({ ...newTrade, dateOpen: e.target.value })} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Closed Date</label>
                <input type="date" className="w-full text-xs p-2.5 border border-slate-200 rounded-lg font-bold" value={newTrade.dateClose} onChange={(e) => setNewTrade({ ...newTrade, dateClose: e.target.value })} />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
              <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold">
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (!newTrade.ticker || !newTrade.pnl) {
                    showToast("Ticker and Net P/L are required.", "error");
                    return;
                  }
                  handleAddTrade(newTrade);
                  setIsAddModalOpen(false);
                  setNewTrade({ dateOpen: new Date().toISOString().split('T')[0], dateClose: new Date().toISOString().split('T')[0], ticker: '', type: 'Stock', side: 'Long', pnl: '' });
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold"
              >
                Save Trade Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Layout */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-300 flex-shrink-0 flex flex-col justify-between">
        <div className="p-6">
          <h1 className="text-xl font-extrabold text-white flex items-center">
            <TrendingUp className="mr-2 text-emerald-400 h-6 w-6" /> TradeJournal
          </h1>
          
          <nav className="space-y-1.5 mt-8">
            <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center px-3 py-2.5 rounded-xl text-xs font-semibold ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800/60'}`}>
              <LayoutDashboard className="h-5 w-5 mr-3" /> Portfolio Dashboard
            </button>
            <button onClick={() => setActiveTab('calendar')} className={`w-full flex items-center px-3 py-2.5 rounded-xl text-xs font-semibold ${activeTab === 'calendar' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800/60'}`}>
              <CalendarIcon className="h-5 w-5 mr-3" /> P/L Calendar
            </button>
            <button onClick={() => setActiveTab('log')} className={`w-full flex items-center px-3 py-2.5 rounded-xl text-xs font-semibold ${activeTab === 'log' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800/60'}`}>
              <List className="h-5 w-5 mr-3" /> Executed Trade Log
            </button>
            <button onClick={() => setActiveTab('import')} className={`w-full flex items-center px-3 py-2.5 rounded-xl text-xs font-semibold ${activeTab === 'import' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800/60'}`}>
              <Upload className="h-5 w-5 mr-3" /> CSV File Importer
            </button>
          </nav>
        </div>

        <div className="p-4 bg-slate-950 border-t border-slate-800 m-4 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold">
            <span>Database Status</span>
            {isSyncing ? (
              <span className="text-yellow-500 flex items-center"><CloudLightning size={12} className="mr-1 animate-pulse" /> Syncing</span>
            ) : db && user ? (
              <span className="text-emerald-500 flex items-center"><Cloud size={12} className="mr-1" /> Active Cloud</span>
            ) : (
              <span className="text-slate-400 flex items-center"><CloudOff size={12} className="mr-1" /> Local Session</span>
            )}
          </div>
          {syncError && <p className="text-[10px] text-rose-400 leading-tight">{syncError}</p>}
        </div>
      </aside>

      {/* Main Body View Layout */}
      <main className="flex-1 p-6 lg:p-8 overflow-y-auto max-h-screen">
        <header className="mb-6 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row justify-between lg:items-center gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-800 flex items-center">
              <Filter className="mr-2 h-4 w-4 text-indigo-500" /> Active Filters
            </h2>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Time Range</span>
              <select className="text-xs p-2 border border-slate-200 rounded-lg bg-slate-50" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {dateFilter === 'custom' && (
              <>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Start Date</span>
                  <input type="date" className="text-xs p-2 border border-slate-200 rounded-lg bg-slate-50" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">End Date</span>
                  <input type="date" className="text-xs p-2 border border-slate-200 rounded-lg bg-slate-50" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </>
            )}

            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Ticker</span>
              <select className="text-xs p-2 border border-slate-200 rounded-lg bg-slate-50" value={selectedTicker} onChange={(e) => setSelectedTicker(e.target.value)}>
                {tickerOptions.map(tick => <option key={tick} value={tick}>{tick}</option>)}
              </select>
            </div>

            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Asset Class</span>
              <select className="text-xs p-2 border border-slate-200 rounded-lg bg-slate-50" value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </header>

        <div className="max-w-6xl mx-auto">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'calendar' && renderCalendar()}
          {activeTab === 'log' && renderLog()}
          {activeTab === 'import' && renderImport()}
        </div>
      </main>
    </div>
  );
}
