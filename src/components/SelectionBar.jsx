import React, { useEffect, useState } from 'react';
import { getProjects, getTests, getSystemConfigs } from '../sqlDb.js';

export default function SelectionBar({ value, onChange, refreshToken, hideSystemConfig = false }) {
  const [projects, setProjects] = useState([]);
  const [tests, setTests] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [selectedProject, setSelectedProject] = useState(value?.project || '');
  const [selectedTest, setSelectedTest] = useState(value?.test || '');
  const [selectedConfig, setSelectedConfig] = useState(value?.systemConfig || '');
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadProjects(); }, [refreshToken]);

  useEffect(() => {
    // Sync with parent's value changes
    if (value?.project !== selectedProject) setSelectedProject(value?.project || '');
    if (value?.test !== selectedTest) setSelectedTest(value?.test || '');
    if (value?.systemConfig !== selectedConfig) setSelectedConfig(value?.systemConfig || '');
  }, [value]);

  async function loadProjects() {
    setLoading(true);
    try {
      const p = await getProjects();
      setProjects(p.map(x => x.name));
      const initialProj = value?.project || '';
      if (initialProj) {
        setSelectedProject(initialProj);
        await loadTests(initialProj, true);
      }
    } finally { 
      setLoading(false);
    }
  }

  async function loadTests(projectName, isInitialLoad = false) {
    const t = await getTests(projectName);
    setTests(t.map(x => x.name));
    const initialTest = isInitialLoad ? (value?.test || '') : '';
    if (isInitialLoad && initialTest) {
      setSelectedTest(initialTest);
      await loadConfigs(projectName, initialTest, true);
    }
  }

  async function loadConfigs(projectName, testName, isInitialLoad = false) {
    const c = await getSystemConfigs(projectName, testName);
    setConfigs(c.map(x => x.name));
    if (isInitialLoad) {
      const initialCfg = value?.systemConfig || '';
      setSelectedConfig(initialCfg);
    }
  }

  function handleProjectChange(e) {
    const proj = e.target.value;
    setSelectedProject(proj);
    setSelectedTest('');
    setSelectedConfig('');
    setTests([]);
    setConfigs([]);
    if (proj) {
      loadTests(proj, false);
    }
    onChange && onChange({ project: proj, test: '', systemConfig: '' });
  }

  function handleTestChange(e) {
    const test = e.target.value;
    setSelectedTest(test);
    setSelectedConfig('');
    setConfigs([]);
    if (test) {
      loadConfigs(selectedProject, test, false);
    }
    onChange && onChange({ project: selectedProject, test, systemConfig: '' });
  }

  function handleConfigChange(e) {
    const cfg = e.target.value;
    setSelectedConfig(cfg);
    onChange && onChange({ project: selectedProject, test: selectedTest, systemConfig: cfg });
  }

  return (
    <div className="selection-bar">
      <div className="select-group">
        <label className="select-label"><span className="select-icon">📁</span> Project</label>
        <select className="select-input" value={selectedProject} onChange={handleProjectChange} disabled={loading || projects.length === 0}>
          <option value="">Select Project</option>
          {projects.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="select-group">
        <label className="select-label"><span className="select-icon">🧩</span> Test</label>
        <select className="select-input" value={selectedTest} onChange={handleTestChange} disabled={loading || tests.length === 0}>
          <option value="">Select Test</option>
          {tests.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {!hideSystemConfig && (
        <div className="select-group">
          <label className="select-label"><span className="select-icon">🎛️</span> System Config</label>
          <select className="select-input" value={selectedConfig} onChange={handleConfigChange} disabled={loading || configs.length === 0}>
            <option value="">Select Config</option>
            {configs.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
