import React, { useEffect, useMemo, useState } from 'react';
import { getAllResults } from '../sqlDb.js';

export default function ConfigDashboard({ project, test, systemConfig, onOpenSwid, onUploadNew, onBack, onDeleteSwid, onViewExcel, refreshToken }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // Compute pass percentage and failed strict count from raw JSON rows
  function computeMetrics(json) {
    if (!Array.isArray(json) || json.length === 0) return { passPct: 0, failedStrict: 0, totalCards: 0 };
    const nonEmpty = json.filter(row => Object.values(row).some(v => v !== '' && v != null));
    const normalize = (h='') => h.toString().toLowerCase().replace(/[^a-z0-9]/g,'');
    const deviationLimit = (benchmarkValue) => Math.max(5, Math.abs(benchmarkValue) * 0.10);
    const headers = nonEmpty.length ? Object.keys(nonEmpty[0]) : [];
    const isCpt = (test || '').toLowerCase().includes('cpt');

    let valKey, refKey;
    if (isCpt) {
      valKey = headers.find(h => normalize(h) === 'average');
      refKey = headers.find(h => normalize(h).includes('default') && normalize(h).includes('alm')) || headers.find(h => normalize(h) === 'defaultalm');
    } else {
      refKey = headers.find(h => normalize(h).includes('benchmark') && normalize(h).includes('performance')) || headers.find(h => normalize(h)==='benchmarkperformancevalue');
      valKey = headers.find(h => normalize(h).includes('measured') && (normalize(h).includes('recon') || normalize(h).includes('latency'))) || headers.find(h => normalize(h)==='measuredreconlatencyvalue');
    }
    if (!valKey || !refKey) return { passPct: 0, failedStrict: 0, totalCards: 0 };
    let total = 0; let pass = 0; let failedStrict = 0;
    nonEmpty.forEach(row => {
      const valRaw = row[valKey];
      const refRaw = row[refKey];
      const val = typeof valRaw === 'number' ? valRaw : parseFloat(String(valRaw).replace(/[^0-9.+-]/g,''));
      const ref = typeof refRaw === 'number' ? refRaw : parseFloat(String(refRaw).replace(/[^0-9.+-]/g,''));
      if (Number.isNaN(val) || Number.isNaN(ref)) return;
      total += 1;
      if (val <= ref) {
        pass += 1;
      } else if ((val - ref) <= deviationLimit(ref)) {
        pass += 1;
      } else {
        failedStrict += 1;
      }
    });
    const passPct = total ? Math.round((pass / total) * 1000) / 10 : 0;
    return { passPct, failedStrict, totalCards: total };
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const all = await getAllResults();
        const norm = (s) => (s || '').trim().toLowerCase();
        const filtered = all.filter(r => norm(r.project) === norm(project)
          && norm(r.test) === norm(test)
          && norm(r.systemConfig || r.system_config) === norm(systemConfig));
        setResults(filtered);
      } finally {
        setLoading(false);
      }
    }
    if (project && test && systemConfig) load();
  }, [project, test, systemConfig, refreshToken]);

  const overview = useMemo(() => {
    const totalSwids = results.length;
    const metrics = results.map(r => {
      let rows = r.data || r.parsed_data;
      if (typeof rows === 'string') {
        try { rows = JSON.parse(rows); } catch {}
      }
      return computeMetrics(rows);
    });
    const passRate = metrics.length ? Math.round((metrics.reduce((acc, m) => acc + m.passPct, 0) / metrics.length) * 10) / 10 : 0;
    const failedCases = metrics.reduce((acc, m) => acc + m.failedStrict, 0);
    return { totalSwids, passRate, failedCases };
  }, [results]);

  const swidRows = useMemo(() => {
    return results.map(r => {
      let rows = r.data || r.parsed_data;
      if (typeof rows === 'string') {
        try { rows = JSON.parse(rows); } catch {}
      }
      const m = computeMetrics(rows);
      return {
        swid: r.swid,
        passPct: m.passPct,
        uploadDate: r.uploaded_on || 'Recently',
      };
    });
  }, [results]);

  return (
    <section className="config-dashboard">
      <h2 className="cd-title" title="Go back" onClick={() => onBack && onBack(project, test)} style={{cursor:'pointer'}}>
        {project} / {test} / {systemConfig}
      </h2>

      <div className="cd-overview">
        <div className="ov-line">Total SWIDs: <strong>{overview.totalSwids}</strong></div>
        <div className="ov-line">Pass Rate (avg): <strong>{overview.passRate}%</strong></div>
        {overview.failedCases > 0 && (
          <div className="ov-line">Failed Cases: <strong>{overview.failedCases}</strong></div>
        )}
      </div>

      <div className="cd-table">
        <table className="mini-data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>SWID</th>
              <th>Pass %</th>
              <th>Upload Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {swidRows.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign:'center', padding:'1.25rem', fontStyle:'italic', color:'#64748b' }}>No SWIDs available. Upload one to begin.</td>
              </tr>
            )}
            {swidRows.map((r, idx) => (
              <tr key={r.swid}>
                <td>{idx + 1}</td>
                <td><strong>{r.swid}</strong></td>
                <td>{r.passPct}</td>
                <td>{r.uploadDate}</td>
                <td>
                  <div className="action-btn-group">
                    <button
                      className="action-btn action-btn-primary"
                      onClick={() => onOpenSwid && onOpenSwid(project, test, systemConfig, r.swid)}
                    >View Results</button>
                    <button
                      className="action-btn action-btn-secondary"
                      onClick={() => onViewExcel && onViewExcel(project, test, systemConfig, r.swid)}
                    >View Data</button>
                    <button
                      className="action-btn action-btn-danger"
                      title="Delete this SWID"
                      onClick={() => onDeleteSwid && onDeleteSwid(project, test, systemConfig, r.swid)}
                    >Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="cd-actions" style={{ marginTop: '1.5rem' }}>
        <button className="btn" onClick={() => onUploadNew && onUploadNew(project, test, systemConfig)}>+ Add SWID</button>
      </div>
    </section>
  );
}
