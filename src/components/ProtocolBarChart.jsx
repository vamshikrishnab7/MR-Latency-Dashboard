import React from 'react';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Legend, ReferenceLine, Cell, Label } from 'recharts';

function barColor(result, benchmark) {
  if (result == null || benchmark == null) return '#cbd5e1';
  if (result <= benchmark) return '#10b981'; // strict pass -> green
  const diff = result - benchmark;
  if (diff <= 5) return '#facc15'; // deviation pass -> yellow
  return '#dc2626'; // fail -> red
}

// Renders measured recon latency bars with benchmark reference line.
export default function ProtocolBarChart({ protocol, swidList = [], testData }) {
  const benchmark = testData?.benchmark ?? null; // assume constant benchmark across SWIDs
  let data = [];
  try {
    if (testData && testData.swidData) {
      data = swidList.map(swid => {
        const entry = testData.swidData[swid];
        let resultVal = entry ? entry.result : null;
        // If missing result show null (will render as empty bar space) - could choose 0 but user wants true absence
        return {
          swid,
          result: resultVal != null && !Number.isNaN(resultVal) ? parseFloat(Number(resultVal).toFixed(2)) : null,
          fill: barColor(resultVal, benchmark)
        };
      });
    } else if (Array.isArray(testData)) {
      // Fallback if an array of data points { swid, result }
      data = testData.map(dp => {
        const r = dp && dp.result != null ? Number(dp.result) : null;
        return {
          swid: dp.swid,
            result: r != null && !Number.isNaN(r) ? parseFloat(r.toFixed(2)) : null,
          fill: barColor(r, benchmark)
        };
      });
    }
  } catch (err) {
    console.error('Error constructing latency chart data:', err);
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>
        Failed to render chart for {protocol || '(unknown)'}.
      </div>
    );
  }

  // Compute scaling upper bound ensuring benchmark visible even if greater than all measured results
  const maxResult = data.reduce((m, d) => d.result != null && d.result > m ? d.result : m, 0);
  const upperBound = (() => {
    if (benchmark != null) {
      const ref = Math.max(maxResult, benchmark);
      return ref === 0 ? 1 : parseFloat((ref * 1.15).toFixed(2)); // 15% headroom
    }
    return maxResult === 0 ? 1 : parseFloat((maxResult * 1.15).toFixed(2));
  })();

  if (!data || data.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
        No data available for this test
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const item = payload[0].payload;
    const belowOrEqual = benchmark != null && item.result != null && item.result <= benchmark;
    const deviationPass = benchmark != null && item.result != null && item.result > benchmark && (item.result - benchmark) <= 5;
    const fail = benchmark != null && item.result != null && item.result > benchmark && (item.result - benchmark) > 5;
    return (
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', padding:'0.6rem 0.75rem', borderRadius:8, boxShadow:'0 4px 12px rgba(0,0,0,0.1)' }}>
        <div style={{ fontWeight:600, marginBottom:4 }}>{item.swid}</div>
        <div style={{ fontSize:12 }}>Measured: {item.result != null ? `${item.result}s` : 'N/A'}</div>
        {benchmark != null && (
          <div style={{ fontSize:12 }}>Benchmark: {benchmark}s</div>
        )}
        {item.result != null && benchmark != null && (
          <div style={{
            marginTop:4,
            fontWeight:600,
            color: belowOrEqual ? '#065f46' : deviationPass ? '#92400e' : fail ? '#b91c1c' : '#475569'
          }}>
            {belowOrEqual && '✓ Pass (benchmark)'}
            {deviationPass && `✓ Pass (deviation +${(item.result - benchmark).toFixed(2)}s)`}
            {fail && `✗ Fail (+${(item.result - benchmark).toFixed(2)}s)`}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="protocol-bar-chart">
      {benchmark != null && (
        <div style={{
          position:'absolute',
          top:4,
          right:8,
          zIndex:10,
          background:'#ffffffd9',
          backdropFilter:'blur(2px)',
          border:'1px solid #cbd5e1',
          padding:'2px 8px',
          borderRadius:6,
          fontSize:12,
          fontWeight:600,
          color:'#1e3a8a',
          boxShadow:'0 2px 4px rgba(0,0,0,0.08)'
        }}>Benchmark: {benchmark}s</div>
      )}
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="swid" tick={{ fontSize:12, fill:'#64748b' }} interval={0} angle={-35} textAnchor="end" height={70} />
          <YAxis domain={[0, upperBound]} tick={{ fontSize:12, fill:'#64748b' }} label={{ value:'Measured Recon Latency (sec)', angle:-90, position:'insideLeft', fill:'#64748b' }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize:12 }} />
          {benchmark != null && (
            <ReferenceLine y={benchmark} stroke="#1e3a8a" strokeWidth={3} strokeDasharray="6 6">
              <Label
                position="top"
                value={`Benchmark ${benchmark}s`}
                style={{
                  fill:'#1e3a8a',
                  fontSize:12,
                  fontWeight:700,
                  background:'#fff',
                  padding: '2px 6px',
                  borderRadius:4,
                  filter:'drop-shadow(0 1px 2px rgba(0,0,0,0.15))'
                }}
              />
            </ReferenceLine>
          )}
          <Bar dataKey="result" name="Measured Recon Latency (sec)" isAnimationActive barSize={22}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
