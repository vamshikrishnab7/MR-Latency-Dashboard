import React, { useEffect, useState } from 'react';
import { getSystemConfigs, getAllResults, addSystemConfig } from '../sqlDb';
import InputModal from './InputModal.jsx';

export default function TestWorkspace({ project, test, onViewConfig, onCreateSwidContext, onBack, refreshToken: externalRefreshToken }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddConfig, setShowAddConfig] = useState(false);
  const [configToAddSwid, setConfigToAddSwid] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);
  // Predefined configurations (limit selection to known options)
  const predefinedConfigs = ['Z4G4 10C', 'Z4G5 12C', 'Z4G4 6C'];
  const [availableConfigOptions, setAvailableConfigOptions] = useState(predefinedConfigs);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const cfgs = await getSystemConfigs(project, test);
        const results = await getAllResults();
        const byCfg = {};
        results.forEach(r => {
          if (r.project === project && r.test === test) {
            const key = r.systemConfig || r.system_config;
            byCfg[key] = byCfg[key] || [];
            byCfg[key].push(r);
          }
        });
        // Helper: compute per-SWID pass percentage including deviation passes
        const computeMetrics = (json, testName) => {
          if (!Array.isArray(json) || json.length === 0) return { passPct: 0 };
          const nonEmpty = json.filter(row => Object.values(row).some(v => v !== '' && v != null));
          const normalize = (h='') => h.toString().toLowerCase().replace(/[^a-z0-9]/g,'');
          const deviationLimit = (benchmarkValue) => Math.max(5, Math.abs(benchmarkValue) * 0.10);
          const headers = nonEmpty.length ? Object.keys(nonEmpty[0]) : [];
          const isCpt = (testName || '').toLowerCase().includes('cpt');

          let valKey, refKey;
          if (isCpt) {
            valKey = headers.find(h => normalize(h) === 'average');
            refKey = headers.find(h => normalize(h).includes('default') && normalize(h).includes('alm')) || headers.find(h => normalize(h) === 'defaultalm');
          } else {
            refKey = headers.find(h => normalize(h).includes('benchmark') && normalize(h).includes('performance')) || headers.find(h => normalize(h)==='benchmarkperformancevalue');
            valKey = headers.find(h => normalize(h).includes('measured') && (normalize(h).includes('recon') || normalize(h).includes('latency'))) || headers.find(h => normalize(h)==='measuredreconlatencyvalue');
          }
          if (!valKey || !refKey) return { passPct: 0 };
          let total = 0; let pass = 0;
          nonEmpty.forEach(row => {
            const valRaw = row[valKey];
            const refRaw = row[refKey];
            const val = typeof valRaw === 'number' ? valRaw : parseFloat(String(valRaw).replace(/[^0-9.+-]/g,''));
            const ref = typeof refRaw === 'number' ? refRaw : parseFloat(String(refRaw).replace(/[^0-9.+-]/g,''));
            if (Number.isNaN(val) || Number.isNaN(ref)) return;
            total += 1;
            if (val <= ref || (val - ref) <= deviationLimit(ref)) pass += 1;
          });
          const passPct = total ? Math.round((pass / total) * 1000) / 10 : 0;
          return { passPct };
        };

        const cardsData = (cfgs || []).map(c => {
          const list = byCfg[c.name] || [];
          const swidCount = list.length;
          const metrics = list.map(r => {
            let rows = r.data || r.parsed_data;
            if (typeof rows === 'string') {
              try { rows = JSON.parse(rows); } catch {}
            }
            return computeMetrics(rows, test);
          });
          const passAvg = metrics.length ? Math.round((metrics.reduce((acc, m) => acc + m.passPct, 0) / metrics.length) * 10) / 10 : 0;
          const updated = list.length ? 'Recently' : '—';
          return { name: c.name, swidCount, passAvg, updated };
        });
        setCards(cardsData);
        // Update available options: show only predefined that are not yet present
        const existingNames = new Set((cfgs || []).map(c => c.name));
        setAvailableConfigOptions(predefinedConfigs.filter(name => !existingNames.has(name)));
      } finally {
        setLoading(false);
      }
    }
    if (project && test) load();
  }, [project, test, refreshToken, externalRefreshToken]);

  if (!project || !test) return null;

  return (
    <section className="test-workspace">
      <h2 className="tw-title" title="Go back" onClick={() => onBack && onBack(project)} style={{cursor:'pointer'}}>{project} / {test}</h2>
      <div className="tw-actions-bar">
        <button className="btn" onClick={() => setShowAddConfig(true)}>+ Add System Configurations</button>
      </div>
      <div className="tw-grid">
        {loading && <div className="loading-block">Loading configs…</div>}
        {!loading && cards.map((c) => (
          <div key={c.name} className="tw-card">
            <div className="tw-card-head">
              <div className="tw-card-name">{c.name}</div>
            </div>
            <div className="tw-card-body">
              <div className="tw-line">SWIDs: <strong>{c.swidCount}</strong></div>
              <div className="tw-line">Avg Pass: <strong>{c.passAvg}%</strong></div>
              <div className="tw-line">Updated: <strong>{c.updated}</strong></div>
            </div>
            <div className="tw-card-actions">
              <button className="view-btn" onClick={() => onViewConfig && onViewConfig(project, test, c.name)}>View Details</button>
              <button className="btn-secondary" onClick={() => setConfigToAddSwid(c.name)}>+ Add SWID</button>
            </div>
          </div>
        ))}
      </div>
      {showAddConfig && (
        <InputModal
          title="Add System Configuration"
          prompt={`Select a configuration to add under ${project} / ${test}`}
          useDropdown
          options={availableConfigOptions}
          onClose={() => setShowAddConfig(false)}
          onSubmit={async (name) => {
            try {
              await addSystemConfig(project, test, name);
              setShowAddConfig(false);
              setRefreshToken(t => t + 1);
            } catch (e) {
              setShowAddConfig(false);
            }
          }}
        />
      )}
      {configToAddSwid && (
        <InputModal
          title="Add SWID"
          prompt={`Enter SWID to upload for ${project} / ${test} / ${configToAddSwid}`}
          placeholder="e.g., 1678"
          onClose={() => setConfigToAddSwid(null)}
          onSubmit={(swid) => {
            setConfigToAddSwid(null);
            onCreateSwidContext && onCreateSwidContext({ project, test, systemConfig: configToAddSwid, swid });
          }}
        />
      )}
    </section>
  );
}
