import React, { useState, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import FileDropZone from './components/FileDropZone.jsx';
import SideMenu from './components/SideMenu.jsx';
import SelectionBar from './components/SelectionBar.jsx';
import ComparisonView from './components/ComparisonView.jsx';
import TestWorkspace from './components/TestWorkspace.jsx';
import ConfigDashboard from './components/ConfigDashboard.jsx';
import ExcelModal from './components/ExcelModal.jsx';
import SystemConfigStatusView from './components/SystemConfigStatusView.jsx';
// Use SQL backend for deletes to keep UI in sync
import { deleteResultFull } from './sqlDb.js';
import InputModal from './components/InputModal.jsx';
// SQLite-only data layer
import * as sqlApi from './sqlDb.js';
const { addResultFull, getResultFull, resultExistsFull, addSystemConfig, getSystemConfigs } = sqlApi;

export default function App() {
  useEffect(() => {
    (async () => {
      // Ping backend for connectivity and surface a quick notice if unreachable
      try {
        await sqlApi.getProjects();
      } catch (e) {
        console.warn('Backend unreachable:', e?.message || e);
        showNotification('Backend not reachable. Please start server.');
      }
    })();
  }, []);
  const [fileName, setFileName] = useState('');
  const [rowCount, setRowCount] = useState(0);
  const [passCount, setPassCount] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [passStrictCount, setPassStrictCount] = useState(0); // passes meeting benchmark directly
  const [passDeviationCount, setPassDeviationCount] = useState(0); // passes using deviation tolerance
  const [passDeviationRows, setPassDeviationRows] = useState([]); // rows that passed within deviation tolerance
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedTest, setSelectedTest] = useState('');
  const [statusColumnPresent, setStatusColumnPresent] = useState(true);
  const [failedRows, setFailedRows] = useState([]);
  const [swid, setSwid] = useState('');
  const [systemConfig, setSystemConfig] = useState('');
  // Filters from SelectionBar (kept independent from loaded SWID context)
  const [filterProject, setFilterProject] = useState('MR Main');
  const [filterTest, setFilterTest] = useState('Recon Latency');
  const [filterSystemConfig, setFilterSystemConfig] = useState('Z4G5 12C');

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [notification, setNotification] = useState('');
  const [newSwidContext, setNewSwidContext] = useState(null); // {project,test,systemConfig,swid}
  const [swidPromptContext, setSwidPromptContext] = useState(null); // {project,test,systemConfig}
  const [treeRefreshToken, setTreeRefreshToken] = useState(0);
  // Notification helper placed before any callbacks that reference it to avoid TDZ errors
  function showNotification(message) {
    setNotification(message);
    setTimeout(() => setNotification(''), 1500);
  }

  const handleCreateSwidContext = useCallback((ctx) => {
    setNewSwidContext(ctx);
    showNotification(`Ready to upload for SWID ${ctx.swid}`);
  }, []);

  // Moved above callbacks that consume it to avoid temporal dead zone errors.
  const processRows = useCallback((json, testName) => {
    // Filter out completely empty rows
    const nonEmpty = json.filter(row => Object.values(row).some(v => v !== '' && v != null));
    const normalize = (h='') => h.toString().toLowerCase().replace(/[^a-z0-9]/g,'');
    const deviationLimit = (benchmarkValue) => Math.max(5, Math.abs(benchmarkValue) * 0.10);
    const headers = nonEmpty.length ? Object.keys(nonEmpty[0]) : [];

    // Branch on test type: Recon Latency vs CPT
    const isCpt = (testName || selectedTest || '').toLowerCase().includes('cpt');
    if (isCpt) {
      // CPT expects 'average' and 'Default (ALM)' columns
      const avgKey = headers.find(h => normalize(h)==='average');
      const benchKey = headers.find(h => normalize(h).includes('default') && normalize(h).includes('alm')) || headers.find(h => normalize(h)==='defaultalm');

      let rows = 0;
      let pass = 0;
      let fail = 0;
      let passStrict = 0;
      let passDeviation = 0;
      const deviationRows = [];
      const failedDetailRows = [];

      nonEmpty.forEach(row => {
        const avgRaw = row[avgKey];
        const benchRaw = row[benchKey];
        const avg = typeof avgRaw === 'number' ? avgRaw : parseFloat(String(avgRaw).replace(/[^0-9.+-]/g,''));
        const bench = typeof benchRaw === 'number' ? benchRaw : parseFloat(String(benchRaw).replace(/[^0-9.+-]/g,''));
        if (Number.isNaN(avg) || Number.isNaN(bench)) return;
        rows += 1;
        if (avg <= bench) {
          pass += 1;
          passStrict += 1;
        } else {
          const diff = avg - bench;
          const withinDeviation = diff <= deviationLimit(bench);
          if (withinDeviation) {
            pass += 1;
            passDeviation += 1;
            deviationRows.push({ ...row, __average: avg, __benchmark: bench, __delta: diff });
          } else {
            fail += 1;
            failedDetailRows.push({ ...row, __average: avg, __benchmark: bench, __delta: diff });
          }
        }
      });

      setRowCount(rows);
      setPassCount(pass);
      setFailCount(fail);
      setPassStrictCount(passStrict);
      setPassDeviationCount(passDeviation);
      setPassDeviationRows(deviationRows);
      setFailedRows(failedDetailRows);
      setStatusColumnPresent(!!(avgKey && benchKey));
      return;
    }

    // Recon Latency path (existing)
    const benchmarkKey = headers.find(h => normalize(h).includes('benchmark') && normalize(h).includes('performance')) || headers.find(h => normalize(h)==='benchmarkperformancevalue');
    const measuredKey = headers.find(h => normalize(h).includes('measured') && (normalize(h).includes('recon') || normalize(h).includes('latency'))) || headers.find(h => normalize(h)==='measuredreconlatencyvalue');

    let examCards = 0;
    let pass = 0;
    let fail = 0;
    let passStrict = 0;
    let passDeviation = 0;
    const deviationRows = [];
    const failedDetailRows = [];

    const skippedRows = [];
    nonEmpty.forEach(row => {
      let benchRaw = row[benchmarkKey];
      let measRaw = row[measuredKey];
      const bench = typeof benchRaw === 'number' ? benchRaw : parseFloat(String(benchRaw).replace(/[^0-9.+-]/g,''));
      const meas = typeof measRaw === 'number' ? measRaw : parseFloat(String(measRaw).replace(/[^0-9.+-]/g,''));
      if (Number.isNaN(bench) || Number.isNaN(meas)) {
        skippedRows.push({ row, benchRaw, measRaw, reason: 'Invalid numeric values' });
        return; // skip rows without numeric values
      }
      examCards += 1;
      if (meas <= bench) {
        pass += 1;
        passStrict += 1;
      } else {
        const diff = meas - bench;
        const withinDeviation = diff <= deviationLimit(bench);
        if (withinDeviation) {
          pass += 1;
          passDeviation += 1;
          deviationRows.push({ ...row, __benchmark: bench, __measured: meas, __delta: diff });
        } else {
          fail += 1;
          failedDetailRows.push({ ...row, __benchmark: bench, __measured: meas, __delta: diff });
        }
      }
    });

    setRowCount(examCards);
    setPassCount(pass);
    setFailCount(fail);
    setPassStrictCount(passStrict);
    setPassDeviationCount(passDeviation);
    setPassDeviationRows(deviationRows);
    setFailedRows(failedDetailRows);
    setStatusColumnPresent(!!(benchmarkKey && measuredKey));
    
    // Log skipped rows for debugging
    if (skippedRows.length > 0) {
      console.warn(`⚠️ Skipped ${skippedRows.length} rows due to invalid numeric values:`, skippedRows);
    }
  }, [selectedTest]);

  const handleContextUpload = useCallback(async (wb, fileMeta) => {
    if (!newSwidContext) return;
    // Normalize inputs before insert
    let { project, test, systemConfig: cfg, swid: swidValue } = newSwidContext;
    project = (project || '').trim();
    test = (test || '').trim();
    cfg = (cfg || '').trim();
    swidValue = (swidValue || '').trim();
    if (!project || !test || !cfg || !swidValue) {
      showNotification('Missing project/test/config/SWID');
      return;
    }
    setSelectedProject(project);
    setSelectedTest(test);
    // Also set filter selection so ComparisonView reflects newly uploaded data
    setFilterProject(project);
    setFilterTest(test);
    setFilterSystemConfig(cfg);
    // Ensure system config exists without triggering 409 (pre-check then add)
    try {
      const existingCfgs = await getSystemConfigs(project, test);
      const hasCfg = existingCfgs.some(c => (c?.name || '').toLowerCase().trim() === cfg.toLowerCase().trim());
      if (hasCfg) {
        showNotification('Configuration already exists');
      } else {
        await addSystemConfig(project, test, cfg);
      }
    } catch (e) {
      console.warn('addSystemConfig check/add failed:', e?.message || e);
    }
    const firstSheet = wb.SheetNames[0];
    const sheet = wb.Sheets[firstSheet];
    if (!sheet) { showNotification('No sheet found.'); return; }
    const json = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
    try {
      if (await resultExistsFull(project, test, cfg, swidValue)) {
        showNotification('SWID already exists');
      } else {
        await addResultFull(project, test, cfg, swidValue, fileMeta.name, json);
        showNotification('Context upload saved');
        setNewSwidContext(null);
        setTreeRefreshToken(t => t + 1); // trigger side menu, tw-grid, and config-dashboard refresh
        // Immediately load the uploaded SWID to show stats
        await handleSelectSwid(project, test, cfg, swidValue);
      }
    } catch (e) {
      console.error('addResultFull failed:', e);
      const detail = e?.message || (e?.status ? `status ${e.status}` : '');
      showNotification(`Save failed${detail ? `: ${detail}` : ''}`);
    }
  }, [newSwidContext, resultExistsFull]);


  const handleSelectSwid = useCallback(async (project, test, systemConfig, swid) => {
    const result = await getResultFull(project, test, systemConfig, swid);
    if (result) {
      setSelectedProject(project);
      setSelectedTest(test);
      // Normalize filename/data fields across backends
      const normFileName = result.fileName || result.original_filename || '';
      let normData = result.data || result.parsed_data || [];
      if (typeof normData === 'string') {
        try { normData = JSON.parse(normData); } catch {}
      }
      setFileName(normFileName);
      setSwid(result.swid);
      // Server /results/full returns raw row without joined names; use the passed param
      setSystemConfig(systemConfig);
      processRows(normData, test);
      setIsMenuOpen(false);
      showNotification(`Loaded: ${project} / ${test} / ${systemConfig} / ${swid}`);
    }
  }, [processRows]);

  const baseName = fileName.replace(/\.[^.]+$/, '');

  // Handle selection from the SelectionBar – only set filter state
  function handleSelectionChange(sel) {
    setFilterProject(sel.project || '');
    setFilterTest(sel.test || '');
    setFilterSystemConfig(sel.systemConfig || '');
  }

  const handleHierarchyChange = useCallback(() => {
    setTreeRefreshToken(t => t + 1);
  }, []);

  // Simple view state: 'home' | 'test' | 'config' | 'swid'
  const [view, setView] = useState('home');
  const [navProject, setNavProject] = useState('');
  const [navTest, setNavTest] = useState('');
  const [navConfig, setNavConfig] = useState('');
  const [excelModalRows, setExcelModalRows] = useState(null);
  const [excelModalTitle, setExcelModalTitle] = useState('');
  // Upload modal removed for now

  function handleSelectTest(project, test) {
    setNavProject(project);
    setNavTest(test);
    setView('test');
    setIsMenuOpen(false);
  }

  // Config view handler not used for now

  // Upload modal disabled

  return (
    <div className="app-container">
      {!isMenuOpen && <button className="menu-toggle-btn" onClick={() => setIsMenuOpen(true)}>☰</button>}
      <SideMenu
        isOpen={isMenuOpen}
        toggleMenu={() => setIsMenuOpen(!isMenuOpen)}
        onSelectSwid={handleSelectSwid}
        onSelectTest={handleSelectTest}
        onCreateSwidContext={handleCreateSwidContext}
        treeRefreshToken={treeRefreshToken}
        onHierarchyChange={handleHierarchyChange}
        onError={showNotification}
      />
      {notification && (
        <div className={`notification ${notification.toLowerCase().includes('already exists') || notification.toLowerCase().includes('error') || notification.toLowerCase().includes('failed') ? 'error' : ''}`}>
          {notification}
        </div>
      )}

      {/* Home button outside header, top-right */}
      <button
        className="home-btn"
        title="Go to Home"
        onClick={() => {
          setView('home');
          setFilterProject('MR Main');
          setFilterTest('Recon latency');
          setFilterSystemConfig('Z4G5 12C');
          setSelectedProject('');
          setSelectedTest('');
          setSystemConfig('');
          setSwid('');
          setRowCount(0);
          setPassCount(0);
          setFailCount(0);
          setPassStrictCount(0);
          setPassDeviationCount(0);
          setPassDeviationRows([]);
          setFailedRows([]);
        }}
      >🏠</button>

      <header>
        <h1 className="app-title">MR Latency Dashboard</h1>
      </header>

      <main className="dashboard-main">
        {view === 'test' && (
          <TestWorkspace
            project={navProject}
            test={navTest}
            onViewConfig={(p,t,c) => { setNavProject(p); setNavTest(t); setNavConfig(c); setView('config'); }}
            onCreateSwidContext={handleCreateSwidContext}
            onBack={() => {
              setView('home');
              setNavProject('');
              setNavTest('');
              setNavConfig('');
              setSelectedProject('');
              setSelectedTest('');
              setSystemConfig('');
              setSwid('');
              setRowCount(0);
              setPassCount(0);
              setFailCount(0);
              setPassStrictCount(0);
              setPassDeviationCount(0);
              setPassDeviationRows([]);
              setFailedRows([]);
              setFilterProject('MR Main');
              setFilterTest('Recon latency');
              setFilterSystemConfig('Z4G5 12C');
            }}
            refreshToken={treeRefreshToken}
          />
        )}
        {view === 'config' && navProject && navTest && navConfig && (
          <ConfigDashboard
            project={navProject}
            test={navTest}
            systemConfig={navConfig}
            onBack={(p,t) => { setNavProject(p); setNavTest(t); setView('test'); }}
            onOpenSwid={(p,t,c,sw) => {
              // Load selected SWID directly into stats grid
              handleSelectSwid(p,t,c,sw);
            }}
            onUploadNew={(p,t,c) => {
              // Prompt for SWID explicitly; filename is stored only as metadata
              setSwidPromptContext({ project:p, test:t, systemConfig:c });
            }}
            onDeleteSwid={async (p,t,c,sw) => {
              try {
                console.log('[DELETE] Attempting to delete:', { p, t, c, sw });
                await deleteResultFull(p,t,c,sw);
                console.log('[DELETE] Successfully deleted');
                // If the deleted SWID is currently loaded, clear stats
                if (swid === sw && systemConfig === c && selectedProject === p && selectedTest === t) {
                  setSwid('');
                  setRowCount(0);
                  setPassCount(0);
                  setFailCount(0);
                  setPassStrictCount(0);
                  setPassDeviationCount(0);
                  setPassDeviationRows([]);
                  setFailedRows([]);
                }
                showNotification(`Deleted SWID ${sw}`);
                setTreeRefreshToken(x => x + 1); // refresh side menu, config dashboard, and tw-grid
              } catch (e) {
                console.error('[DELETE] Failed:', e);
                showNotification(`Delete failed: ${e?.message || 'Unknown error'}`);
              }
            }}
            onViewExcel={async (p,t,c,sw) => {
              try {
                const res = await getResultFull(p,t,c,sw);
                const rows = res?.data || res?.parsed_data || [];
                setExcelModalRows(rows);
                setExcelModalTitle(`Excel: ${p} / ${t} / ${c} / ${sw}`);
              } catch (e) {
                console.error(e);
                showNotification('Unable to open Excel view');
              }
            }}
            refreshToken={treeRefreshToken}
          />
        )}
        {swidPromptContext && (
          <InputModal
            title="Add SWID"
            prompt={`Enter SWID to upload for ${swidPromptContext.project} / ${swidPromptContext.test} / ${swidPromptContext.systemConfig}`}
            placeholder="e.g., 1678"
            onClose={() => setSwidPromptContext(null)}
            onSubmit={(swidVal) => {
              setSwidPromptContext(null);
              setNewSwidContext({
                project: swidPromptContext.project,
                test: swidPromptContext.test,
                systemConfig: swidPromptContext.systemConfig,
                swid: swidVal
              });
            }}
          />
        )}
        {newSwidContext && (
          <div className="context-upload-card">
            <div className="card-header-section">
              <div className="card-title">
                <span className="upload-icon">📤</span>
                Upload New Data
              </div>
              <button className="cancel-context-btn-top" onClick={() => setNewSwidContext(null)} title="Cancel upload">✕</button>
            </div>
            <div className="upload-info-grid">
              <div className="info-item">
                <span className="info-label">Project</span>
                <span className="info-value">{newSwidContext.project}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Test Type</span>
                <span className="info-value">{newSwidContext.test}</span>
              </div>
              <div className="info-item">
                <span className="info-label">System Config</span>
                <span className="info-value">{newSwidContext.systemConfig}</span>
              </div>
              <div className="info-item">
                <span className="info-label">SWID</span>
                <span className="info-value swid-highlight">{newSwidContext.swid}</span>
              </div>
            </div>
            <div className="dropzone-section">
              <FileDropZone
                onLoaded={(wb, meta) => handleContextUpload(wb, { name: meta?.name || 'uploaded.xlsx' })}
                customContent={
                  <div className="drop-content">
                    <p className="drop-text"><strong>Drag & Drop</strong> your Excel file here</p>
                    <p className="drop-subtext">or <span className="browse-link">click to browse</span></p>
                    <span className="file-types">Excel files only (.xlsx, .xls, .csv)</span>
                  </div>
                }
              />
            </div>
          </div>
        )}
        {view === 'config' && swid && (
        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Project</div>
            <div className="stat-value">{selectedProject || 'N/A'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Test Name</div>
            <div className="stat-value">{selectedTest || baseName || 'N/A'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">System Config</div>
            <div className="stat-value">{systemConfig || 'N/A'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">SWID</div>
            <div className="stat-value">{swid || 'N/A'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Exam Cards</div>
            <div className="stat-value">{rowCount || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Passed (Total)</div>
            <div className="stat-value good">{passCount}</div>
          </div>
          {passDeviationCount > 0 && (
            <div className="stat-card">
              <div className="stat-label">Pass Deviation</div>
              <div className="stat-value good">{passDeviationCount}</div>
            </div>
          )}
          <div className="stat-card">
            <div className="stat-label">Failed</div>
            <div className="stat-value bad">{failCount}</div>
          </div>
        </section>
        )}

        {/* Selection bar shown here: below stats, above view-toggle */}
        {view === 'home' && (
          <SelectionBar 
            value={{ project: filterProject, test: filterTest, systemConfig: filterSystemConfig }} 
            onChange={handleSelectionChange}
            refreshToken={treeRefreshToken}
          />
        )}

        {/* System Config Status View - shows when project and test are selected */}
        {view === 'home' && filterProject && filterTest && (
          <SystemConfigStatusView 
            project={filterProject} 
            test={filterTest} 
            refreshToken={treeRefreshToken}
            onDotClick={(p, t, c, sw) => {
              setNavProject(p);
              setNavTest(t);
              setNavConfig(c);
              setView('config');
              handleSelectSwid(p, t, c, sw);
            }}
          />
        )}

        {/* Removed top positive/negative change tables since % change no longer drives pass/fail */}

        {view === 'config' && statusColumnPresent && passDeviationRows.length > 0 && (
          <section className="data-card full-width">
            <div className="data-card-head good">Passed With Deviation ({passDeviationRows.length})</div>
            <div className="data-table-scroll large">
              <table className="mini-data-table">
                <thead>
                  <tr>{Object.keys(passDeviationRows[0]).filter(k => !k.toLowerCase().includes('description') && k !== '__benchmark' && k !== '__measured').map(k => <th key={k}>{k === '__delta' ? 'Delta' : k}</th>)}</tr>
                </thead>
                <tbody>
                  {passDeviationRows.map((r, idx) => (
                    <tr key={idx}>{Object.keys(r).filter(k => !k.toLowerCase().includes('description') && k !== '__benchmark' && k !== '__measured').map(k => {
                      const v = r[k];
                      const fmt = (k.toLowerCase().includes('measured recon latency') || k === '__delta') && typeof v === 'number' ? v.toFixed(3) : v;
                      return <td key={k}>{fmt}</td>;
                    })}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {view === 'config' && statusColumnPresent && failedRows.length > 0 && (
          <section className="data-card full-width">
            <div className="data-card-head bad">Failed ({failedRows.length})</div>
            <div className="data-table-scroll large">
              <table className="mini-data-table">
                <thead>
                  <tr>{Object.keys(failedRows[0]).filter(k => !k.toLowerCase().includes('description') && k !== '__benchmark' && k !== '__measured').map(k => <th key={k}>{k === '__delta' ? 'Delta' : k}</th>)}</tr>
                </thead>
                <tbody>
                  {failedRows.map((r, idx) => (
                    <tr key={idx}>{Object.keys(r).filter(k => !k.toLowerCase().includes('description') && k !== '__benchmark' && k !== '__measured').map(k => {
                      const v = r[k];
                      const fmt = (k.toLowerCase().includes('measured recon latency') || k === '__delta') && typeof v === 'number' ? v.toFixed(3) : v;
                      return <td key={k}>{fmt}</td>;
                    })}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Show ComparisonView for specific system config Z4G5 12C when no system config is selected */}
        {view === 'home' && filterProject && filterTest && !filterSystemConfig && (
          <ComparisonView project={filterProject} test={filterTest} systemConfig="Z4G5 12C" refreshToken={treeRefreshToken} />
        )}

        {/* Show single ComparisonView when specific system config is selected */}
        {view === 'home' && filterProject && filterTest && filterSystemConfig && (
          <ComparisonView project={filterProject} test={filterTest} systemConfig={filterSystemConfig} refreshToken={treeRefreshToken} />
        )}

        {excelModalRows && (
          <ExcelModal
            title={excelModalTitle}
            rows={excelModalRows}
            onClose={() => { setExcelModalRows(null); setExcelModalTitle(''); }}
          />
        )}
      </main>
      {/* Upload modal removed for now */}
    </div>
  );
}
