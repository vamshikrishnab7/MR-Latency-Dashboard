import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

/**
 * TrendChart - Shows performance trend across SWIDs with benchmark as dotted line
 * Props:
 *   - testData: { benchmark, dataPoints: [{ swid, result, percentChange }] }
 *   - title: Chart title
 */
export default function TrendChart({ testData, title }) {
  if (!testData || !testData.dataPoints || testData.dataPoints.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
        No data available for comparison
      </div>
    );
  }

  const { benchmark, dataPoints } = testData;

  // Prepare chart data
  const chartData = dataPoints.map(dp => ({
    swid: dp.swid,
    result: dp.result,
    benchmark: benchmark, // Constant baseline
    percentChange: dp.percentChange
  }));

  // Custom tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;

    const data = payload[0].payload;
    
    return (
      <div style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '0.75rem',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
      }}>
        <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#1e293b' }}>
          {data.swid}
        </div>
        <div style={{ fontSize: '0.875rem', color: '#475569' }}>
          <div>Result: <strong>{data.result !== null ? `${data.result.toFixed(2)}s` : 'N/A'}</strong></div>
          <div>Benchmark: <strong>{benchmark ? `${benchmark.toFixed(2)}s` : 'N/A'}</strong></div>
          {data.percentChange !== null && (
            <div style={{ 
              color: data.percentChange < 0 ? '#059669' : data.percentChange > 0 ? '#dc2626' : '#64748b',
              fontWeight: 600,
              marginTop: '0.25rem'
            }}>
              {data.percentChange > 0 ? '+' : ''}{data.percentChange.toFixed(2)}%
              {data.percentChange < 0 ? ' (Faster ✓)' : data.percentChange > 0 ? ' (Slower ✗)' : ' (Same)'}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ width: '100%', height: '400px', padding: '1rem' }}>
      <h3 style={{ 
        margin: '0 0 1rem 0', 
        fontSize: '1.1rem', 
        fontWeight: 600, 
        color: '#1e293b' 
      }}>
        {title}
      </h3>
      <ResponsiveContainer width="100%" height="90%">
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis 
            dataKey="swid" 
            tick={{ fontSize: 12, fill: '#64748b' }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis 
            label={{ value: 'Time (seconds)', angle: -90, position: 'insideLeft', style: { fill: '#64748b' } }}
            tick={{ fontSize: 12, fill: '#64748b' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="line"
          />
          
          {/* Benchmark as dotted reference line */}
          <Line 
            type="monotone" 
            dataKey="benchmark" 
            stroke="#94a3b8" 
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            name="Benchmark (Target)"
          />
          
          {/* Actual results */}
          <Line 
            type="monotone" 
            dataKey="result" 
            stroke="#3b82f6" 
            strokeWidth={3}
            dot={{ fill: '#3b82f6', r: 5 }}
            activeDot={{ r: 7 }}
            name="Actual Result"
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
