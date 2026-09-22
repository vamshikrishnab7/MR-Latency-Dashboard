import React, { useState, useEffect } from 'react';
import { getAllResults } from '../sqlDb';
import { buildComparisonMatrix, filterBySystemConfig } from '../comparisonUtils';
import CptDatasetChart from './CptDatasetChart.jsx';
import ProtocolBarChart from './ProtocolBarChart.jsx';

export default function ComparisonView({ project, test, systemConfig, refreshToken }) {
  const [comparisonMatrix, setComparisonMatrix] = useState(null);
  const [allTests, setAllTests] = useState([]); // full unique test rows with metadata
  const [selectedTestId, setSelectedTestId] = useState(null); // expanded row
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [project, test, systemConfig, refreshToken]);

  async function load() {
    setLoading(true);
    try {
      const all = await getAllResults();
      // Normalize parsed_data from JSON strings
      const normalized = all.map(r => {
        let data = r.data || r.parsed_data;
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch {}
        }
        return { ...r, data };
      });
      let filtered = normalized;
      if (project) filtered = filtered.filter(r => r.project === project);
      if (test) filtered = filtered.filter(r => r.test === test);
      if (systemConfig) filtered = filterBySystemConfig(filtered, systemConfig);
      
      if (!filtered.length) { 
        setComparisonMatrix(null); 
        setAllTests([]); 
        return; 
      }
      
      const matrix = buildComparisonMatrix(filtered, test);
      setComparisonMatrix(matrix);

      const orderedTestIds = Array.from(matrix.testIndex.keys());
      
      const flatList = orderedTestIds.map(testId => {
        const testDetails = matrix.testIndex.get(testId) || {};
        const swidData = matrix.comparisonData.get(testId) || {};
        
        if (test === 'cpt test') {
          const firstEntry = Object.values(swidData)[0] || {};
          const datasetName = (testDetails.dataset || firstEntry.meta?.dataset || testId || '').trim();
          const benchmarkVal = testDetails.benchmark ?? firstEntry.meta?.benchmark ?? null;
          return {
            testId,
            dataset: datasetName || '—',
            benchmark: benchmarkVal,
            swidData
          };
        }

        const firstMeta = Object.values(swidData)[0]?.meta || {};
        return {
          testId,
          protocol: testDetails.protocol || firstMeta.protocol || '',
          examCard: testDetails.examCard || firstMeta.examCard || '',
          reqDesc: testDetails.reqDesc || firstMeta.reqDesc || '',
          protocol1: testDetails.protocol1 || firstMeta.protocol1 || '',
          benchmark: testDetails.benchmark ?? firstMeta.benchmark ?? null,
          coilsUsed: testDetails.coilsUsed || firstMeta.coilsUsed || '',
          swidData
        };
      });
      setAllTests(flatList);

    } catch (e) {
      console.error('Error loading comparison data:', e);
    } finally { setLoading(false); }
  }

  function handleViewChart(e, testId) {
    e.stopPropagation();
    setSelectedTestId(selectedTestId === testId ? null : testId);
  }

  if (loading) {
    return <div className="comparison-view"><div className="loading-block">Loading comparison data...</div></div>;
  }
  if (!comparisonMatrix) {
    return <div className="comparison-view"><div className="loading-block">No data available. Upload files to populate comparison.</div></div>;
  }

  const { swidList } = comparisonMatrix;

  if (test === 'cpt test') {
    return (
      <div className="comparison-view-fullwidth">
        <h2 className="comparison-title">📊 CPT Test Comparison</h2>
        {systemConfig && <div className="system-badge">System: {systemConfig}</div>}
        <div className="swid-count">{swidList.length} SWID{swidList.length !== 1 ? 's' : ''} stored</div>

        <div className="protocol-table-wrapper-fullwidth">
          <table className="protocol-table-fullwidth">
            <thead>
              <tr>
                <th>#</th>
                <th>Dataset</th>
                <th>Default (ALM)</th>
                <th style={{width:'140px', textAlign:'center'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {allTests.map((test, idx) => {
                const isExpanded = selectedTestId === test.testId;
                return (
                  <React.Fragment key={test.testId}>
                    <tr className={isExpanded ? 'expanded-row' : ''}>
                      <td style={{textAlign:'right', fontWeight:'600'}}>{idx + 1}</td>
                      <td><strong>{test.dataset || '—'}</strong></td>
                      <td>{test.benchmark != null ? Number(test.benchmark).toFixed(2) : '—'}</td>
                      <td style={{textAlign:'center'}}>
                        <button
                          className="view-chart-btn"
                          onClick={(e) => handleViewChart(e, test.testId)}
                        >
                          {isExpanded ? '▼ Hide' : '▶ View Chart'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (() => {
                      // Compute aggregated metrics for CPT test
                      const values = swidList
                        .map(swid => test.swidData[swid]?.result)
                        .filter(v => v != null && !isNaN(v));
                      
                      const avg = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
                      const min = values.length > 0 ? Math.min(...values) : null;
                      const max = values.length > 0 ? Math.max(...values) : null;
                      const stdDev = values.length > 1 
                        ? Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length)
                        : null;
                      
                      // Pass/fail counts for CPT
                      let pass = 0, fail = 0;
                      if (test.benchmark != null) {
                        values.forEach(v => {
                          if (v <= test.benchmark) pass++;
                          else fail++;
                        });
                      }

                      return (
                      <tr className="protocol-expand-row">
                        <td colSpan={4}>
                          <div className="protocol-expand-inner">
                            {/* Metrics Summary for CPT Dataset */}
                            <div className="metrics-summary-card">
                              <h4 className="metrics-summary-title">📊 Dataset Metrics Summary</h4>
                              <div className="metrics-grid">
                                <div className="metric-item">
                                  <div className="metric-label">Average (Runs 1-5)</div>
                                  <div className="metric-value">{avg != null ? avg.toFixed(2) : 'N/A'}<span className="metric-unit">ms</span></div>
                                </div>
                                <div className="metric-item">
                                  <div className="metric-label">Min</div>
                                  <div className="metric-value">{min != null ? min.toFixed(2) : 'N/A'}<span className="metric-unit">ms</span></div>
                                </div>
                                <div className="metric-item">
                                  <div className="metric-label">Max</div>
                                  <div className="metric-value">{max != null ? max.toFixed(2) : 'N/A'}<span className="metric-unit">ms</span></div>
                                </div>
                                <div className="metric-item">
                                  <div className="metric-label">Std Dev</div>
                                  <div className="metric-value">{stdDev != null ? stdDev.toFixed(3) : 'N/A'}<span className="metric-unit">ms</span></div>
                                </div>
                                {test.benchmark != null && (
                                  <>
                                    <div className="metric-item">
                                      <div className="metric-label">Default (ALM)</div>
                                      <div className="metric-value">{Number(test.benchmark).toFixed(2)}<span className="metric-unit">ms</span></div>
                                    </div>
                                    <div className="metric-item">
                                      <div className="metric-label">Avg Δ</div>
                                      <div className="metric-value" style={{color: avg <= test.benchmark ? '#10b981' : '#dc2626'}}>
                                        {avg != null ? (avg > test.benchmark ? '+' : '') + (avg - test.benchmark).toFixed(2) : 'N/A'}<span className="metric-unit">ms</span>
                                      </div>
                                    </div>
                                    <div className="metric-item pass-count">
                                      <div className="metric-label">✓ Pass</div>
                                      <div className="metric-value">{pass}<span className="metric-unit">/ {values.length}</span></div>
                                    </div>
                                    <div className="metric-item fail-count">
                                      <div className="metric-label">✗ Fail</div>
                                      <div className="metric-value">{fail}<span className="metric-unit">/ {values.length}</span></div>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>

                            <CptDatasetChart
                              dataset={test.dataset}
                              swidList={swidList}
                              testData={test}
                            />
                          </div>
                        </td>
                      </tr>
                      );
                    })()}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="comparison-view-fullwidth">
      <h2 className="comparison-title">📊 Protocol Performance Comparison</h2>
      {systemConfig && <div className="system-badge">System: {systemConfig}</div>}
      <div className="swid-count">{swidList.length} SWID{swidList.length !== 1 ? 's' : ''} stored</div>

      <div className="protocol-table-wrapper-fullwidth">
        <table className="protocol-table-fullwidth">
          <thead>
            <tr>
              <th>#</th>
              <th>Exam Card Name</th>
              <th>Protocol Name</th>
              <th>Requirement Description</th>
              <th>Benchmark (sec)</th>
              <th>Coils Used</th>
              <th style={{width:'140px', textAlign:'center'}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {allTests.length === 0 && (
              <tr>
                <td colSpan={7} style={{textAlign: 'center', padding: '2rem', color: '#64748b'}}>
                  No test data available. Please upload files to view comparisons.
                </td>
              </tr>
            )}
            {allTests.map((test, idx) => {
              const isExpanded = selectedTestId === test.testId;
              return (
                <React.Fragment key={test.testId}>
                  <tr className={isExpanded ? 'expanded-row' : ''}>
                    <td style={{textAlign:'right', fontWeight:'600'}}>{idx + 1}</td>
                    <td>{test.examCard || '—'}</td>
                    <td><strong>{test.protocol || '—'}</strong></td>
                    <td className="desc-cell">{test.reqDesc || '—'}</td>
                    <td>{test.benchmark != null ? test.benchmark : '—'}</td>
                    <td>{test.coilsUsed || '—'}</td>
                    <td style={{textAlign:'center'}}>
                      <button
                        className="view-chart-btn"
                        onClick={(e) => handleViewChart(e, test.testId)}
                      >
                        {isExpanded ? '▼ Hide' : '▶ View Chart'}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (() => {
                    // Compute aggregated metrics across all SWIDs
                    const values = swidList
                      .map(swid => test.swidData[swid]?.result)
                      .filter(v => v != null && !isNaN(v));
                    
                    const avg = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
                    const min = values.length > 0 ? Math.min(...values) : null;
                    const max = values.length > 0 ? Math.max(...values) : null;
                    const stdDev = values.length > 1 
                      ? Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length)
                      : null;
                    
                    // Pass/fail classification counts
                    let strictPass = 0, deviationPass = 0, fail = 0;
                    if (test.benchmark != null) {
                      values.forEach(v => {
                        if (v <= test.benchmark) strictPass++;
                        else if ((v - test.benchmark) <= 5) deviationPass++;
                        else fail++;
                      });
                    }

                    return (
                    <tr className="protocol-expand-row">
                      <td colSpan={7}>
                        <div className="protocol-expand-inner">
                          {/* Metrics Summary Section */}
                          <div className="metrics-summary-card">
                            <h4 className="metrics-summary-title">📈 Exam Card Metrics Summary</h4>
                            <div className="metrics-grid">
                              <div className="metric-item">
                                <div className="metric-label">Average</div>
                                <div className="metric-value">{avg != null ? avg.toFixed(2) : 'N/A'}<span className="metric-unit">sec</span></div>
                              </div>
                              <div className="metric-item">
                                <div className="metric-label">Min</div>
                                <div className="metric-value">{min != null ? min.toFixed(2) : 'N/A'}<span className="metric-unit">sec</span></div>
                              </div>
                              <div className="metric-item">
                                <div className="metric-label">Max</div>
                                <div className="metric-value">{max != null ? max.toFixed(2) : 'N/A'}<span className="metric-unit">sec</span></div>
                              </div>
                              <div className="metric-item">
                                <div className="metric-label">Std Dev</div>
                                <div className="metric-value">{stdDev != null ? stdDev.toFixed(3) : 'N/A'}<span className="metric-unit">sec</span></div>
                              </div>
                              {test.benchmark != null && (
                                <>
                                  <div className="metric-item">
                                    <div className="metric-label">Benchmark</div>
                                    <div className="metric-value">{test.benchmark}<span className="metric-unit">sec</span></div>
                                  </div>
                                  <div className="metric-item">
                                    <div className="metric-label">Avg Δ</div>
                                    <div className="metric-value" style={{color: avg <= test.benchmark ? '#10b981' : '#dc2626'}}>
                                      {avg != null ? (avg > test.benchmark ? '+' : '') + (avg - test.benchmark).toFixed(2) : 'N/A'}<span className="metric-unit">sec</span>
                                    </div>
                                  </div>
                                  <div className="metric-item pass-count">
                                    <div className="metric-label">✓ Pass (Strict)</div>
                                    <div className="metric-value">{strictPass}<span className="metric-unit">/ {values.length}</span></div>
                                  </div>
                                  <div className="metric-item deviation-count">
                                    <div className="metric-label">✓ Pass with Deviation (max(5s/10%))</div>
                                    <div className="metric-value">{deviationPass}<span className="metric-unit">/ {values.length}</span></div>
                                  </div>
                                  <div className="metric-item fail-count">
                                    <div className="metric-label">✗ Fail</div>
                                    <div className="metric-value">{fail}<span className="metric-unit">/ {values.length}</span></div>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="expand-chart-block">
                            <h4 className="expand-chart-title">Measured Recon Latency (sec) across available SWIDs</h4>
                            <div className="chart-and-data-container">
                              <div className="chart-wrapper">
                                <ProtocolBarChart
                                  protocol={`${test.examCard} | ${test.protocol}`}
                                  swidList={swidList}
                                  testData={test}
                                />
                              </div>
                              <div className="data-table-wrapper">
                                <table className="mini-data-table">
                                  <thead>
                                    <tr>
                                      <th>SWID</th>
                                      <th>Measured Recon Latency (sec)</th>
                                      {test.benchmark != null && <th>Δ vs Benchmark (sec)</th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {swidList.map(swid => {
                                      const entry = test.swidData[swid];
                                      let resultVal = entry ? entry.result : null;
                                      const delta = (resultVal != null && test.benchmark != null) ? (resultVal - test.benchmark) : null;
                                      let classificationClass = '';
                                      if (resultVal != null && test.benchmark != null) {
                                        if (resultVal <= test.benchmark) classificationClass = 'strict-pass-row';
                                        else if ((resultVal - test.benchmark) <= 5) classificationClass = 'deviation-pass-row';
                                        else classificationClass = 'fail-row';
                                      }
                                      return (
                                        <tr key={swid} className={classificationClass}>
                                          <td>{swid}</td>
                                          <td>{resultVal != null ? resultVal.toFixed(2) : 'N/A'}</td>
                                          {test.benchmark != null && <td>{delta != null ? (delta > 0 ? '+' : '') + delta.toFixed(2) : 'N/A'}</td>}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                    );
                  })()}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

