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

// --- Safe Global Environment Resolution ---
const appId = typeof window !== 'undefined' && window.__app_id ? window.__app_id : 'trade-log-app';

let firebaseConfig = null;
if (typeof window !== 'undefined' && window.__firebase_config) {
  try {
    // Handle both pre-parsed objects and raw string variations safely
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

// --- Environment-Aware Safe UUID Generator ---
const generateUUID = () => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
};

// --- Hardcoded Initial Fallback Dataset ---
const initialTrades = [
  { id: "1", dateOpen: "2026-06-01", dateClose: "2026-06-02", ticker: "MU", type: "Option", side: "Long", pnl: 57.75 },
  { id: "2", dateOpen: "2026-06-02", dateClose: "2026-06-02", ticker: "TSLA", type: "Option", side: "Short", pnl: -320.00 },
  { id: "3", dateOpen: "2026-06-03", dateClose: "2026-06-04", ticker: "MRVL", type: "Option", side: "Long", pnl: 104.68 },
  { id: "4", dateOpen: "2026-06-04", dateClose: "2026-06-04", ticker: "MSFT", type: "Option", side: "Long", pnl: 61.75 },
  { id: "5", dateOpen: "2026-06-03", dateClose: "2026-06-04", ticker: "HOOD", type: "Option", side: "Long", pnl: 44.75 }
];

// Robust CSV parser line guard against undefined/null text inputs
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
  
  // --- Firebase States ---
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
    dateOpen: '', dateClose: '', ticker: '', type: '', side: '', pnl: ''
  });
  const [isMappingMode, setIsMappingMode] = useState(false);

  // --- Navigation Controls ---
  const [calendarYear, setCalendarYear] = useState(2026);
  const [calendarMonth, setCalendarMonth] = useState(5); 

  // --- Modals State Management ---
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTrade, setNewTrade] = useState({
    dateOpen: new Date().toISOString().split('T')[0],
    dateClose: new Date().toISOString().split('T')[0],
    ticker: '', type: 'Stock', side: 'Long', pnl: ''
  });

  // --- Safe Auto-Dismiss Toast System ---
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

  // --- Authentication Routine ---
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

  // --- Database Sync Routine ---
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

  // --- Operations Event Handlers ---
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

  // --- Tastytrade FIFO Processing Engine ---
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

  // --- CSV Parser UI State Switchers ---
  const startCsvMapping = () => {
    if (!csvText || !csvText.trim()) {
      showToast("Please paste CSV text before executing engine actions.", "error");
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
      } else
