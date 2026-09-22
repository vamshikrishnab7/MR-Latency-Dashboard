# Comparison View Feature

## Overview
The Comparison View allows you to analyze performance trends across multiple SWIDs for the same test cases. This feature helps track how performance changes over different software builds.

## How It Works

### 1. **View Toggle**
- Two main views available:
  - **📤 Upload & Summary**: Upload new files and view individual summaries
  - **📊 Comparison View**: Compare performance across all stored SWIDs

### 2. **Data Structure**
The comparison system works by:
- **Test Identity**: Each test is uniquely identified by:
  - Protocol Name
  - Exam Card Name
  - Protocol Name_1
  - Req Description
  
- **Grouping**: Tests are organized in a hierarchy:
  - System Configuration → Protocol Name → Exam Card → Individual Tests

### 3. **Using Comparison View**

#### Step 1: Select Protocol
Choose a protocol from the dropdown to see all exam cards under that protocol.

#### Step 2: Select Exam Card
Pick an exam card to see all tests associated with it.

#### Step 3: View Test Details
Click on any test card to see:
- Test metadata (Protocol 1, Requirement Description, Benchmark value)
- Performance trend chart

### 4. **Trend Chart**

The chart displays:
- **Dotted Gray Line**: Benchmark (target performance requirement)
- **Blue Solid Line**: Actual results across SWIDs
- **X-Axis**: SWIDs (sorted alphabetically)
- **Y-Axis**: Time in seconds

#### Interpreting Results:
- **Below benchmark line**: Test is faster than requirement ✓ (GOOD)
- **Above benchmark line**: Test is slower than requirement ✗ (NEEDS ATTENTION)
- **Flat line**: Consistent performance across SWIDs
- **Upward trend**: Performance degrading (getting slower)
- **Downward trend**: Performance improving (getting faster)

### 5. **Tooltip Information**
Hover over any data point to see:
- SWID name
- Actual result time
- Benchmark time
- Percentage change with color coding:
  - Green: Negative % (faster than benchmark)
  - Red: Positive % (slower than benchmark)

## Technical Implementation

### Key Files:
- `src/components/ComparisonView.jsx` - Main comparison interface
- `src/components/TrendChart.jsx` - Chart component using Recharts
- `src/comparisonUtils.js` - Data aggregation and processing utilities

### Data Flow:
1. Fetch all stored results from IndexedDB
2. Build comparison matrix (testId → SWID → values)
3. Group by protocol and exam card
4. Render selectors and charts

### Dependencies:
- **recharts**: Chart visualization library
- **IndexedDB**: Stores all uploaded SWID results locally

## Future Enhancements

Possible additions:
- Multi-SWID selection (compare only selected SWIDs)
- Export comparison data to Excel
- Statistical analysis (trend lines, regression detection)
- Filter by date range
- Performance score/ranking system
- Side-by-side protocol comparison
- Alert system for significant regressions

## Notes

- Only tests that exist in multiple SWIDs will show meaningful trends
- SWIDs are sorted alphanumerically by default
- Benchmark values must be identical across SWIDs for valid comparison
- Missing data points are not connected in the chart (gaps will appear)
