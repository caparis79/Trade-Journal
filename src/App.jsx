import React, { useState, useMemo, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Calendar as CalendarIcon, 
  List, 
  Upload, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Target,
  BarChart3,
  FileText,
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
  CloudLightning,
  HelpCircle
} from 'lucide-react';

// Firebase SDK imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, onSnapshot, deleteDoc, writeBatch } from 'firebase/firestore';

// --- Firebase Configuration & Initialization ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'trade-log-app';
const firebaseConfig = {
  apiKey: "AIzaSyDcPRcWFZ6NCsH_OtZrPnhRP6MhqhaQt68",
  authDomain: "trade-journal-f2aed.firebaseapp.com",
  projectId: "trade-journal-f2aed",
  storageBucket: "trade-journal-f2aed.firebasestorage.app",
  messagingSenderId: "319958856265",
  appId: "1:319958856265:web:17e640c8d45bb3e217c598",
  measurementId: "G-3Y064SQ29G"
};

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

// --- Hardcoded Initial/Fallback Dataset ---
const initialTrades = [
  { id: "1", dateOpen: "2026-06-01", dateClose: "2026-06-02", ticker: "AAPL", type: "Stock", side: "Long", pnl: 250.50 },
  { id: "2", dateOpen: "2026-06-02", dateClose: "2026-06-02", ticker: "TSLA", type: "Option", side: "Short", pnl: -320.00 },
  { id: "3", dateOpen: "2026-06-03", dateClose: "2026-06-04", ticker: "NVDA", type: "Stock", side: "Long", pnl: 850.00 },
  { id: "4", dateOpen: "2026-06-04", dateClose: "2026-06-05", ticker: "SPY", type: "Option", side: "Long", pnl: 450.00 },
  { id: "5", dateOpen: "2026-06-05", dateClose: "2026-06-05", ticker: "AAPL", type: "Stock", side: "Long", pnl: -110.00 },
  { id: "6", dateOpen: "2026-06-08", dateClose: "2026-06-09", ticker: "ES_F", type: "Future", side: "Short", pnl: 600.00 },
  { id: "7", dateOpen: "2026-06-10", dateClose: "2026-06-10", ticker: "MSFT", type: "Stock", side: "Long", pnl: 120.00 },
  { id: "8", dateOpen: "2026-06-11", dateClose: "2026-06-12", ticker: "TSLA", type: "Option", side: "Long", pnl: -200.00 },
  { id: "9", dateOpen: "2026-06-12", dateClose: "2026-06-15", ticker: "NVDA", type: "Stock", side: "Long", pnl: 340.00 },
  { id: "10", dateOpen: "2026-06-16", dateClose: "2026-06-17", ticker: "ES_F", type: "Future", side: "Long", pnl: -150.00 },
  { id: "11", dateOpen: "2026-06-18", dateClose: "2026-06-19", ticker: "SPY", type: "Option", side: "Short", pnl: 280.00 },
  { id: "12", dateOpen: "2026-06-19", dateClose: "2026-06-19", ticker: "AAPL", type: "Stock", side: "Long", pnl: 90.00 }
];

export default function App() {
  const [trades, setTrades] = useState(initialTrades);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // --- Firebase Auth & Sync State ---
  const [user, setUser] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);

  // --- Filter States ---
  const [dateFilter, setDateFilter] = useState('all'); // all, today, week, month, year, custom
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
  const [calendarMonth, setCalendarMonth] = useState(5); // June

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

  // --- Notification Message Toast State ---
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // --- Custom Confirm Modal State ---
  const [confirmModal, setConfirmModal] = useState(null);
  const triggerConfirm = (message, onConfirm) => {
    setConfirmModal({ message, onConfirm });
  };

  // --- Auth Integration & Setup (RULE 3) ---
  useEffect(() => {
    if (!auth) {
      showToast("Running in local session mode (database connection unconfigured).", "info");
      return;
    }
    const initAuth = async () => {
      try {
        setIsSyncing(true);
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
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
  }, []);

  // --- Synchronize with Firestore Database (RULE 1 & 3) ---
  useEffect(() => {
    if (!db || !user) return;
    setIsSyncing(true);
    
    // Strict Path Pattern: /artifacts/{appId}/users/{userId}/trades
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
        const docId = crypto.randomUUID();
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'trades', docId);
        await setDoc(docRef, formatted);
        showToast("Trade saved to your secure cloud account.");
      } catch (err) {
        showToast("Could not save to cloud. Saved in local memory instead.", "error");
        setTrades(prev => [...prev, { id: crypto.randomUUID(), ...formatted }]);
      } finally {
        setIsSyncing(false);
      }
    } else {
      setTrades(prev => [...prev, { id: crypto.randomUUID(), ...formatted }]);
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

  const handleBulkImport = async (importedList) => {
    if (db && user) {
      setIsSyncing(true);
      try {
        const batch = writeBatch(db);
        importedList.forEach(t => {
          const docId = crypto.randomUUID();
          const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'trades', docId);
          batch.set(docRef, t);
        });
        await batch.commit();
        showToast(`Successfully imported ${importedList.length} trades to cloud.`);
      } catch (err) {
        showToast("Cloud sync failed. Importing to local session.", "error");
        setTrades(prev => [...prev, ...importedList.map(t => ({ ...t, id: crypto.randomUUID() }))]);
      } finally {
        setIsSyncing(false);
      }
    } else {
      setTrades(prev => [...prev, ...importedList.map(t => ({ ...t, id: crypto.randomUUID() }))]);
      showToast(`Imported ${importedList.length} trades to session.`);
    }
  };

  // --- CSV Parser & Mapper Logic ---
  const startCsvMapping = () => {
    if (!csvText.trim()) {
      showToast("Please paste CSV data first.", "error");
      return;
    }
    const lines = csvText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) {
      showToast("Not enough CSV data. Verify row format.", "error");
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    const previewRows = lines.slice(1, 4).map(line => line.split(',').map(v => v.trim().replace(/^["']|["']$/g, '')));

    setCsvPreviewHeaders(headers);
    setCsvPreviewRows(previewRows);

    // Dynamic Autodetect Mapping Rules
    const detected = { dateOpen: '', dateClose: '', ticker: '', type: '', side: '', pnl: '' };
    headers.forEach((h, index) => {
      const lower = h.toLowerCase();
      if (lower.includes('open') && lower.includes('date')) detected.dateOpen = String(index);
      else if (lower.includes('close') && lower.includes('date')) detected.dateClose = String(index);
      else if (lower.includes('date') && !detected.dateClose) detected.dateClose = String(index);
      else if (lower.includes('ticker') || lower.includes('symbol')) detected.ticker = String(index);
      else if (lower.includes('type') || lower.includes('asset')) detected.type = String(index);
      else if (lower.includes('side') || lower.includes('action')) detected.side = String(index);
      else if (lower.includes('pnl') || lower.includes('p/l') || lower.includes('profit') || lower.includes('gain')) detected.pnl = String(index);
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
      const lines = csvText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const rows = lines.slice(1);
      const parsedTrades = [];

      rows.forEach(row => {
        const cells = row.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (cells.length < 2) return;

        const dateCloseVal = cells[parseInt(mappings.dateClose, 10)];
        const tickerVal = cells[parseInt(mappings.ticker, 10)];
        const pnlRaw = cells[parseInt(mappings.pnl, 10)];

        if (!dateCloseVal || !tickerVal || pnlRaw === undefined) return;

        const dateOpenVal = mappings.dateOpen ? cells[parseInt(mappings.dateOpen, 10)] : dateCloseVal;
        const typeVal = mappings.type ? cells[parseInt(mappings.type, 10)] : 'Stock';
        const sideVal = mappings.side ? cells[parseInt(mappings.side, 10)] : 'Long';

        // Clean PNL signs/dollar-symbols
        const cleanedPnl = parseFloat(pnlRaw.replace(/[^0-9.-]/g, '')) || 0;

        parsedTrades.push({
          dateOpen: dateOpenVal || dateCloseVal,
          dateClose: dateCloseVal,
          ticker: tickerVal.toUpperCase(),
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
        showToast("No valid rows could be parsed. Check mapping selections.", "error");
      }
    } catch (err) {
      showToast("Import parsing failed. Verify CSV structural health.", "error");
    }
  };

  // --- Dynamic Filters Processing ---
  const processedTrades = useMemo(() => {
    return trades.filter(t => {
      // 1. Ticker filter
      if (selectedTicker !== 'All' && t.ticker !== selectedTicker) return false;
      
      // 2. Asset Type filter
      if (selectedType !== 'All' && t.type !== selectedType) return false;

      // 3. Date filters
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

  // --- Unique Filters list generation ---
  const tickerOptions = useMemo(() => {
    const list = new Set(trades.map(t => t.ticker));
    return ['All', ...Array.from(list).sort()];
  }, [trades]);

  const typeOptions = useMemo(() => {
    const list = new Set(trades.map(t => t.type));
    return ['All', ...Array.from(list).sort()];
  }, [trades]);

  // --- Statistics Calculations ---
  const metrics = useMemo(() => {
    if (processedTrades.length === 0) {
      return { totalPnl: 0, winRate: 0, profitFactor: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, avgWin: 0, avgLoss: 0 };
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

  // Tickers breakdown table metrics
  const tickerStats = useMemo(() => {
    const data = {};
    processedTrades.forEach(t => {
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

  // --- Chart Processing logic (Cumulative Equity & P/L Distribution) ---
  const equityCurvePoints = useMemo(() => {
    const sorted = [...processedTrades].sort((a, b) => new Date(a.dateClose) - new Date(b.dateClose));
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

  // --- Views ---
  const renderDashboard = () => {
    // Generate beautiful interactive SVG for Equity Curve
    const buildEquityCurve = () => {
      if (equityCurvePoints.length < 2) {
        return (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <Activity className="h-10 w-10 mb-2 text-slate-300" />
            <p className="text-sm font-medium">Insufficient trade data to render trend analytics</p>
            <p className="text-xs text-slate-400">Add 2 or more close executions to view performance trajectory</p>
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

      // SVG path construction
      let linePath = `M ${getX(0)} ${getY(equityCurvePoints[0].pnl)}`;
      for (let i = 1; i < equityCurvePoints.length; i++) {
        linePath += ` L ${getX(i)} ${getY(equityCurvePoints[i].pnl)}`;
      }

      const zeroY = getY(0);

      return (
        <div className="w-full">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
            {/* Grid Line Marks */}
            <line x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} stroke="#cbd5e1" strokeDasharray="3" strokeWidth="1.5" />
            
            {/* Smooth Equity Line Area Gradient */}
            <path
              d={`${linePath} L ${getX(equityCurvePoints.length - 1)} ${height - padding} L ${getX(0)} ${height - padding} Z`}
              fill="url(#equityGradient)"
              opacity="0.12"
            />

            {/* Line Path */}
            <path
              d={linePath}
              fill="none"
              stroke="#0ea5e9"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Points circles */}
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

            {/* Definitions for Gradient */}
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
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className={`p-3 rounded-full ${metrics.totalPnl >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
              <DollarSign size={24} />
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
              <Target size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Win Rate</p>
              <h3 className="text-2xl font-bold text-slate-800">{metrics.winRate}%</h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 rounded-full bg-purple-100 text-purple-600">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Profit Factor</p>
              <h3 className="text-2xl font-bold text-slate-800">{metrics.profitFactor}</h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 rounded-full bg-orange-100 text-orange-600">
              <Activity size={24} />
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

        {/* Charts and Visual Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Equity Chart */}
          <div className="bg-white lg:col-span-2 rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider flex items-center">
                <Activity className="mr-2 h-4 w-4 text-sky-500" /> Equity Curve Tracking
              </h2>
              <span className="text-xs bg-slate-100 px-2.5 py-1 text-slate-600 rounded-full font-medium">Interactive Graph</span>
            </div>
            <div className="p-6">
              {buildEquityCurve()}
            </div>
          </div>

          {/* Quick Metrics Breakdown */}
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

              <div className="pt-4 border-t border-slate-100 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Total Profit Captured:</span>
                  <span className="font-bold text-slate-700">
                    ${(parseFloat(metrics.wins) * parseFloat(metrics.avgWin)).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Total Drawdown Losses:</span>
                  <span className="font-bold text-slate-700">
                    -${(parseFloat(metrics.losses) * parseFloat(metrics.avgLoss)).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Performance by Ticker Table */}
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
                  <tr><td colSpan="4" className="p-4 text-center text-slate-500">No trading records found inside current filters</td></tr>
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
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay(); // 0 = Sunday
    
    // Month Names Helper
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    // Dynamic Filtered trade lists for calendar aggregation
    const monthlyPnl = {};
    trades.forEach(t => {
      const parts = t.dateClose.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1; // Convert to 0-indexed month
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
    // Prefix padding
    for (let i = 0; i < firstDay; i++) {
      calendarCells.push(<div key={`empty-${i}`} className="p-4 bg-slate-50/40 border border-slate-100 min-h-[90px]"></div>);
    }
    // Render dynamic cells
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
          <div className="flex items-center space-x-3">
            <h2 className="text-lg font-bold text-slate-800 flex items-center">
              <CalendarIcon className="mr-2 h-5 w-5 text-indigo-500" /> {monthNames[calendarMonth]} {calendarYear}
            </h2>
          </div>
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
        <div className="p-0">
          <div className="grid grid-cols-7 text-center border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold text-slate-400 py-3 uppercase tracking-wider">
            <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
          </div>
          <div className="grid grid-cols-7">
            {calendarCells}
          </div>
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
              <tr><td colSpan="7" className="p-8 text-center text-slate-500 font-medium">No recorded trades match current filters. Try relaxing filters.</td></tr>
            ) : processedTrades.sort((a,b) => new Date(b.dateClose) - new Date(a.dateClose)).map((t, i) => (
              <tr key={t.id || i} className="hover:bg-slate-50 transition text-sm">
                <td className="p-4 text-slate-600">{t.dateOpen}</td>
                <td className="p-4 text-slate-800 font-medium">{t.dateClose}</td>
                <td className="p-4 font-bold text-slate-900">{t.ticker}</td>
                <td className="p-4 text-slate-600">
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px] font-semibold">{t.type}</span>
                </td>
                <td className="p-4 text-slate-600">
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
                    title="Remove trade"
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
      {/* CSV Paste Textbox */}
      {!isMappingMode ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider flex items-center mb-1">
              <Upload className="mr-2 h-4 w-4 text-indigo-500" /> Interactive Brokerage Import
            </h2>
            <p className="text-xs text-slate-500">Paste raw trade CSV data directly from your brokerage export. We will analyze and map your custom column headers dynamically.</p>
          </div>
          
          <div className="space-y-3">
            <textarea 
              className="w-full h-44 p-4 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs font-mono bg-slate-50/50"
              placeholder={`Date_Closed,Symbol,Action,Amount,Asset_Class,Profit_Loss&#10;2026-06-10,AMD,BUY,100,Equity,182.50&#10;2026-06-12,TSLA,SELL,5,Option,-240.00`}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            ></textarea>
            
            <div className="flex flex-wrap gap-2 pt-2">
              <button 
                onClick={startCsvMapping}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
              >
                Analyze Columns & Map Headers
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
        /* Dynamic CSV Header Mapping UI */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6 animate-fade-in">
          <div>
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-base font-bold text-slate-800 flex items-center">
                <Upload className="mr-2 h-5 w-5 text-indigo-500" /> Confirm Header Mappings
              </h2>
              <button 
                onClick={() => setIsMappingMode(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-500">We auto-detected some brokerage column layout matches. Please double-check and assign correct mappings before committing the imports.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Date Closed (Required)</label>
              <select 
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
                value={mappings.dateClose}
                onChange={(e) => setMappings({ ...mappings, dateClose: e.target.value })}
              >
                <option value="">-- Choose Column --</option>
                {csvPreviewHeaders.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Ticker / Symbol (Required)</label>
              <select 
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
                value={mappings.ticker}
                onChange={(e) => setMappings({ ...mappings, ticker: e.target.value })}
              >
                <option value="">-- Choose Column --</option>
                {csvPreviewHeaders.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Profit / Loss (Required)</label>
              <select 
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
                value={mappings.pnl}
                onChange={(e) => setMappings({ ...mappings, pnl: e.target.value })}
              >
                <option value="">-- Choose Column --</option>
                {csvPreviewHeaders.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Date Opened (Optional)</label>
              <select 
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
                value={mappings.dateOpen}
                onChange={(e) => setMappings({ ...mappings, dateOpen: e.target.value })}
              >
                <option value="">Same as Date Closed</option>
                {csvPreviewHeaders.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Asset Type (Optional)</label>
              <select 
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
                value={mappings.type}
                onChange={(e) => setMappings({ ...mappings, type: e.target.value })}
              >
                <option value="">Default: Stock</option>
                {csvPreviewHeaders.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Position Side (Optional)</label>
              <select 
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
                value={mappings.side}
                onChange={(e) => setMappings({ ...mappings, side: e.target.value })}
              >
                <option value="">Default: Long</option>
                {csvPreviewHeaders.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>
          </div>

          {/* Sample Rows Preview Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Data Parsing Sample Row Preview</h3>
            <div className="overflow-x-auto max-h-32 border border-slate-100 rounded-lg">
              <table className="w-full text-[11px] text-left border-collapse bg-slate-50/50">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200">
                    {csvPreviewHeaders.map((h, i) => (
                      <th key={i} className="p-2 font-bold text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvPreviewRows.map((row, rIdx) => (
                    <tr key={rIdx} className="border-b border-slate-100 bg-white">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="p-2 text-slate-600">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end space-x-2 border-t border-slate-100 pt-4">
            <button 
              onClick={() => setIsMappingMode(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
            >
              Cancel
            </button>
            <button 
              onClick={executeCsvImport}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
            >
              Confirm Import & Parse CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-900 antialiased">
      
      {/* Toast Alert Banner */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4.5 py-3 rounded-xl shadow-lg border border-slate-800 flex items-center space-x-3 transition animate-slide-up">
          {toast.type === 'error' ? <AlertCircle className="text-rose-500 h-5 w-5" /> : <CheckCircle2 className="text-emerald-500 h-5 w-5" />}
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Confirmation Modal Overlay */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-800">Please Confirm Execution</h3>
            <p className="text-xs text-slate-500">{confirmModal.message}</p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
              >
                Dismiss
              </button>
              <button
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Entry Modal Dialog */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full space-y-4 shadow-xl">
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
                  placeholder="e.g. 150.00 or -45.50" 
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
                  <option value="Crypto">Crypto</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Side</label>
                <select 
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-lg font-medium"
                  value={newTrade.side}
                  onChange={(e) => setNewTrade({ ...newTrade, side: e.target.value })}
                >
                  <option value="Long">Long (BUY)</option>
                  <option value="Short">Short (SELL/SHORT)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Opened Date</label>
                <input 
                  type="date" 
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-lg"
                  value={newTrade.dateOpen}
                  onChange={(e) => setNewTrade({ ...newTrade, dateOpen: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Closed Date</label>
                <input 
                  type="date" 
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-lg font-bold"
                  value={newTrade.dateClose}
                  onChange={(e) => setNewTrade({ ...newTrade, dateClose: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (!newTrade.ticker || !newTrade.pnl) {
                    showToast("Ticker and Net P/L must be filled out.", "error");
                    return;
                  }
                  handleAddTrade(newTrade);
                  setIsAddModalOpen(false);
                  setNewTrade({
                    dateOpen: new Date().toISOString().split('T')[0],
                    dateClose: new Date().toISOString().split('T')[0],
                    ticker: '',
                    type: 'Stock',
                    side: 'Long',
                    pnl: ''
                  });
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition"
              >
                Save Trade Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-300 flex-shrink-0 flex flex-col justify-between">
        <div className="p-6">
          <h1 className="text-xl font-extrabold text-white flex items-center">
            <TrendingUp className="mr-2 text-emerald-400 h-6 w-6" /> TradeJournal
          </h1>
          
          <nav className="space-y-1.5 mt-8">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center px-3 py-2.5 rounded-xl transition text-xs font-semibold ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800/60 hover:text-white'}`}
            >
              <LayoutDashboard className="h-4.5 w-4.5 mr-3" /> Portfolio Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('calendar')}
              className={`w-full flex items-center px-3 py-2.5 rounded-xl transition text-xs font-semibold ${activeTab === 'calendar' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800/60 hover:text-white'}`}
            >
              <CalendarIcon className="h-4.5 w-4.5 mr-3" /> P/L Calendar
            </button>
            <button 
              onClick={() => setActiveTab('log')}
              className={`w-full flex items-center px-3 py-2.5 rounded-xl transition text-xs font-semibold ${activeTab === 'log' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800/60 hover:text-white'}`}
            >
              <List className="h-4.5 w-4.5 mr-3" /> Executed Trade Log
            </button>
            <button 
              onClick={() => setActiveTab('import')}
              className={`w-full flex items-center px-3 py-2.5 rounded-xl transition text-xs font-semibold ${activeTab === 'import' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800/60 hover:text-white'}`}
            >
              <Upload className="h-4.5 w-4.5 mr-3" /> CSV File Importer
            </button>
          </nav>
        </div>

        {/* Database Sync Status Guardrail */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 m-4 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold">
            <span>Database Service</span>
            {isSyncing ? (
              <span className="text-yellow-500 flex items-center"><CloudLightning size={12} className="mr-1 animate-pulse" /> Syncing</span>
            ) : db && user ? (
              <span className="text-emerald-500 flex items-center"><Cloud size={12} className="mr-1" /> Active Cloud</span>
            ) : (
              <span className="text-slate-400 flex items-center"><CloudOff size={12} className="mr-1" /> Local Session</span>
            )}
          </div>
          {syncError && <p className="text-[10px] text-rose-400 leading-tight">{syncError}</p>}
          <p className="text-[9px] text-slate-500 leading-relaxed">Trades are persistent during browser runtime sessions.</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 lg:p-8 overflow-y-auto max-h-screen">
        
        {/* Dynamic Filters Bar */}
        <header className="mb-6 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row justify-between lg:items-center gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-800 flex items-center">
              <Filter className="mr-2 h-4 w-4 text-indigo-500" /> Active Filters
            </h2>
            <p className="text-xs text-slate-500">Dynamically filtering statistics, calculations, and performance summaries</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Timeline Filter */}
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Time Range</span>
              <select 
                className="text-xs p-2 border border-slate-200 rounded-lg font-medium bg-slate-50 focus:bg-white"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {/* Custom Dates (Conditional rendering) */}
            {dateFilter === 'custom' && (
              <>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Start Date</span>
                  <input 
                    type="date" 
                    className="text-xs p-2 border border-slate-200 rounded-lg bg-slate-50"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">End Date</span>
                  <input 
                    type="date" 
                    className="text-xs p-2 border border-slate-200 rounded-lg bg-slate-50"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Tickers Filter */}
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Ticker Selection</span>
              <select 
                className="text-xs p-2 border border-slate-200 rounded-lg font-medium bg-slate-50 focus:bg-white"
                value={selectedTicker}
                onChange={(e) => setSelectedTicker(e.target.value)}
              >
                {tickerOptions.map(tick => <option key={tick} value={tick}>{tick}</option>)}
              </select>
            </div>

            {/* Instruments Types Filter */}
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Asset Class</span>
              <select 
                className="text-xs p-2 border border-slate-200 rounded-lg font-medium bg-slate-50 focus:bg-white"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
              >
                {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </header>

        {/* View Router */}
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
