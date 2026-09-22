# MR Latency dashboard

An interactive React + Vite web application to explore MRI reconstruction latency data from Excel (`.xlsx`, `.xls`). Data is uploaded from the browser and stored in a shared SQLite backend served by Node.js.

## Features
- Open local Excel / CSV file
- Parse uploaded sheets with the `xlsx` library
- Hierarchical project/test/system configuration + SWID storage in SQLite
- Add new Projects and Tests directly from the sidebar
- Upload SWID result files within a chosen System Configuration
- Network-accessible frontend/backend for team use on office network or VPN

## Getting Started

### Prerequisites
- Node.js 18+ recommended

### Install
```powershell
cd "c:\Users\320291849\OneDrive - Philips\Desktop\web latency\mr-latency-dashboard"
npm install
```

### Run Dev Server
```powershell
# terminal 1
npm run dev

# terminal 2
cd .\server
npm start
```
Open the printed frontend URL (usually http://localhost:5173/) in your browser.

### Build for Production
```powershell
npm run build
npm run preview
```

## Usage
### A. Upload Flow
1. Use the upload drop zone to load a latency Excel/CSV file.
2. The browser parses the file with `xlsx` and sends JSON rows to backend API.
3. Backend stores metadata and parsed rows in SQLite.
4. Summary metrics are computed in UI from stored rows.

### B. Organizing Multiple Projects
1. Open the sidebar (☰ button) to view the `Projects` hierarchy.
2. Click `+ Add New Project` at the bottom of the tree to create a project.
3. Expand a project and click `+ Add New Test` to create a test category (e.g., `Recon Latency`).
4. Within a test, expand a system configuration node (auto-created when results exist). If none exist yet, first upload a SWID inside any placeholder system config or upload via the default drop zone and then reorganize going forward.
5. Inside each System Configuration node, click `+ Add New SWID` to upload a new Excel/CSV file specific to that configuration. The file name (minus extension) becomes the SWID identifier.
6. Click any stored SWID file leaf (📄) to load its data & summary; comparison views continue to function filtered by system configuration.

### C. Searching
Use the search box in the sidebar to filter any node (project/test/system configuration/SWID). Only matching branches remain visible.

### D. Data Persistence
All hierarchy metadata and parsed rows are stored in SQLite (`server/mr_latency.sqlite`) through the backend API. Data remains available across browser restarts and to other users that access the same running backend host.

## Notes
- Parsing happens in the browser, then results are sent to backend for persistence.
- In development, hosting is local to the machine running frontend/backend.
- Empty cells are shown as blank.
- For very large files (> ~50k rows), consider splitting or filtering to maintain responsiveness.

## Future Enhancements (Ideas)
- Column filtering & search
- Download filtered/sorted view as CSV
- Basic charts (latency distributions)
- Persist last opened file name (without contents) in localStorage
- Rename / delete Projects, Tests, System Configs, and SWIDs
- Bulk import & export of hierarchy + data (JSON bundle)
- Validation & richer SWID metadata parsing
- Benchmark input & trend visualizations per project

## License
Internal / Proprietary (adjust as needed).
