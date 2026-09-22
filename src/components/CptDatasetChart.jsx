import React from 'react';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Legend, ReferenceLine, Label, Cell } from 'recharts';

function barColor(result, benchmark) {
  if (result === null || result === undefined || benchmark === null || benchmark === undefined) return '#a0aec0'; // Neutral for missing data
  if (result <= benchmark) return '#48bb78'; // Green for pass (at or below benchmark)
  return '#f56565'; // Red for fail
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="custom-tooltip" style={{ background: '#fff', border: '1px solid #ccc', padding: '10px' }}>
        <p className="label"><strong>{`SWID: ${label}`}</strong></p>
        <p className="intro">{`Average: ${data.average != null ? data.average.toFixed(2) : 'N/A'}`}</p>
        {data.benchmark !== null && <p className="desc">{`Default (ALM): ${Number(data.benchmark).toFixed(2)}`}</p>}
      </div>
    );
  }
  return null;
};

export default function CptDatasetChart({ dataset, swidList = [], testData }) {
  const benchmark = testData?.benchmark ?? null;
  const datasetName = testData?.dataset || '';
  
  const data = swidList.map(swid => {
    const swidData = testData.swidData[swid];
    const average = swidData ? swidData.result : null;
    return {
      swid,
      average,
      benchmark,
      fill: barColor(average, benchmark)
    };
  });

  const maxResult = data.reduce((max, d) => (d.average > max ? d.average : max), 0);
  const upperBound = Math.max(maxResult, benchmark || 0) * 1.2;

  return (
    <div className="cpt-dataset-chart">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="swid" angle={-45} textAnchor="end" interval={0} />
          <YAxis domain={[0, upperBound]} label={{ value: 'Average (runs 1-5)', angle: -90, position: 'insideLeft' }} tickFormatter={(v)=>Number(v).toFixed(2)} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {benchmark !== null && (
            <ReferenceLine y={benchmark} stroke="#1f2937" strokeDasharray="6 3">
              <Label value={`Default (ALM): ${Number(benchmark).toFixed(2)}`} position="insideTopLeft" />
            </ReferenceLine>
          )}
          <Bar dataKey="average" fill="#8884d8">
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {datasetName && (
        <div className="chart-caption" style={{ marginTop: '6px', color: '#334155' }}>
          Dataset: <strong>{datasetName}</strong>{benchmark != null ? ` • Default (ALM): ${Number(benchmark).toFixed(2)}` : ''}
        </div>
      )}
    </div>
  );
}
