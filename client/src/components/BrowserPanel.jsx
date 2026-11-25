function getTabBadgeClass(tabStatus) {
  switch (tabStatus) {
    case 'ESB tab detected':
      return 'badge badge-success';
    case 'Navigating':
      return 'badge badge-info';
    case 'ESB tab not found':
    case 'Tab closed':
      return 'badge badge-warning';
    default:
      return 'badge badge-neutral';
  }
}

function getLoginBadgeClass(loginStatus) {
  switch (loginStatus) {
    case 'Sudah Login':
      return 'badge badge-success';
    case 'Belum Login':
      return 'badge badge-error';
    default:
      return 'badge badge-neutral';
  }
}

function formatTime(isoString) {
  if (!isoString) return '-';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleString('id-ID');
}

export function BrowserPanel({ status }) {
  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title">Browser Tab (ESB ERP)</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span className={getTabBadgeClass(status.tabStatus)}>{status.tabStatus}</span>
          <span className={getLoginBadgeClass(status.loginStatus)}>
            {status.loginStatus || 'Belum Terdeteksi'}
          </span>
        </div>
      </div>

      <div className="meta-grid">
        <span className="meta-label">Status Akun</span>
        <span className="meta-value">
          <strong style={{ color: status.loginStatus === 'Sudah Login' ? '#15803d' : '#b91c1c' }}>
            {status.loginStatus || 'Belum Terdeteksi'}
          </strong>
          {status.loginStatus === 'Belum Login' && (
            <span style={{ marginLeft: '8px', color: '#6b7280', fontSize: '12px' }}>
              (Silakan isi username & password Anda di Chrome)
            </span>
          )}
        </span>

        <span className="meta-label">Browser</span>
        <span className="meta-value">{status.browserName || '-'}</span>

        <span className="meta-label">URL Saat Ini</span>
        <span className="meta-value mono">{status.currentUrl || '-'}</span>

        <span className="meta-label">Page Title</span>
        <span className="meta-value">{status.pageTitle || '-'}</span>

        <span className="meta-label">Last Activity</span>
        <span className="meta-value">{formatTime(status.lastActivityAt)}</span>
      </div>
    </section>
  );
}
