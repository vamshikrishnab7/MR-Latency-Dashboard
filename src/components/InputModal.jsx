import React, { useState, useEffect } from 'react';

// Supports either free-text input or a dropdown select when `options` provided.
export default function InputModal({ title, prompt, placeholder, initialValue = '', useDropdown, options, onClose, onSubmit }) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (useDropdown && options?.length && !value) {
      setValue(options[0]);
    }
  }, [useDropdown, options, value]);

  function handleSubmit(e) {
    e.preventDefault();
    if (value.trim()) {
      onSubmit(value.trim());
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{useDropdown ? 'Select a test type' : title}</h3>
          <button className="modal-close-btn" onClick={onClose} type="button">×</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            {useDropdown ? (
              <select
                className="modal-input"
                value={value}
                onChange={e => setValue(e.target.value)}
                autoFocus
              >
                {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : (
              <div className="input-group">
                <label className="input-label">Enter value</label>
                <input
                  type="text"
                  className="modal-input"
                  placeholder={placeholder}
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  autoFocus
                />
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={!value.trim()}>
                Submit
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
