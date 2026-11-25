const POWERSHELL_CDP_COMMAND = `& "$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe" \`
  --remote-debugging-port=9222 \`
  --user-data-dir="$env:LOCALAPPDATA\\ESB-Automation-Chrome" \`
  https://erp.esb.co.id/`;

function getStatusBadgeClass(connectionStatus) {
  switch (connectionStatus) {
    case 'Connected':
      return 'badge badge-success';
    case 'Connecting':
      return 'badge badge-info';
    case 'Error':
      return 'badge badge-error';
    default:
      return 'badge badge-neutral';
  }
}

function formatDateTime(isoString) {
  if (!isoString) return '-';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleString('id-ID');
}

export function ConnectionPanel({
  status,
  backendOnline,
  busyAction,
  actionError,
  onConnect,
  onDisconnect,
}) {
  const isConnecting = status.connectionStatus === 'Connecting' || busyAction === 'connect';
  const isConnected = status.connectionStatus === 'Connected';
  const showCdpHint = status.cdpUnavailable || status.connectionStatus === 'Error';

  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title">Browser Connection</h2>
        <span className={getStatusBadgeClass(status.connectionStatus)}>
          {status.connectionStatus}
        </span>
      </div>

      <div className="row-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onConnect}
          disabled={!backendOnline || isConnecting}
        >
          {isConnecting ? 'Connecting...' : 'Connect'}
        </button>

        <button
          type="button"
          className="btn"
          onClick={onDisconnect}
          disabled={!backendOnline || busyAction === 'disconnect' || !isConnected}
        >
          {busyAction === 'disconnect' ? 'Disconnecting...' : 'Disconnect'}
        </button>
      </div>

      <div className="meta-grid">
        <span className="meta-label">Endpoint CDP Lokal</span>
        <span className="meta-value mono">{status.cdpEndpoint}</span>

        <span className="meta-label">Target ERP</span>
        <span className="meta-value mono">https://erp.esb.co.id/</span>

        <span className="meta-label">Tab ERP Cocok</span>
        <span className="meta-value">
          {status.tabDetected
            ? `${status.pageTitle || 'ESB ERP'} (${status.currentUrl})`
            : status.tabStatus}
        </span>

        <span className="meta-label">Koneksi Terakhir</span>
        <span className="meta-value">{formatDateTime(status.lastConnectedAt)}</span>
      </div>

      {(actionError || status.errorMessage) && (
        <div className="alert-box" role="alert">
          {actionError || status.errorMessage}
        </div>
      )}

      <details className="cdp-guide" open={showCdpHint}>
        <summary>
          Perintah membuka Chrome Remote Debugging (Port 9222)
        </summary>
        <p>
          Buka PowerShell dan jalankan perintah berikut untuk membuka Chrome khusus ERP ESB:
        </p>
        <pre className="code-block">{POWERSHELL_CDP_COMMAND}</pre>
      </details>
    </section>
  );
}
