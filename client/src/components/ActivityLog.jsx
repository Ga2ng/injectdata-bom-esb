import { useEffect, useRef } from 'react';

function formatLogTime(isoString) {
  if (!isoString) return '--:--:--';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toTimeString().slice(0, 8);
}

export function ActivityLog({ logs }) {
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title">Activity</h2>
        <span className="badge badge-neutral">{logs.length} entries</span>
      </div>

      <div className="log-list" ref={listRef}>
        {logs.length === 0 ? (
          <div className="log-empty">Belum ada aktivitas tercatat.</div>
        ) : (
          logs.map((entry) => (
            <div className="log-row" key={entry.id ?? `${entry.created_at}-${entry.event}`}>
              <span className="log-time">{formatLogTime(entry.created_at)}</span>
              <span className={`log-level log-level-${entry.level}`}>{entry.level}</span>
              <span className="log-message">{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

