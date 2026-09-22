import React, { useEffect, useState } from 'react';
import { getSystemConfigs, getAllResults } from '../sqlDb.js';

export default function SystemConfigStatusView({ project, test, refreshToken, onDotClick }) {
  const [configLines, setConfigLines] = useState([]);
  const [allSwids, setAllSwids] = useState([]);
  const [loading, setLoading] = useState(false);
  const AXIS_GAP_PX = 110; // increased spacing between vertical guide lines

  useEffect(() => {
    async function load() {
      if (!project || !test) { setConfigLines([]); setAllSwids([]); return; }
      setLoading(true);
      try {
        const configs = await getSystemConfigs(project, test);
        const allResults = await getAllResults();
        const relevant = allResults.filter(r => r.project === project && r.test === test);
        const grouped = configs.map(cfg => {
          const swids = relevant.filter(r => (r.systemConfig || r.system_config) === cfg.name);
          const statuses = swids.map(r => ({ swid: r.swid, status: computeSwidStatus(r) }));
          return { configName: cfg.name, swids: statuses };
        });
        const swidSet = new Set();
        grouped.forEach(line => line.swids.forEach(s => {
          const n = Number(String(s.swid).replace(/[^0-9.-]/g,''));
          swidSet.add(Number.isNaN(n) ? s.swid : n);
        }));
        const sorted = Array.from(swidSet).sort((a,b) => {
          const na = typeof a === 'number', nb = typeof b === 'number';
          if (na && nb) return b - a;
          return String(b).localeCompare(String(a), undefined, { numeric: true, sensitivity: 'base' });
        });
        setConfigLines(grouped);
        setAllSwids(sorted);
      } catch (e) {
        console.error('SystemConfigStatusView load failed', e);
      } finally { setLoading(false); }
    }
    load();
  }, [project, test, refreshToken]);

  function computeSwidStatus(result) {
    let rows = result.data || result.parsed_data;
    if (typeof rows === 'string') { try { rows = JSON.parse(rows); } catch { return 'fail'; } }
    if (!Array.isArray(rows) || rows.length === 0) return 'fail';
    const nonEmpty = rows.filter(row => Object.values(row).some(v => v !== '' && v != null));
    if (!nonEmpty.length) return 'fail';
    const normalize = (h='') => h.toString().toLowerCase().replace(/[^a-z0-9]/g,'');
    const deviationLimit = (benchmarkValue) => Math.max(5, Math.abs(benchmarkValue) * 0.10);
    const headers = Object.keys(nonEmpty[0]);
    const isCpt = (test || '').toLowerCase().includes('cpt');
    if (isCpt) {
      const avgKey = headers.find(h => normalize(h) === 'average');
      const benchKey = headers.find(h => normalize(h).includes('default') && normalize(h).includes('alm')) || headers.find(h => normalize(h) === 'defaultalm');
      if (!avgKey || !benchKey) return 'fail';
      for (const row of nonEmpty) {
        const avg = parseFloat(String(row[avgKey]).replace(/[^0-9.+-]/g,''));
        const bench = parseFloat(String(row[benchKey]).replace(/[^0-9.+-]/g,''));
        if (!Number.isFinite(avg) || !Number.isFinite(bench)) continue;
        if (avg > bench && (avg - bench) > deviationLimit(bench)) return 'fail';
      }
      return 'pass';
    } else {
      const benchKey = headers.find(h => normalize(h).includes('benchmark') && normalize(h).includes('performance')) || headers.find(h => normalize(h) === 'benchmarkperformancevalue');
      const measKey = headers.find(h => normalize(h).includes('measured') && (normalize(h).includes('recon') || normalize(h).includes('latency'))) || headers.find(h => normalize(h) === 'measuredreconlatencyvalue');
      if (!benchKey || !measKey) return 'fail';
      for (const row of nonEmpty) {
        const bench = parseFloat(String(row[benchKey]).replace(/[^0-9.+-]/g,''));
        const meas = parseFloat(String(row[measKey]).replace(/[^0-9.+-]/g,''));
        if (!Number.isFinite(bench) || !Number.isFinite(meas)) continue;
        if (meas > bench && (meas - bench) > deviationLimit(bench)) return 'fail';
      }
      return 'pass';
    }
  }

  if (!project || !test) return null;

  return (
    <div className="system-config-status-view">
      <div className="status-view-header">
        <h2 className="status-view-title">System Configuration Status</h2>
        <div className="status-view-subtitle">{project} / {test}</div>
        <div className="status-legend">
          <span className="legend-item"><span className="status-dot pass"></span> All Exam Cards Passed</span>
          <span className="legend-item"><span className="status-dot fail"></span> Failed Exam Cards</span>
        </div>
      </div>

      {loading ? (
        <div className="status-loading">Loading configuration status...</div>
      ) : (
        <div className="config-lines-container status-scroll">
          <div className="status-scroll-inner" style={{ width: `${Math.max(allSwids.length,1) * AXIS_GAP_PX}px` }}>
            {configLines.length === 0 ? (
              <div className="no-data-message">No system configurations found for this project/test combination.</div>
            ) : (
              <>
                {allSwids.length > 0 && (
                  <div className="guides-layer-global">
                    {allSwids.map((sw, gi) => (
                      <div key={gi} className="guide-line-global" style={{ left: `${gi * AXIS_GAP_PX}px` }} />
                    ))}
                  </div>
                )}

                {configLines.map((line, idx) => (
                  <div key={idx} className="config-line-row">
                    <div className="config-label">{line.configName}</div>
                    <div className="config-timeline">
                      <div className="timeline-line"></div>
                      <div className="swid-dots by-axis">
                        {line.swids.length === 0 ? (
                          <div className="no-swids-note">No SWIDs</div>
                        ) : (
                          line.swids.map((s, i) => {
                            const n = Number(String(s.swid).replace(/[^0-9.-]/g,''));
                            const keyVal = Number.isNaN(n) ? s.swid : n;
                            const axisIndex = allSwids.findIndex(x => String(x) === String(keyVal));
                            const leftPx = axisIndex >= 0 ? axisIndex * AXIS_GAP_PX : 0;
                            return (
                                <div key={i} className={`swid-dot ${s.status}`} title={`SWID ${s.swid}: ${s.status==='pass'?'Passed':'Failed'}`} style={{ left: `${leftPx}px`, cursor: 'pointer' }}
                                  onClick={() => onDotClick && onDotClick(project, test, line.configName, s.swid)} />
                              );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                <div className="config-line-row axis-row">
                  <div className="config-label axis-label-strong">All SWIDs</div>
                  <div className="config-timeline">
                    <div className="timeline-line axis"></div>
                    {allSwids.length === 0 ? (
                      <div className="no-swids-note">No SWIDs</div>
                    ) : (
                      <div className="swid-axis" style={{ width: `${Math.max(allSwids.length,1) * AXIS_GAP_PX}px` }}>
                        {allSwids.map((sw, si) => (
                          <div key={si} className="axis-swid" style={{ left: `${si * AXIS_GAP_PX}px` }}>
                            <div className="axis-label">{sw}</div>
                            <div className="axis-dot"></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
