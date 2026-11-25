import { useEffect, useState } from 'react';
import {
  clearBomMenus,
  connectBrowser,
  deleteBomMenu,
  disconnectBrowser,
  getBomMenus,
  getBrowserStatus,
  getHealth,
  getInjectionHistory,
  saveBomMenu,
  startInjection,
  stopInjection,
  subscribeEvents,
  uploadBomJson,
} from './api.js';
import { ActivityLog } from './components/ActivityLog.jsx';
import { BomSlotPanel } from './components/BomSlotPanel.jsx';
import { BrowserPanel } from './components/BrowserPanel.jsx';
import { ConnectionPanel } from './components/ConnectionPanel.jsx';
import { ControlBar } from './components/ControlBar.jsx';
import { HistoryPanel } from './components/HistoryPanel.jsx';
import { PrintoutReportPanel } from './components/PrintoutReportPanel.jsx';

const INITIAL_STATUS = {
  connectionStatus: 'Disconnected',
  cdpEndpoint: 'http://127.0.0.1:9222',
  browserName: null,
  lastConnectedAt: null,
  errorMessage: null,
  cdpUnavailable: false,
  tabDetected: false,
  tabStatus: 'Not connected',
  loginStatus: 'Memeriksa...',
  isAtBomUrl: false,
  currentUrl: null,
  pageTitle: null,
  lastActivityAt: null,
  taskStatus: 'Idle',
  currentExecutionReport: null,
};

export default function App() {
  const [backendOnline, setBackendOnline] = useState(false);
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [logs, setLogs] = useState([]);
  const [bomMenus, setBomMenus] = useState([]);
  const [historyList, setHistoryList] = useState([]);
  const [busyAction, setBusyAction] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [executionReport, setExecutionReport] = useState(null);

  const fetchHistory = async () => {
    try {
      const res = await getInjectionHistory();
      if (Array.isArray(res.history)) {
        setHistoryList(res.history);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        await getHealth();
        if (!active) return;
        setBackendOnline(true);

        const data = await getBrowserStatus();
        if (!active) return;
        if (data.status) {
          setStatus(data.status);
          if (data.status.currentExecutionReport) {
            setExecutionReport(data.status.currentExecutionReport);
          }
        }
        if (Array.isArray(data.logs)) setLogs(data.logs);
        if (Array.isArray(data.recentInjections)) setHistoryList(data.recentInjections);

        // Fetch stored BOM data & history
        const bomData = await getBomMenus();
        if (!active) return;
        if (Array.isArray(bomData.menus)) {
          setBomMenus(bomData.menus);
        }

        void fetchHistory();
      } catch {
        if (active) setBackendOnline(false);
      }
    }

    void bootstrap();

    const unsubscribe = subscribeEvents({
      onOpen: () => {
        if (active) setBackendOnline(true);
      },
      onInit: (payload) => {
        if (!active || !payload) return;
        setBackendOnline(true);
        if (payload.status) {
          setStatus(payload.status);
          if (payload.status.currentExecutionReport) {
            setExecutionReport(payload.status.currentExecutionReport);
          }
        }
        if (Array.isArray(payload.logs)) setLogs(payload.logs);
        if (Array.isArray(payload.recentInjections)) setHistoryList(payload.recentInjections);
      },
      onStatus: (nextStatus) => {
        if (active && nextStatus) {
          setStatus(nextStatus);
          if (nextStatus.currentExecutionReport) {
            setExecutionReport(nextStatus.currentExecutionReport);
          }
          // Refresh riwayat saat task status berubah
          void fetchHistory();
        }
      },
      onLog: (entry) => {
        if (!active || !entry) return;
        setLogs((prev) => {
          if (entry.id && prev.some((item) => item.id === entry.id)) {
            return prev;
          }
          return [...prev.slice(-149), entry];
        });
      },
      onError: () => {
        getHealth()
          .then(() => {
            if (active) setBackendOnline(true);
          })
          .catch(() => {
            if (active) setBackendOnline(false);
          });
      },
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function handleConnect() {
    setBusyAction('connect');
    setActionError(null);
    try {
      const res = await connectBrowser();
      if (res.status) setStatus(res.status);
    } catch (err) {
      setActionError(err.message);
      if (err.statusData) setStatus(err.statusData);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDisconnect() {
    setBusyAction('disconnect');
    setActionError(null);
    try {
      const res = await disconnectBrowser();
      if (res.status) setStatus(res.status);
    } catch (err) {
      setActionError(err.message);
      if (err.statusData) setStatus(err.statusData);
    } finally {
      setBusyAction(null);
    }
  }

  // START INJECTION DENGAN INPUT JSON
  async function handleStartInjection(payload) {
    setBusyAction('start');
    setActionError(null);
    try {
      const res = await startInjection(payload);
      if (res.status) setStatus(res.status);
      if (res.report) setExecutionReport(res.report);
      void fetchHistory();
    } catch (err) {
      setActionError(err.message);
      if (err.statusData) setStatus(err.statusData);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStopInjection() {
    setBusyAction('stop');
    setActionError(null);
    try {
      const res = await stopInjection();
      if (res.status) setStatus(res.status);
      void fetchHistory();
    } catch (err) {
      setActionError(err.message);
      if (err.statusData) setStatus(err.statusData);
    } finally {
      setBusyAction(null);
    }
  }

  // BOM Management Handlers
  async function handleUploadBomJson(jsonPayload) {
    const res = await uploadBomJson(jsonPayload, false);
    if (Array.isArray(res.menus)) {
      setBomMenus(res.menus);
    }
  }

  async function handleSaveBomMenu(menu) {
    const res = await saveBomMenu(menu);
    if (Array.isArray(res.menus)) {
      setBomMenus(res.menus);
    }
  }

  async function handleDeleteBomMenu(bomId) {
    const res = await deleteBomMenu(bomId);
    if (Array.isArray(res.menus)) {
      setBomMenus(res.menus);
    }
  }

  async function handleClearBomMenus() {
    const res = await clearBomMenus();
    if (Array.isArray(res.menus)) {
      setBomMenus(res.menus);
    }
  }

  return (
    <main className="page-container">
      <header className="app-header">
        <h1 className="app-title">ESB Local Controller</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className={status.loginStatus === 'Sudah Login' ? 'badge badge-success' : 'badge badge-warning'}>
            ESB: {status.loginStatus || 'Belum Terhubung'}
          </span>
          <span className={backendOnline ? 'badge badge-success' : 'badge badge-error'}>
            Backend: {backendOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </header>

      <ConnectionPanel
        status={status}
        backendOnline={backendOnline}
        busyAction={busyAction}
        actionError={actionError}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />

      <BrowserPanel status={status} />

      {/* AUTOMATION CONTROL (UPLOAD, EDIT & INJEKSI MENU 1 PER 1) */}
      <ControlBar
        status={status}
        backendOnline={backendOnline}
        busyAction={busyAction}
        onStartInjection={handleStartInjection}
        onStopInjection={handleStopInjection}
      />

      {/* PRINTOUT HASIL EKSEKUSI TERAKHIR */}
      <PrintoutReportPanel report={executionReport} />

      {/* PANEL RIWAYAT EKSEKUSI (HISTORY) */}
      <HistoryPanel historyList={historyList} onRefresh={fetchHistory} />

      {/* SLOT DATA BOM DINAMIS */}
      <BomSlotPanel
        menus={bomMenus}
        onUploadJson={handleUploadBomJson}
        onSaveMenu={handleSaveBomMenu}
        onDeleteMenu={handleDeleteBomMenu}
        onClearMenus={handleClearBomMenus}
      />

      {/* LOG AKTIVITAS TEKNIS SYSTEM */}
      <ActivityLog logs={logs} />
    </main>
  );
}
