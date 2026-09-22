// Frontend adapter to SQLite backend
// Use current host so frontend can reach backend on the same machine over LAN
const API_HOST = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const API_PORT = 5179;
const API = `http://${API_HOST}:${API_PORT}`;

async function http(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  // Return structured error to allow callers to handle expected conflicts (409)
  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const err = new Error(`HTTP ${res.status}: ${message}`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

export async function getProjects() {
  return http('GET', '/projects');
}
export async function addProject(name) {
  return http('POST', '/projects', { name });
}
export async function deleteProject(name) {
  return http('DELETE', `/projects/${encodeURIComponent(name)}`);
}
export async function getTests(projectName) {
  return http('GET', `/projects/${encodeURIComponent(projectName)}/tests`);
}
export async function addTest(projectName, testName) {
  return http('POST', `/projects/${encodeURIComponent(projectName)}/tests`, { name: testName });
}
export async function getSystemConfigs(projectName, testName) {
  return http('GET', `/projects/${encodeURIComponent(projectName)}/tests/${encodeURIComponent(testName)}/configs`);
}
export async function addSystemConfig(projectName, testName, systemConfigName) {
  try {
    return await http('POST', `/projects/${encodeURIComponent(projectName)}/tests/${encodeURIComponent(testName)}/configs`, { name: systemConfigName });
  } catch (e) {
    // Swallow 409 conflict as "already exists" and treat as success
    if (e && e.status === 409) return { project: projectName, test: testName, name: systemConfigName, __existing: true };
    throw e;
  }
}

export async function addResultFull(project, test, systemConfig, swid, fileName, data) {
  return http('POST', '/results', {
    project, test, systemConfig, swid,
    original_filename: fileName,
    uploaded_on: new Date().toISOString().slice(0,10),
    parsed_data: data,
  });
}
export async function getResultFull(project, test, systemConfig, swid) {
  return http('GET', `/results/full?project=${encodeURIComponent(project)}&test=${encodeURIComponent(test)}&systemConfig=${encodeURIComponent(systemConfig)}&swid=${encodeURIComponent(swid)}`);
}
export async function resultExistsFull(project, test, systemConfig, swid) {
  const r = await getResultFull(project, test, systemConfig, swid);
  return !!r;
}
export async function getAllResults() {
  return http('GET', '/results');
}

export async function deleteResultFull(project, test, systemConfig, swid) {
  const url = `/results?project=${encodeURIComponent(project)}&test=${encodeURIComponent(test)}&systemConfig=${encodeURIComponent(systemConfig)}&swid=${encodeURIComponent(swid)}`;
  return http('DELETE', url);
}
