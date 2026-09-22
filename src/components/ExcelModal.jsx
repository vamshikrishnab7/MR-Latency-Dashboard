import React, { useMemo } from 'react';

export default function ExcelModal({ title, rows, onClose }) {
  const columns = useMemo(() => {
    const set = new Set();
    let normalizedRows = rows;
    if (typeof normalizedRows === 'string') {
      try { normalizedRows = JSON.parse(normalizedRows); } catch { normalizedRows = []; }
    }
    if (!Array.isArray(normalizedRows)) normalizedRows = [];
    normalizedRows.forEach(r => Object.keys(r || {}).forEach(k => set.add(k)));
    return Array.from(set);
  }, [rows]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel fullscreen" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header with-close">
          <h3 className="modal-title">{title || 'Excel Sheet'}</h3>
          <button className="modal-close" title="Close" onClick={onClose}>×</button>
        </div>
        <div className="modal-content fill">
          {(() => {
            let normalizedRows = rows;
            if (typeof normalizedRows === 'string') {
              try { normalizedRows = JSON.parse(normalizedRows); } catch { normalizedRows = []; }
            }
            if (!Array.isArray(normalizedRows)) normalizedRows = [];
            return normalizedRows.length ? (
            <div className="data-table-scroll xlarge">
              <table className="mini-data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    {columns.map(c => <th key={c}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {normalizedRows.map((r, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      {columns.map(c => <td key={c}>{r[c]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '1rem', color: '#64748b' }}>No rows available.</div>
          );
          })()}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
