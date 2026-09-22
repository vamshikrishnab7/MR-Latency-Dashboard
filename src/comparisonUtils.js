// Utility functions for cross-SWID comparison and trend analysis

/**
 * Create a unique identifier for each test case based on its characteristics
 */
export function generateTestId(row, testType) {
  // For CPT tests, the unique identifier is the 'Dataset'
  if (testType === 'cpt test') {
    const dataset = safeGet(row, ['Dataset']);
    if (dataset) return dataset.trim().toLowerCase();
  }

  // Recon/other tests: Make ID stable by Exam Card + Protocol only
  // Rationale: reqDesc/protocol1/coil variations should not collapse distinct exam cards,
  // and differences there are shown in row details, not identity.
  const protocol = safeGet(row, ['Protocol Name', 'Protocol', 'ProtocolName']);
  const examCard = safeGet(row, ['Exam Card Name', 'Exam Card', 'ExamCardName', 'ExamCard', 'Exam Card']);
  const reqDesc = safeGet(row, [
    'Full Requirement Description',
    'Full Requirement Desc',
    'Full Req Description',
    'Requirement Description',
    'Req Description',
    'ReqDescription',
    'Req Desc',
    'Requirement Desc'
  ]);
  const p = (protocol || '').trim().toLowerCase();
  const e = (examCard || '').trim().toLowerCase();
  // Fallback: if both exam card and protocol are missing, use requirement description to index
  if (!e && !p) {
    const r = (reqDesc || '').trim().toLowerCase();
    return r || '';
  }
  return `${e}|${p}`;
}

// Normalization helper for flexible header matching
function safeGet(obj, possibleKeys, def='') {
  if (!obj) return def;
  const keys = Object.keys(obj);
  // 1. Exact case-sensitive
  for (const k of possibleKeys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return String(obj[k]).trim();
  }
  // Build normalized map (lowercase + trimmed)
  const normMap = keys.reduce((acc, key) => { acc[key.toLowerCase().trim()] = key; return acc; }, {});
  // 2. Exact case-insensitive (trimmed)
  for (const k of possibleKeys) {
    const nk = k.toLowerCase().trim();
    if (normMap[nk]) {
      const val = obj[normMap[nk]];
      if (val !== undefined && val !== null && val !== '') return String(val).trim();
    }
  }
  // 3. Fuzzy startsWith match (handles long benchmark headers etc.)
  for (const header of keys) {
    const hNorm = header.toLowerCase().trim();
    for (const k of possibleKeys) {
      const kNorm = k.toLowerCase().trim();
      if (hNorm.startsWith(kNorm)) {
        const val = obj[header];
        if (val !== undefined && val !== null && val !== '') return String(val).trim();
      }
    }
  }
  // 4. Substring contains heuristic (space-insensitive)
  for (const header of keys) {
    const hNorm = header.toLowerCase().replace(/\s+/g,'');
    for (const k of possibleKeys) {
      const kNorm = k.toLowerCase().replace(/\s+/g,'');
      if (hNorm.includes(kNorm)) {
        const val = obj[header];
        if (val !== undefined && val !== null && val !== '') return String(val).trim();
      }
    }
  }
  return def;
}

/**
 * Parse numeric value from string (handles percentages, removes spaces)
 */
export function parseNumeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const str = String(value).trim().replace('%', '').replace(/\s+/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

/**
 * Build comparison matrix: aggregates data from all stored SWIDs
 * Returns: {
 *   testIndex: Map of testId -> test details
 *   comparisonData: Map of testId -> { swid1: value, swid2: value, ... }
 *   protocols: Array of unique protocol names
 *   swidList: Array of all SWIDs (sorted)
 * }
 */
export function buildComparisonMatrix(allResults, testType) {
  const testIndex = new Map(); // testId -> { protocol, examCard, benchmark, reqDesc, protocol1, coilsUsed }
  const comparisonData = new Map(); // testId -> { swid: resultValue }
  const protocolsSet = new Set();
  const swidsSet = new Set();

  // First, collect all possible test cases from all results
  allResults.forEach(result => {
    const { data } = result;
    if (!data || !Array.isArray(data)) return;
    data.forEach(row => {
      const testId = generateTestId(row, testType);
      if (testId && !testIndex.has(testId)) {
        testIndex.set(testId, {}); // Initialize with an empty object
      }
    });
  });

  // Now, iterate again to populate the data completely
  allResults.forEach(result => {
    const { swid, systemConfig, data } = result;
    swidsSet.add(swid);

    if (!data || !Array.isArray(data)) return;

    data.forEach(row => {
      const testId = generateTestId(row, testType);
      if (!testId) return;

      if (testType === 'cpt test') {
        const datasetOriginal = safeGet(row, ['Dataset']) || testId; // preserve original casing for display
        const resultValue = parseNumeric(safeGet(row, ['average']));
        const benchmark = parseNumeric(safeGet(row, ['Default (ALM)']));

        if (!comparisonData.has(testId)) {
          comparisonData.set(testId, {});
        }
        comparisonData.get(testId)[swid] = {
          result: resultValue,
          benchmark,
          systemConfig,
          meta: {
            dataset: datasetOriginal,
            benchmark
          }
        };
        if (!testIndex.has(testId)) {
          testIndex.set(testId, {
            dataset: datasetOriginal,
            benchmark
          });
        }
        return;
      }

      const protocol = safeGet(row, ['Protocol Name', 'Protocol', 'ProtocolName']);
      const examCard = safeGet(row, ['Exam Card Name', 'Exam Card', 'ExamCardName', 'ExamCard', 'Exam Card']);
      const benchmark = parseNumeric(safeGet(row, [
        'Benchmark (sec)',
        'Benchmark',
        'Benchmark Target',
        'Target Benchmark',
        'Expected Benchmark',
        'Benchmark Value',
        'Benchmark Performance Requirement Values 12CORE Z4G5 CHR+GPU (sec)',
        'Benchmark Performance Requirement Values 12CORE Z4G4 CHR+GPU (sec)',
        'Benchmark Performance Requirement Values'
      ]));
      const resultValue = parseNumeric(safeGet(row, [
        'Result (sec)',
        'Result',
        'Recon Time (sec)',
        'Result Seconds',
        'Actual Result (sec)',
        'Measured Recon Latency (sec)',
        'Measured Recon Latency',
        'Recon Latency (sec)',
        'Recon Latency'
      ]));
      let percentChange = parseNumeric(safeGet(row, ['% change', '% Change', 'Change %', 'Change', 'Percent Change']));
      const coilsUsed = safeGet(row, ['Coils Used', 'Coil', 'Coils']);
      const reqDesc = safeGet(row, [
        'Full Requirement Description',
        'Full Requirement Desc',
        'Full Req Description',
        'Requirement Description',
        'Req Description',
        'ReqDescription',
        'Req Desc',
        'Requirement Desc',
        'Description',
        'Desc',
        'Full Req Desc',
        'Full Description',
        'Requirement',
        'Full Requirement'
      ]);
      const protocol1 = safeGet(row, ['Protocol Name_1', 'Protocol Name 1', 'ProtocolName_1']);

      if (!reqDesc || reqDesc === '') {
        const allKeys = Object.keys(row);
        const descKeys = allKeys.filter(k => k.toLowerCase().includes('req') || k.toLowerCase().includes('desc'));
        if (descKeys.length > 0) {
          console.log('Found potential description keys:', descKeys, 'for row:', { protocol, examCard });
          console.log('Sample values:', descKeys.map(k => `${k}: ${row[k]}`));
        }
      }

      protocolsSet.add(protocol);

      if ((percentChange === null || percentChange === undefined) && resultValue != null && benchmark != null && benchmark !== 0) {
        percentChange = ((resultValue - benchmark) / benchmark) * 100;
      }

      const existingDetails = testIndex.get(testId) || {};
      testIndex.set(testId, {
        protocol: protocol || existingDetails.protocol || '',
        examCard: examCard || existingDetails.examCard || '',
        benchmark: benchmark ?? existingDetails.benchmark,
        reqDesc: reqDesc || existingDetails.reqDesc || '',
        protocol1: protocol1 || existingDetails.protocol1 || '',
        coilsUsed: coilsUsed || existingDetails.coilsUsed || ''
      });

      if (!comparisonData.has(testId)) {
        comparisonData.set(testId, {});
      }
      comparisonData.get(testId)[swid] = {
        result: resultValue,
        percentChange: percentChange,
        systemConfig,
        meta: {
          protocol,
          examCard,
          reqDesc,
          protocol1,
          benchmark,
          coilsUsed
        }
      };
    });
  });

  const swidList = Array.from(swidsSet).sort();
  const protocols = Array.from(protocolsSet).sort();

  return {
    testIndex,
    comparisonData,
    protocols,
    swidList
  };
}

/**
 * Group tests by protocol and exam card
 * Returns nested structure for easier visualization
 */
export function groupTestsByProtocol(testIndex, comparisonData, swidList) {
  const grouped = {};

  testIndex.forEach((testDetails, testId) => {
    const { protocol, examCard } = testDetails;
    
    if (!grouped[protocol]) {
      grouped[protocol] = {};
    }
    
    if (!grouped[protocol][examCard]) {
      grouped[protocol][examCard] = [];
    }

    // Build data points for this test across all SWIDs
    const dataPoints = swidList.map(swid => {
      const swidData = comparisonData.get(testId)?.[swid];
      return {
        swid,
        result: swidData?.result || null,
        percentChange: swidData?.percentChange || null
      };
    });

    grouped[protocol][examCard].push({
      testId,
      ...testDetails,
      dataPoints
    });
  });

  return grouped;
}

/**
 * Calculate statistics for a protocol across all SWIDs
 */
export function calculateProtocolStats(tests, swidList) {
  const stats = {};

  swidList.forEach(swid => {
    const values = tests
      .flatMap(test => test.dataPoints)
      .filter(dp => dp.swid === swid && dp.percentChange !== null)
      .map(dp => dp.percentChange);

    if (values.length === 0) {
      stats[swid] = { avg: null, passed: 0, failed: 0, total: 0 };
      return;
    }

    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    const passed = values.filter(v => v < 0).length;
    const failed = values.filter(v => v > 0).length;

    stats[swid] = {
      avg: parseFloat(avg.toFixed(2)),
      passed,
      failed,
      total: values.length
    };
  });

  return stats;
}

/**
 * Filter comparison data by system configuration
 */
export function filterBySystemConfig(allResults, systemConfig) {
  return allResults.filter(r => r.systemConfig === systemConfig);
}

/**
 * Build exam card aggregates: average percentChange per examCard per SWID.
 * Returns: {
 *   examCardAggregates: { [examCard]: { [swid]: avgPercentChange } },
 *   examCardProtocols: { [examCard]: Set<string> of protocols seen }
 * }
 */
export function buildExamCardAggregates(testIndex, comparisonData) {
  const examCardAggregates = {};
  const examCardProtocols = {};

  testIndex.forEach((details, testId) => {
    const { examCard, protocol } = details;
    if (!examCard) return; // skip empty exam card identifiers
    const swidEntries = comparisonData.get(testId);
    if (!swidEntries) return;
    Object.entries(swidEntries).forEach(([swid, data]) => {
      const pc = data?.percentChange;
      if (pc === null || pc === undefined || Number.isNaN(pc)) return;
      if (!examCardAggregates[examCard]) {
        examCardAggregates[examCard] = {};
        examCardProtocols[examCard] = new Set();
      }
      examCardProtocols[examCard].add(protocol || '');
      if (!examCardAggregates[examCard][swid]) {
        examCardAggregates[examCard][swid] = { sum: 0, count: 0 };
      }
      examCardAggregates[examCard][swid].sum += pc;
      examCardAggregates[examCard][swid].count += 1;
    });
  });

  // Convert to averages
  Object.keys(examCardAggregates).forEach(examCard => {
    Object.keys(examCardAggregates[examCard]).forEach(swid => {
      const { sum, count } = examCardAggregates[examCard][swid];
      examCardAggregates[examCard][swid] = count > 0 ? (sum / count) : null;
    });
  });

  return { examCardAggregates, examCardProtocols };
}
