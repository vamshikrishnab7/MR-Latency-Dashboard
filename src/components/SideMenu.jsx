import React, { useState, useEffect } from 'react';
import InputModal from './InputModal.jsx';
import {
  getAllResults,
  getProjects,
  getTests,
  getSystemConfigs,
  addProject,
  addTest,
  addSystemConfig,
  deleteProject,
} from '../sqlDb.js';

// Build hierarchical tree from meta + results
function buildHierarchy(projects, testsMap, sysCfgMap, results) {
  const root = { name: 'Projects', type: 'root', children: [] };
  const resultsByPath = {};
  results.forEach(r => {
    const sysCfgName = r.systemConfig || r.system_config; // support new metadata field
    const key = `${r.project}||${r.test}||${sysCfgName}`;
    if (!resultsByPath[key]) resultsByPath[key] = [];
    resultsByPath[key].push(r);
  });

  const projectNodes = projects.map(project => {
    const projNode = { name: project.name, type: 'project', project: project.name, children: [] };
    const tests = testsMap[project.name] || [];
    
    const testNodes = tests.map(test => {
      // Only two levels (project -> test); no system configs or SWIDs in sidebar
      const testNode = { name: test.name, type: 'test', project: project.name, test: test.name, children: [] };
      // Attach high-level counts for context
      const sysConfigs = sysCfgMap[`${project.name}||${test.name}`] || [];
      const cfgNames = new Set(sysConfigs.map(s => s.name));
      testNode.configCount = cfgNames.size;
      const swidTotal = Array.from(cfgNames).reduce((acc, cfgName) => {
        const resKey = `${project.name}||${test.name}||${cfgName}`;
        return acc + ((resultsByPath[resKey] || []).length);
      }, 0);
      testNode.swidTotal = swidTotal;
      return testNode;
    }).sort((a, b) => a.name.localeCompare(b.name));

    projNode.children.push(...testNodes);
    projNode.children.push({ name: 'Add New Test', type: 'action-add-test', project: project.name });
    projNode.testCount = testNodes.length;
    projNode.swidTotal = testNodes.reduce((acc, t) => acc + (t.swidTotal || 0), 0);
    return projNode;
  }).sort((a, b) => a.name.localeCompare(b.name));

  root.children.push(...projectNodes);
  // Sidebar tree intentionally limited to two levels; actions removed
  return root;
}

function TreeNode({ node, onSelectSwid, onSelectTest, onAction, onDeleteProject, level = 0 }) {
  // Expand root, project, and test levels by default for better visibility
  const [isOpen, setIsOpen] = useState(level <= 2);
  const hasChildren = node.children && node.children.length > 0;

  const handleClick = () => {
    if (node.type?.startsWith('action')) {
      onAction(node);
      return;
    }
    if (node.type === 'swid') {
      onSelectSwid(node.project, node.test, node.systemConfig, node.swid);
      return;
    }
    if (node.type === 'test') {
      onSelectTest && onSelectTest(node.project, node.test);
      return;
    }
    if (hasChildren) setIsOpen(prev => !prev);
  };

  // Determine badge content
  // Display SWID count badge only at system configuration level (requested)
  let metaBadge = null;
  if (node.type === 'systemConfig') {
    metaBadge = <span className="count-badge" title="SWID count">{node.swidCount || 0} SWIDs</span>;
  }

  return (
    <div className={`tree-node level-${level}`} aria-expanded={hasChildren ? isOpen : undefined}>
      <div className={`tree-node-label ${!hasChildren ? 'leaf' : ''} ${node.type?.startsWith('action') ? 'action-node' : ''}`} onClick={handleClick}>
        {hasChildren && !node.type?.startsWith('action') && (
          <span className={`toggle-icon ${isOpen ? 'open' : ''}`} aria-hidden>
            {isOpen ? '▾' : '▸'}
          </span>
        )}
        {node.type === 'swid' && (
          <span className="leaf-icon" aria-hidden>
            {/* file icon */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 2v6h6" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        )}
        <span className="node-name">{node.name}</span>
        {metaBadge}
        {node.type === 'project' && (
          <button className="tree-delete-btn" title={`Delete project ${node.name}`} onClick={(e) => { e.stopPropagation(); onDeleteProject && onDeleteProject(node.name); }}>×</button>
        )}
      </div>
      {hasChildren && (
        <div className={`tree-node-children ${isOpen ? 'open' : 'closed'}`}> 
          {isOpen && node.children.map((child, idx) => (
            <TreeNode key={idx} node={child} onSelectSwid={onSelectSwid} onSelectTest={onSelectTest} onAction={onAction} onDeleteProject={onDeleteProject} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SideMenu({ onSelectSwid, onSelectTest, isOpen, toggleMenu, onCreateSwidContext, treeRefreshToken, onHierarchyChange, onError }) {
  const [tree, setTree] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [notify, setNotify] = useState('');
  const [inputModal, setInputModal] = useState(null); // { mode, node }
  const [busy, setBusy] = useState(false);
  // Predefined selectable sets
  const testTypeOptions = ['Recon Latency', 'cpt test'];
  // Enforced global naming for system configs
  const systemConfigOptions = ['Z4G4 10C', 'Z4G5 12C', 'Z4G4 6C'];

  useEffect(() => { if (isOpen) loadTree(); }, [isOpen, treeRefreshToken]);

  async function loadTree() {
    setLoading(true);
    try {
      const [projects, allResults] = await Promise.all([
        getProjects(),
        getAllResults()
      ]);
      // Build tests & sysCfg maps
      const testsMap = {};
      const sysCfgMap = {};
      for (const p of projects) {
        const tests = await getTests(p.name);
        testsMap[p.name] = tests;
        for (const t of tests) {
          const key = `${p.name}||${t.name}`;
          const configs = await getSystemConfigs(p.name, t.name);
          sysCfgMap[key] = configs;
        }
      }
      const hierarchy = buildHierarchy(projects, testsMap, sysCfgMap, allResults);
      setTree(hierarchy);
    } catch (e) {
      console.error('Failed loading hierarchy', e);
    } finally { setLoading(false); }
  }

  function showTemp(msg) {
    setNotify(msg);
    setTimeout(() => setNotify(''), 1800);
  }

  function filterTree(node, term) {
    if (!term) return node;
    const match = node.name.toLowerCase().includes(term.toLowerCase());
    if (match && node.type !== 'root') return node;
    if (node.children) {
      const kids = node.children.map(c => filterTree(c, term)).filter(Boolean);
      if (kids.length) return { ...node, children: kids };
    }
    return null;
  }

  async function handleModalSubmit(value) {
    if (!inputModal || !value) {
      setInputModal(null);
      return;
    }
    const { mode, node } = inputModal;
    
    // Close modal immediately to show busy state
    setInputModal(null);
    setBusy(true);
    
    try {
      switch (mode) {
        case 'add-project':
          await addProject(value);
          showTemp(`Project '${value}' added`);
          break;
        case 'add-test':
          {
            // Check if test already exists
            const existingTests = await getTests(node.project);
            const testExists = existingTests.some(t => t.name.toLowerCase() === value.toLowerCase());
            if (testExists) {
              if (onError) {
                onError(`Test '${value}' already exists in this project`);
              }
              setBusy(false);
              return;
            }
            await addTest(node.project, value);
            showTemp(`Test '${value}' added`);
          }
          break;
        case 'add-systemconfig':
          {
            const res = await addSystemConfig(node.project, node.test, value);
            if (res && res.__existing) {
              showTemp(`Config '${value}' already exists in this test`);
            } else {
              showTemp(`Config '${value}' added`);
            }
          }
          break;
        case 'add-swid':
          onCreateSwidContext({ ...node, swid: value });
          toggleMenu(); // Close menu to show upload zone
          setBusy(false);
          return; // Don't reload tree for SWID creation
      }
      
      // Reload tree and notify parent
      await loadTree();
      if (onHierarchyChange) {
        onHierarchyChange();
      }
    } catch (e) {
      console.error('Error in handleModalSubmit:', e);
      showTemp(`Error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  function handleAction(node) {
    const type = node.type.replace('action-', '');
    let modalConfig = { mode: type, node, title: '', prompt: '', placeholder: '' };
    switch (type) {
      case 'add-project':
        modalConfig = { ...modalConfig, title: 'Add New Project', prompt: 'Enter project name:', placeholder: 'e.g., MR7' };
        break;
      case 'add-test':
        modalConfig = { ...modalConfig, title: 'Add New Test', prompt: 'Select or enter test type:', useDropdown: true, options: testTypeOptions };
        break;
      case 'add-systemconfig':
        modalConfig = { ...modalConfig, title: 'Add New System Config', prompt: 'Select or enter system config:', useDropdown: true, options: systemConfigOptions };
        break;
      case 'add-swid':
        modalConfig = { ...modalConfig, title: 'Add New SWID', prompt: 'Enter SWID version:', placeholder: 'e.g., R11.1.2.3' };
        break;
      default: return;
    }
    setInputModal(modalConfig);
  }

  const visibleTree = searchTerm ? filterTree(tree, searchTerm) : tree;

  async function handleDeleteProject(projectName) {
    if (!window.confirm(`Delete project "${projectName}" and all its tests, configs, and results?`)) return;
    setBusy(true);
    try {
      await deleteProject(projectName);
      showTemp(`Project '${projectName}' deleted`);
      await loadTree();
      if (onHierarchyChange) onHierarchyChange();
    } catch (e) {
      console.error('Delete project failed:', e);
      showTemp(`Delete failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className={`side-menu ${isOpen ? 'open' : 'closed'}`}>
      <div className="menu-header-compact">
        <div className="menu-branding">
          <span className="menu-logo" aria-hidden>
            {/* folder-stack icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="#1e293b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3 12h18" stroke="#1e293b" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </span>
          <div className="menu-title-wrap">
            <h2 className="menu-title">Project Explorer</h2>
            <span className="menu-subtitle">Projects • Tests</span>
          </div>
        </div>
        <button className="menu-close-btn" title="Close" onClick={toggleMenu}>×</button>
      </div>
      <div className="search-bar sticky">
        <input
          type="text"
          className="search-input"
          placeholder="Search projects or tests..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      {loading && <div className="menu-loader">Loading...</div>}
      {notify && <div className="menu-notify">{notify}</div>}
      {busy && <div className="menu-busy-overlay">Processing...</div>}
      <div className="tree-container scrollable">
        {visibleTree ? (
          <TreeNode node={visibleTree} onSelectSwid={onSelectSwid} onSelectTest={onSelectTest} onAction={handleAction} onDeleteProject={handleDeleteProject} />
        ) : (
          !loading && <p className="no-data-msg">No data found.</p>
        )}
      </div>
      <div className="menu-footer">
        <div className="footer-actions">
          <button className="footer-btn" onClick={() => handleAction({ type: 'action-add-project' })}>+ New Project</button>
        </div>
        <div className="footer-meta">Manage projects and tests from here.</div>
      </div>
      {inputModal && (
        <InputModal
          title={inputModal.title}
          prompt={inputModal.prompt}
          placeholder={inputModal.placeholder}
          initialValue={inputModal.initialValue}
          useDropdown={inputModal.useDropdown}
          options={inputModal.options}
          onClose={() => setInputModal(null)}
          onSubmit={handleModalSubmit}
        />
      )}
    </aside>
  );
}


