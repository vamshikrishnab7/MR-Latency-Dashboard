import React, { useRef, useState, useCallback } from 'react';
import * as XLSX from 'xlsx';

export default function FileDropZone({ onLoaded, customContent }) {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFiles = useCallback(async (fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    if (fileList.length > 1) {
      setError('Please upload only one file.');
      return;
    }
    setError('');
    setIsProcessing(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      setFileName(file.name);
      onLoaded(wb, { name: file.name });
    } catch (err) {
      setError('Failed to process file.');
    } finally {
      setIsProcessing(false);
    }
  }, [onLoaded]);

  const onInputChange = (e) => {
    handleFiles(e.target.files);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = e.dataTransfer.files;
    handleFiles(files);
  };

  return (
    <div className="dropzone-wrapper">
      <div
        className={`dropzone ${dragActive ? 'drag-active' : ''} ${isProcessing ? 'processing' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !isProcessing && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display:'none' }}
          onChange={onInputChange}
          disabled={isProcessing}
        />
        <div className="drag-overlay">✨ Drop to upload ✨</div>
        <div className="dropzone-content">
          {isProcessing ? (
            <>
              <div className="icon" aria-hidden>⏳</div>
              <p><strong>Processing file...</strong></p>
            </>
          ) : (
            <>
              <div className="icon" aria-hidden>📄</div>
              {!fileName && (
                customContent ? customContent : (
                  <p><strong>Drag & Drop</strong> your Excel/CSV file here<br/>or <span className="browse">browse</span> to select</p>
                )
              )}
              {fileName && <p className="file-name">✅ Loaded: {fileName}</p>}
              <small className="hint">Single file only. Supports .xlsx .xls .csv</small>
            </>
          )}
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    </div>
  );
}
