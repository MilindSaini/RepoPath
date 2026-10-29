import type { EvidenceGraph } from "./model.js";

export function generateDashboardHtml(initialGraph?: EvidenceGraph, options: { offline?: boolean } = {}): string {
  const isOffline = !!options.offline;
  const embeddedGraphJson = initialGraph ? JSON.stringify(initialGraph) : "null";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>RepoPath — Full-Stack Application Map & AI Assistant</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" />
  <style>
    :root {
      --bg-primary: #0d1117;
      --bg-secondary: #161b22;
      --bg-tertiary: #21262d;
      --border-subtle: #30363d;
      --border-accent: #388bfd;
      --text-main: #c9d1d9;
      --text-muted: #8b949e;
      --text-bright: #f0f6fc;
      --accent-blue: #58a6ff;
      --accent-green: #3fb950;
      --accent-amber: #d29922;
      --accent-red: #f85149;
      --accent-purple: #bc8cff;
      --accent-cyan: #39c5cf;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg-primary);
      color: var(--text-main);
      font-family: var(--font-sans);
      font-size: 14px;
      line-height: 1.5;
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    /* Top Header Bar */
    header {
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-subtle);
      height: 52px;
      padding: 0 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      z-index: 50;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 16px;
      color: var(--text-bright);
      letter-spacing: -0.2px;
      cursor: pointer;
    }
    .brand svg { width: 22px; height: 22px; fill: var(--accent-blue); }
    .nav-tabs {
      display: flex;
      gap: 4px;
      background: var(--bg-primary);
      padding: 3px;
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
    }
    .nav-tab {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 5px 12px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .nav-tab:hover { color: var(--text-bright); background: var(--bg-tertiary); }
    .nav-tab.active { color: var(--text-bright); background: var(--border-accent); }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .btn {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-subtle);
      color: var(--text-bright);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .btn:hover { background: #30363d; border-color: var(--text-muted); }
    .btn-primary { background: #238636; border-color: rgba(240,246,252,0.1); color: #fff; }
    .btn-primary:hover { background: #2ea043; }
    .btn-sm { padding: 4px 8px; font-size: 12px; }
    .repo-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 6px;
      background: var(--bg-tertiary);
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--accent-blue);
      border: 1px solid var(--border-subtle);
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Main Workspace 3-Pane Layout */
    .workspace {
      display: flex;
      flex: 1;
      height: calc(100vh - 52px);
      overflow: hidden;
    }
    /* Left Navigation / Filters */
    .left-panel {
      width: 290px;
      min-width: 260px;
      max-width: 380px;
      flex-shrink: 0;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .left-header {
      padding: 12px 14px;
      border-bottom: 1px solid var(--border-subtle);
    }
    .search-box {
      position: relative;
      margin-bottom: 8px;
    }
    .search-box input {
      width: 100%;
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 6px 10px 6px 28px;
      color: var(--text-bright);
      font-size: 12px;
      outline: none;
    }
    .search-box input:focus { border-color: var(--accent-blue); }
    .search-icon {
      position: absolute;
      left: 8px;
      top: 7px;
      width: 14px;
      height: 14px;
      fill: var(--text-muted);
    }
    .filter-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .chip {
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 12px;
      cursor: pointer;
    }
    .chip.active {
      background: rgba(56, 139, 253, 0.15);
      border-color: var(--accent-blue);
      color: var(--accent-blue);
    }
    .left-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px 10px;
    }
    .tree-group-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      margin: 10px 6px 4px 6px;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
    }
    .tree-node-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px;
      border-radius: 6px;
      font-size: 12px;
      color: var(--text-main);
      cursor: pointer;
      user-select: none;
    }
    .tree-node-item:hover { background: var(--bg-tertiary); color: var(--text-bright); }
    .tree-node-item.selected { background: rgba(56, 139, 253, 0.2); color: var(--accent-blue); font-weight: 500; }
    .layer-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dot-frontend { background: var(--accent-cyan); }
    .dot-api_client { background: var(--accent-purple); }
    .dot-backend { background: var(--accent-green); }
    .dot-data_layer { background: var(--accent-amber); }
    .dot-tests { background: var(--accent-blue); }

    .method-mini-tag {
      font-size: 9px;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 3px;
      text-transform: uppercase;
      font-family: var(--font-mono);
      flex-shrink: 0;
    }
    .method-mini-tag.method-get { background: rgba(57, 197, 207, 0.2); color: #39c5cf; }
    .method-mini-tag.method-post { background: rgba(63, 185, 80, 0.2); color: #3fb950; }
    .method-mini-tag.method-put { background: rgba(210, 153, 34, 0.2); color: #d29922; }
    .method-mini-tag.method-delete { background: rgba(248, 81, 73, 0.2); color: #f85149; }
    .method-mini-tag.method-patch { background: rgba(188, 140, 255, 0.2); color: #bc8cff; }

    /* Center Graph / View Canvas */
    .center-canvas {
      flex: 1;
      min-width: 0;
      background: #090d13;
      position: relative;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .canvas-overlay-controls {
      position: absolute;
      top: 14px;
      right: 14px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
      z-index: 20;
      max-width: calc(100% - 28px);
      pointer-events: none;
    }
    .canvas-controls-main-row {
      display: flex;
      gap: 6px;
      align-items: center;
      background: rgba(22, 27, 34, 0.88);
      backdrop-filter: blur(10px);
      padding: 4px 6px;
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      pointer-events: auto;
    }
    .graph-level-btn-group {
      display: flex;
      gap: 3px;
      border-right: 1px solid var(--border-subtle);
      padding-right: 6px;
    }
    .graph-actions-btn-group {
      display: flex;
      gap: 4px;
    }
    .canvas-relation-select {
      background: var(--bg-primary);
      color: var(--text-bright);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 500;
      outline: none;
      cursor: pointer;
      margin-left: 4px;
    }
    .canvas-relation-select:focus {
      border-color: var(--accent-blue);
    }
    .relation-filter-bar-container {
      max-width: 100%;
      display: flex;
      justify-content: flex-end;
      pointer-events: auto;
    }
    .relation-filter-bar {
      display: flex;
      align-items: center;
      gap: 4px;
      max-width: 620px;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 4px 8px;
      background: rgba(22, 27, 34, 0.85);
      backdrop-filter: blur(8px);
      border: 1px solid var(--border-subtle);
      border-radius: 16px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      scrollbar-width: thin;
      scrollbar-color: var(--border-subtle) transparent;
    }
    .relation-filter-bar::-webkit-scrollbar {
      height: 3px;
    }
    .relation-filter-bar::-webkit-scrollbar-thumb {
      background: var(--border-subtle);
      border-radius: 2px;
    }
    .relation-pill-btn {
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 500;
      padding: 3px 8px;
      border-radius: 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
      transition: all 0.15s ease;
    }
    .relation-pill-btn:hover {
      color: var(--text-bright);
      border-color: var(--accent-blue);
      background: var(--bg-tertiary);
    }
    .relation-pill-btn.active {
      background: rgba(56, 139, 253, 0.2);
      border-color: var(--accent-blue);
      color: var(--accent-blue);
      font-weight: 600;
    }
    .relation-count-badge {
      background: rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 0 4px;
      font-size: 9px;
      font-family: var(--font-mono);
    }
    .relation-tag-btn {
      background: rgba(56, 139, 253, 0.1);
      border: 1px solid rgba(56, 139, 253, 0.25);
      color: var(--accent-blue);
      border-radius: 4px;
      padding: 1px 6px;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      font-family: var(--font-mono);
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }
    .relation-tag-btn:hover, .relation-tag-btn.active {
      background: var(--accent-blue);
      color: #fff;
      border-color: var(--accent-blue);
    }
    .trace-banner {
      position: absolute;
      top: 56px;
      left: 14px;
      right: 14px;
      background: rgba(22, 27, 34, 0.95);
      backdrop-filter: blur(8px);
      border: 1px solid var(--accent-blue);
      border-radius: 8px;
      padding: 8px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      z-index: 25;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }
    .trace-path-steps {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      font-size: 12px;
    }
    .trace-step-pill {
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      padding: 2px 7px;
      font-size: 11px;
      font-family: var(--font-mono);
      cursor: pointer;
      color: var(--accent-blue);
    }
    .trace-step-pill:hover {
      border-color: var(--accent-blue);
      background: rgba(56, 139, 253, 0.15);
    }
    .panel-toggle-btn {
      position: absolute;
      right: 14px;
      top: 60px;
      z-index: 25;
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      border-radius: 6px;
      padding: 5px 9px;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      backdrop-filter: blur(8px);
    }
    .panel-toggle-btn:hover {
      color: var(--text-bright);
      border-color: var(--accent-blue);
    }
    .ai-context-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(56, 139, 253, 0.08);
      border-bottom: 1px solid rgba(56, 139, 253, 0.2);
      padding: 8px 16px;
      font-size: 12px;
      gap: 10px;
      flex-wrap: wrap;
    }
    .ai-context-info {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-bright);
      font-weight: 500;
    }
    .impact-results-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .impact-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .impact-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-bright);
    }
    .impact-chip-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .impact-node-pill {
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 11px;
      color: var(--text-bright);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .impact-node-pill:hover {
      border-color: var(--accent-blue);
      background: rgba(56, 139, 253, 0.1);
      color: var(--accent-blue);
    }
    .view-container {
      flex: 1;
      width: 100%;
      height: 100%;
      overflow: auto;
      display: none;
    }
    .view-container.active { display: flex; flex-direction: column; }

    /* Interactive Graph Canvas View */
    #graphSvg {
      width: 100%;
      height: 100%;
      cursor: grab;
      user-select: none;
    }
    #graphSvg:active { cursor: grabbing; }

    /* Legend */
    .graph-legend {
      position: absolute;
      bottom: 14px;
      left: 14px;
      background: rgba(22, 27, 34, 0.85);
      backdrop-filter: blur(8px);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 8px 12px;
      display: flex;
      gap: 12px;
      font-size: 11px;
      z-index: 20;
    }
    .legend-item { display: flex; align-items: center; gap: 5px; }

    /* Architecture View */
    .arch-overview {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .arch-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }
    .arch-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      transition: border-color 0.15s ease;
    }
    .arch-card:hover { border-color: var(--accent-blue); }
    .arch-card-header { display: flex; align-items: center; justify-content: space-between; }
    .arch-card-title { font-weight: 600; font-size: 15px; color: var(--text-bright); }
    .arch-badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
    .arch-card-desc { font-size: 12px; color: var(--text-muted); }
    .arch-node-list { list-style: none; margin-top: 6px; display: flex; flex-direction: column; gap: 4px; }
    .arch-node-list li {
      font-size: 12px;
      padding: 4px 6px;
      background: var(--bg-primary);
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .arch-node-list li:hover { background: var(--bg-tertiary); color: var(--accent-blue); }

    /* API and Data Flow Swimlane */
    .flow-view {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .flow-selector-bar {
      display: flex;
      gap: 10px;
      align-items: center;
      background: var(--bg-secondary);
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
    }
    .flow-selector-bar select {
      flex: 1;
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      color: var(--text-bright);
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 13px;
      font-family: var(--font-mono);
      outline: none;
    }
    .flow-combobox-wrapper {
      position: relative;
      flex: 1;
      max-width: 650px;
    }
    .flow-combobox-input-row {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 5px 10px;
      cursor: pointer;
      transition: border-color 0.15s ease;
    }
    .flow-combobox-input-row:focus-within {
      border-color: var(--accent-blue);
      box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.2);
    }
    .flow-search-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: var(--text-bright);
      font-size: 13px;
      font-family: var(--font-mono);
    }
    .flow-combobox-toggle-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 10px;
      padding: 2px 4px;
    }
    .flow-combobox-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      max-height: 320px;
      overflow-y: auto;
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      z-index: 100;
      padding: 4px;
    }
    .flow-group-header {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      padding: 6px 8px 4px;
      border-bottom: 1px solid var(--border-subtle);
      margin-top: 4px;
      letter-spacing: 0.5px;
    }
    .flow-combobox-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      color: var(--text-bright);
      transition: background 0.1s ease;
      gap: 8px;
    }
    .flow-combobox-item:hover, .flow-combobox-item.selected {
      background: rgba(88, 166, 255, 0.15);
      color: var(--text-bright);
    }
    .flow-method-pill {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 5px;
      border-radius: 3px;
      text-transform: uppercase;
      font-family: var(--font-mono);
    }
    .flow-method-get { background: rgba(63, 185, 80, 0.2); color: #3fb950; }
    .flow-method-post { background: rgba(56, 139, 253, 0.2); color: #58a6ff; }
    .flow-method-put { background: rgba(210, 153, 34, 0.2); color: #d29922; }
    .flow-method-delete { background: rgba(248, 81, 73, 0.2); color: #f85149; }
    .flow-method-other { background: rgba(188, 140, 255, 0.2); color: #bc8cff; }
    .code-block-wrapper {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      margin: 8px 0;
      overflow: hidden;
    }
    .code-block-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 10px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-subtle);
      font-size: 11px;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }
    .copy-code-btn, .copy-msg-btn {
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 10px;
      cursor: pointer;
      transition: all 0.1s ease;
    }
    .copy-code-btn:hover, .copy-msg-btn:hover {
      color: var(--text-bright);
      border-color: var(--accent-blue);
    }
    .ai-msg {
      position: relative;
    }
    .flow-swimlane {
      display: flex;
      flex-wrap: wrap;
      align-items: stretch;
      gap: 14px;
      padding: 12px 0;
    }
    .flow-step-card {
      flex: 1 1 220px;
      min-width: 210px;
      max-width: 300px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      position: relative;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .flow-step-card:hover {
      border-color: var(--accent-blue);
      transform: translateY(-1px);
    }
    .flow-step-card.active-flow-step {
      border-color: var(--accent-blue);
      box-shadow: 0 0 0 2px rgba(88,166,255,0.3);
      background: rgba(88,166,255,0.06);
    }
    .flow-step-card.unresolved {
      border: 1px dashed var(--accent-red);
      background: rgba(248, 81, 73, 0.05);
    }
    .flow-step-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 600;
      color: var(--text-muted);
    }
    .flow-step-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-bright);
      word-break: break-all;
    }
    .flow-step-meta {
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--text-muted);
    }
    .flow-arrow {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
      font-size: 20px;
      flex-shrink: 0;
    }
    .evidence-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 10px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .evidence-badge.status-static {
      background: rgba(56, 139, 253, 0.15);
      color: var(--accent-blue);
      border: 1px solid rgba(56, 139, 253, 0.3);
    }
    .evidence-badge.status-observed {
      background: rgba(63, 185, 80, 0.15);
      color: var(--accent-green);
      border: 1px solid rgba(63, 185, 80, 0.3);
    }
    .evidence-badge.status-inferred {
      background: rgba(210, 153, 34, 0.15);
      color: var(--accent-amber);
      border: 1px solid rgba(210, 153, 34, 0.3);
    }
    .evidence-badge.status-unresolved {
      background: rgba(248, 81, 73, 0.15);
      color: var(--accent-red);
      border: 1px solid rgba(248, 81, 73, 0.3);
    }
    .layer-metric-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 12px;
    }
    .layer-metric-label { color: var(--text-muted); }
    .layer-metric-val { font-weight: 600; color: var(--text-bright); font-family: var(--font-mono); }
    .explore-layer-btn {
      width: 100%;
      margin-top: 10px;
      padding: 7px 12px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      color: var(--text-bright);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: all 0.15s ease;
    }
    .explore-layer-btn:hover {
      background: rgba(88,166,255,0.1);
      border-color: var(--accent-blue);
      color: var(--accent-blue);
    }
    .source-link-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-subtle);
      color: var(--accent-blue);
      padding: 2px 7px;
      border-radius: 4px;
      font-family: var(--font-mono);
      font-size: 11px;
      cursor: pointer;
      text-decoration: none;
    }
    .source-link-pill:hover {
      border-color: var(--accent-blue);
      background: rgba(88, 166, 255, 0.15);
    }
    .code-pill.clickable-pill {
      cursor: pointer;
      color: var(--accent-purple);
      border: 1px solid rgba(188, 140, 255, 0.3);
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(188, 140, 255, 0.08);
    }
    .code-pill.clickable-pill:hover {
      background: rgba(188, 140, 255, 0.2);
      border-color: var(--accent-purple);
    }

    /* Change Impact View */
    .impact-view {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .impact-form {
      display: flex;
      gap: 10px;
      background: var(--bg-secondary);
      padding: 12px;
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
    }
    .impact-form input {
      flex: 1;
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      color: var(--text-bright);
      padding: 6px 12px;
      border-radius: 6px;
      outline: none;
    }
    .impact-results {
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 16px;
      font-family: var(--font-mono);
      font-size: 13px;
      white-space: pre-wrap;
      overflow-x: auto;
    }

    /* AI Assistant View / Panel */
    .ai-view {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .ai-messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .ai-msg {
      max-width: 85%;
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 13px;
      line-height: 1.6;
    }
    .ai-msg.user {
      align-self: flex-end;
      background: var(--border-accent);
      color: #fff;
    }
    .ai-msg.assistant {
      align-self: flex-start;
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      color: var(--text-bright);
    }
    .ai-msg pre {
      background: var(--bg-primary);
      padding: 8px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 8px 0;
      font-family: var(--font-mono);
      font-size: 12px;
    }
    .ai-msg code {
      background: rgba(110,118,129,0.4);
      padding: 2px 4px;
      border-radius: 4px;
      font-family: var(--font-mono);
      font-size: 12px;
    }
    .ai-prompts-bar {
      display: flex;
      gap: 8px;
      padding: 10px 16px;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border-subtle);
      overflow-x: auto;
    }
    .ai-prompt-pill {
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      color: var(--text-main);
      padding: 4px 10px;
      border-radius: 14px;
      font-size: 12px;
      white-space: nowrap;
      cursor: pointer;
    }
    .ai-prompt-pill:hover { border-color: var(--accent-blue); color: var(--accent-blue); }
    .ai-input-bar {
      display: flex;
      gap: 10px;
      padding: 12px 16px;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border-subtle);
    }
    .ai-input-bar input {
      flex: 1;
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 8px 12px;
      color: var(--text-bright);
      outline: none;
      font-size: 13px;
    }
    .ai-input-bar input:focus { border-color: var(--accent-blue); }

    /* Right Details Inspector */
    .right-panel {
      width: 360px;
      min-width: 340px;
      max-width: 440px;
      flex-shrink: 0;
      background: var(--bg-secondary);
      border-left: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: width 0.2s ease, min-width 0.2s ease;
    }
    .right-panel.collapsed {
      width: 0 !important;
      min-width: 0 !important;
      max-width: 0 !important;
      border-left: none !important;
      overflow: hidden !important;
    }
    .right-header {
      padding: 12px 14px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: var(--bg-secondary);
      flex-shrink: 0;
    }
    .inspector-top-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
    }
    .inspector-section-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .inspector-entity-meta {
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 100%;
      min-width: 0;
    }
    .inspector-title {
      font-weight: 700;
      font-size: 15px;
      color: var(--text-bright);
      word-break: break-word;
      overflow-wrap: anywhere;
      line-height: 1.35;
    }
    .inspector-badge {
      display: inline-block;
      align-self: flex-start;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.06);
      color: var(--accent-blue);
      font-family: var(--font-mono);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .inspector-quick-actions {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 5px;
      width: 100%;
    }
    .inspector-quick-actions .btn {
      padding: 5px 2px;
      font-size: 11px;
      font-weight: 500;
      justify-content: center;
      text-align: center;
      white-space: nowrap;
    }
    .right-content {
      flex: 1;
      overflow-y: auto;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .inspector-section-title {
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 600;
      color: var(--text-muted);
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }
    .dep-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .dep-item {
      font-size: 12px;
      padding: 6px 8px;
      background: var(--bg-primary);
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 2px;
      border: 1px solid transparent;
    }
    .dep-item:hover { border-color: var(--accent-blue); color: var(--text-bright); }
    .dep-item-rel { font-size: 10px; font-weight: 600; color: var(--accent-blue); }
    .source-box {
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 10px;
      font-family: var(--font-mono);
      font-size: 11px;
      line-height: 1.5;
      overflow-x: auto;
      max-height: 220px;
    }
    .source-line { display: flex; gap: 8px; }
    .source-num { color: var(--text-muted); width: 28px; text-align: right; user-select: none; flex-shrink: 0; }
    .source-code { color: var(--text-main); white-space: pre; }
    .source-line.highlight { background: rgba(56, 139, 253, 0.15); font-weight: 600; }

    /* Scan Wizard Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      z-index: 100;
      display: none;
      align-items: center;
      justify-content: center;
    }
    .modal-overlay.active { display: flex; }
    .modal-card {
      width: 640px;
      max-width: 90vw;
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 16px 36px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
    }
    .modal-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .modal-title { font-size: 16px; font-weight: 700; color: var(--text-bright); }
    .modal-steps {
      display: flex;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg-primary);
    }
    .modal-step {
      flex: 1;
      padding: 10px 14px;
      text-align: center;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
      border-bottom: 2px solid transparent;
    }
    .modal-step.active {
      color: var(--accent-blue);
      border-bottom-color: var(--accent-blue);
      background: var(--bg-secondary);
    }
    .modal-body {
      padding: 20px;
      max-height: 60vh;
      overflow-y: auto;
    }
    .modal-footer {
      padding: 14px 20px;
      border-top: 1px solid var(--border-subtle);
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .progress-bar-container {
      width: 100%;
      height: 8px;
      background: var(--bg-primary);
      border-radius: 4px;
      overflow: hidden;
      margin: 12px 0;
    }
    .progress-bar-fill {
      height: 100%;
      background: #238636;
      width: 0%;
      transition: width 0.3s ease;
    }
    .logs-console {
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 10px;
      font-family: var(--font-mono);
      font-size: 11px;
      max-height: 180px;
      overflow-y: auto;
      color: var(--text-muted);
    }

    /* Command Palette Modal */
    .cmd-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(2px);
      z-index: 120;
      display: none;
      align-items: flex-start;
      justify-content: center;
      padding-top: 15vh;
    }
    .cmd-overlay.active { display: flex; }
    .cmd-box {
      width: 540px;
      max-width: 90vw;
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 16px 36px rgba(0,0,0,0.6);
    }
    .cmd-input {
      width: 100%;
      background: transparent;
      border: none;
      border-bottom: 1px solid var(--border-subtle);
      padding: 12px 16px;
      font-size: 14px;
      color: var(--text-bright);
      outline: none;
    }
    .cmd-results {
      max-height: 320px;
      overflow-y: auto;
      padding: 6px;
    }
    .cmd-item {
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 13px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
    }
    .cmd-item:hover, .cmd-item.active { background: var(--bg-tertiary); color: var(--accent-blue); }
    .experience-toggle { display: inline-flex; gap: 2px; padding: 2px; background: var(--bg-primary); border: 1px solid var(--border-subtle); border-radius: 7px; }
    .experience-toggle .btn { border: 0; padding: 4px 8px; color: var(--text-muted); background: transparent; }
    .experience-toggle .btn.active { color: var(--text-bright); background: var(--border-accent); }
    .guided-welcome { margin-top: 18px; padding: 18px; border: 1px solid rgba(88,166,255,0.35); border-radius: 10px; background: linear-gradient(135deg, rgba(56,139,253,0.12), rgba(188,140,255,0.06)); }
    .guided-actions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
    .guided-action { text-align: left; min-height: 78px; padding: 10px; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-secondary); color: var(--text-main); cursor: pointer; }
    .guided-action:hover { border-color: var(--accent-blue); color: var(--text-bright); }
    .guided-action strong { display: block; color: var(--text-bright); margin-bottom: 4px; }
    .guided-action span { color: var(--text-muted); font-size: 11px; }
    .api-explorer { display: grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); gap: 16px; padding: 24px; height: 100%; min-height: 0; }
    .api-catalog, .api-detail { min-height: 0; overflow: hidden; background: rgba(10, 17, 31, 0.78); border: 1px solid var(--border-subtle); border-radius: 16px; box-shadow: var(--shadow-panel); }
    .api-catalog { display: flex; flex-direction: column; }
    .api-catalog-header, .api-detail-header { padding: 16px; border-bottom: 1px solid var(--border-subtle); }
    .api-catalog-header h3, .api-detail-header h3 { font-family: var(--font-display); color: var(--text-bright); font-size: 16px; }
    .api-catalog-header p { color: var(--text-muted); font-size: 11px; margin-top: 4px; }
    .api-filter-row { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 12px; }
    .api-filter { padding: 5px 8px; border: 1px solid var(--border-subtle); border-radius: 999px; background: rgba(18, 27, 45, 0.8); color: var(--text-muted); font-size: 10px; cursor: pointer; }
    .api-filter.active { color: var(--accent-cyan); border-color: rgba(66, 217, 255, 0.55); background: rgba(66, 217, 255, 0.1); }
    .api-search { width: 100%; margin-top: 12px; background: rgba(5, 10, 20, 0.72); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 9px 10px; color: var(--text-bright); outline: none; font-size: 11px; }
    .api-list { overflow-y: auto; padding: 8px; }
    .api-row { padding: 11px; margin-bottom: 5px; border: 1px solid transparent; border-radius: 10px; cursor: pointer; background: rgba(5, 10, 20, 0.35); }
    .api-row:hover, .api-row.active { border-color: rgba(124, 140, 255, 0.5); background: rgba(124, 140, 255, 0.1); }
    .api-row-top, .api-status-line { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .api-method { font-family: var(--font-display); font-weight: 700; font-size: 10px; color: var(--accent-cyan); }
    .api-path { color: var(--text-bright); font-family: var(--font-mono); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .api-status { font-size: 9px; font-weight: 700; letter-spacing: 0.04em; }
    .api-status.matched { color: var(--accent-green); }
    .api-status.unresolved { color: var(--accent-amber); }
    .api-status.external { color: var(--accent-purple); }
    .api-status.static_asset { color: var(--text-muted); }
    .api-row-meta { color: var(--text-muted); font-size: 10px; margin-top: 6px; display: flex; gap: 8px; }
    .api-detail { overflow-y: auto; }
    .api-detail-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 15px; }
    .api-detail-title { font-family: var(--font-mono); font-size: 17px; color: var(--text-bright); margin-top: 5px; word-break: break-word; }
    .api-detail-tabs { display: flex; gap: 3px; flex-wrap: wrap; padding: 10px 16px; border-bottom: 1px solid var(--border-subtle); }
    .api-detail-tab { border: 0; background: transparent; color: var(--text-muted); border-radius: 7px; padding: 7px 9px; font-size: 10px; cursor: pointer; }
    .api-detail-tab:hover, .api-detail-tab.active { color: var(--text-bright); background: rgba(124, 140, 255, 0.14); }
    .api-detail-content { padding: 18px; }
    .api-detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
    .api-stat { padding: 11px; background: rgba(5, 10, 20, 0.48); border: 1px solid var(--border-subtle); border-radius: 9px; }
    .api-stat-label { color: var(--text-muted); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; }
    .api-stat-value { color: var(--text-bright); font-size: 13px; margin-top: 4px; word-break: break-word; }
    .api-evidence-list { display: flex; flex-direction: column; gap: 7px; margin-top: 14px; }
    .api-evidence-item { padding: 10px; border-left: 2px solid var(--accent-cyan); background: rgba(5, 10, 20, 0.48); border-radius: 0 8px 8px 0; font-size: 11px; }
    .api-evidence-item strong { color: var(--text-bright); }
    @media (max-width: 900px) { .api-explorer { grid-template-columns: 1fr; overflow: auto; } .api-catalog { min-height: 340px; } .api-detail { min-height: 500px; } }
    @media (max-width: 900px) { .guided-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

    /* Future workspace theme */
    :root {
      --bg-primary: #070b14;
      --bg-secondary: #0c1220;
      --bg-tertiary: #121b2d;
      --surface-raised: rgba(15, 24, 42, 0.88);
      --border-subtle: rgba(137, 161, 206, 0.16);
      --border-accent: #6d7cff;
      --text-main: #aab8d2;
      --text-muted: #687895;
      --text-bright: #edf4ff;
      --accent-blue: #7c8cff;
      --accent-green: #4de1b6;
      --accent-amber: #f5bb68;
      --accent-red: #ff7187;
      --accent-purple: #c493ff;
      --accent-cyan: #42d9ff;
      --font-sans: "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --font-display: "Space Grotesk", var(--font-sans);
      --shadow-panel: 0 18px 50px rgba(0, 0, 0, 0.24);
      --glow-blue: 0 0 28px rgba(124, 140, 255, 0.2);
    }
    body {
      background:
        radial-gradient(circle at 8% -10%, rgba(66, 217, 255, 0.1), transparent 30rem),
        radial-gradient(circle at 92% 0%, rgba(196, 147, 255, 0.1), transparent 28rem),
        var(--bg-primary);
      letter-spacing: 0.01em;
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: 0.22;
      background-image: linear-gradient(rgba(124, 140, 255, 0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(124, 140, 255, 0.035) 1px, transparent 1px);
      background-size: 44px 44px;
      mask-image: linear-gradient(to bottom, black, transparent 88%);
    }
    header {
      height: 68px;
      padding: 0 22px;
      background: rgba(7, 11, 20, 0.82);
      border-bottom: 1px solid var(--border-subtle);
      backdrop-filter: blur(20px);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.16);
    }
    .brand {
      font-family: var(--font-display);
      font-size: 17px;
      letter-spacing: -0.04em;
      gap: 11px;
    }
    .brand::after {
      content: "CODE INTELLIGENCE";
      font-family: var(--font-sans);
      color: var(--text-muted);
      font-size: 9px;
      letter-spacing: 0.15em;
      margin-left: 3px;
      padding-left: 12px;
      border-left: 1px solid var(--border-subtle);
    }
    .brand svg { fill: none; stroke: var(--accent-cyan); stroke-width: 1.5; filter: drop-shadow(0 0 8px rgba(66, 217, 255, 0.6)); }
    .nav-tabs {
      gap: 2px;
      padding: 4px;
      background: rgba(13, 21, 37, 0.8);
      border-color: var(--border-subtle);
      border-radius: 12px;
    }
    .nav-tab {
      padding: 8px 11px;
      border-radius: 8px;
      font-size: 11px;
      color: var(--text-muted);
      gap: 7px;
      white-space: nowrap;
    }
    .nav-tab i { color: var(--accent-cyan); font-size: 11px; }
    .nav-tab:hover { background: rgba(124, 140, 255, 0.1); color: var(--text-bright); }
    .nav-tab.active {
      color: var(--text-bright);
      background: linear-gradient(135deg, rgba(124, 140, 255, 0.95), rgba(92, 83, 190, 0.95));
      box-shadow: 0 5px 16px rgba(124, 140, 255, 0.22);
    }
    .nav-tab.active i { color: #fff; }
    .header-actions { gap: 7px; }
    .btn {
      background: rgba(18, 27, 45, 0.9);
      border-color: var(--border-subtle);
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 11px;
      transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease;
    }
    .btn:hover {
      background: rgba(124, 140, 255, 0.14);
      border-color: rgba(124, 140, 255, 0.58);
      box-shadow: var(--glow-blue);
      transform: translateY(-1px);
    }
    .btn-primary {
      background: linear-gradient(135deg, #6678ff, #9b76e8);
      border-color: transparent;
      box-shadow: 0 8px 20px rgba(102, 120, 255, 0.22);
    }
    .btn-primary:hover { background: linear-gradient(135deg, #7d8cff, #ad89fa); }
    .repo-badge {
      background: rgba(18, 27, 45, 0.7);
      border-color: var(--border-subtle);
      border-radius: 7px;
      font-size: 10px;
      color: var(--accent-cyan);
    }
    .workspace { height: calc(100vh - 68px); position: relative; }
    .left-panel, .right-panel {
      background: rgba(9, 15, 28, 0.86);
      border-color: var(--border-subtle);
      backdrop-filter: blur(18px);
    }
    .left-panel { width: 272px; min-width: 248px; }
    .left-header, .right-header { padding: 16px; border-color: var(--border-subtle); }
    .left-header::before {
      content: "EXPLORER";
      display: block;
      font-family: var(--font-display);
      font-size: 10px;
      letter-spacing: 0.16em;
      color: var(--text-muted);
      margin-bottom: 13px;
    }
    .search-box input, .flow-combobox-input-row, .flow-selector-bar, .impact-form input, .ai-input-bar input {
      background: rgba(5, 10, 20, 0.72);
      border-color: var(--border-subtle);
      border-radius: 9px;
    }
    .search-box input { padding: 9px 10px 9px 30px; }
    .search-box input:focus, .flow-combobox-input-row:focus-within, .ai-input-bar input:focus { border-color: var(--accent-cyan); box-shadow: 0 0 0 3px rgba(66, 217, 255, 0.1); }
    .chip {
      padding: 4px 8px;
      border-radius: 999px;
      background: rgba(18, 27, 45, 0.8);
      border-color: var(--border-subtle);
      font-size: 10px;
    }
    .chip.active { background: rgba(66, 217, 255, 0.1); border-color: rgba(66, 217, 255, 0.65); color: var(--accent-cyan); }
    .left-content { padding: 12px; }
    .tree-group-title { margin: 14px 6px 6px; font-family: var(--font-display); font-size: 10px; letter-spacing: 0.13em; }
    .tree-node-item { padding: 8px 9px; border-radius: 8px; font-size: 11px; }
    .tree-node-item:hover { background: rgba(124, 140, 255, 0.09); }
    .tree-node-item.selected { background: linear-gradient(90deg, rgba(124, 140, 255, 0.2), rgba(124, 140, 255, 0.04)); color: var(--text-bright); box-shadow: inset 2px 0 var(--accent-cyan); }
    .center-canvas { background: #070c17; }
    #graphSvg {
      background-image: radial-gradient(circle, rgba(116, 139, 199, 0.27) 1px, transparent 1px);
      background-size: 22px 22px;
      background-position: 8px 8px;
    }
    #edgesLayer path { stroke-dasharray: 3 8; stroke-linecap: round; opacity: 0.74; transition: opacity 0.2s ease, stroke 0.2s ease; }
    #edgesLayer path:hover { opacity: 1; stroke: var(--accent-cyan); }
    #nodesLayer .graph-node rect { filter: drop-shadow(0 8px 12px rgba(0, 0, 0, 0.28)); stroke-width: 1.5; transition: filter 0.2s ease, stroke-width 0.2s ease; }
    #nodesLayer .graph-node:hover rect { filter: drop-shadow(0 0 14px rgba(66, 217, 255, 0.35)); stroke-width: 2.5; }
    .canvas-overlay-controls {
      top: 16px; left: 16px; right: 16px; padding: 10px 12px;
      background: rgba(10, 17, 31, 0.78); border: 1px solid var(--border-subtle);
      border-radius: 12px; backdrop-filter: blur(18px); box-shadow: var(--shadow-panel);
    }
    .graph-level-btn-group, .graph-actions-btn-group { gap: 5px; }
    .graph-level-btn-group .btn.active { color: var(--text-bright); background: rgba(66, 217, 255, 0.12); border-color: rgba(66, 217, 255, 0.48); }
    .graph-legend { background: rgba(10, 17, 31, 0.78); border-color: var(--border-subtle); border-radius: 10px; backdrop-filter: blur(14px); }
    .view-container { scrollbar-color: rgba(124, 140, 255, 0.35) transparent; }
    .arch-overview, .flow-view, .impact-view, .ai-view { padding: 30px; gap: 22px; }
    .arch-overview > div:first-child h2, .flow-view h2, .impact-view h2, .ai-view h2 { font-family: var(--font-display); letter-spacing: -0.04em; font-size: 25px !important; }
    .arch-overview > div:first-child p, .flow-view > div:first-child p, .impact-view > div:first-child p { color: var(--text-muted) !important; }
    .arch-grid { gap: 14px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
    .arch-card, .flow-step-card, .impact-card {
      background: linear-gradient(145deg, rgba(17, 27, 47, 0.88), rgba(10, 17, 31, 0.9));
      border-color: var(--border-subtle);
      border-radius: 14px;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.14);
    }
    .arch-card { padding: 18px; }
    .arch-card:hover { border-color: rgba(66, 217, 255, 0.5); box-shadow: 0 14px 36px rgba(25, 50, 100, 0.24); transform: translateY(-2px); }
    .arch-card-title { font-family: var(--font-display); }
    .arch-node-list li, .dep-item, .impact-node-pill { background: rgba(5, 10, 20, 0.56); border-color: var(--border-subtle); border-radius: 8px; }
    .guided-welcome { background: linear-gradient(120deg, rgba(66, 217, 255, 0.09), rgba(124, 140, 255, 0.12) 48%, rgba(196, 147, 255, 0.08)); border-color: rgba(124, 140, 255, 0.32); border-radius: 16px; box-shadow: var(--glow-blue); }
    .guided-action { background: rgba(8, 14, 27, 0.68); border-color: var(--border-subtle); border-radius: 11px; transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease; }
    .guided-action:hover { transform: translateY(-3px); border-color: var(--accent-cyan); background: rgba(66, 217, 255, 0.08); }
    .flow-step-card { min-width: 220px; }
    .flow-step-card.active-flow-step { border-color: var(--accent-cyan); box-shadow: 0 0 0 2px rgba(66, 217, 255, 0.18), 0 12px 30px rgba(66, 217, 255, 0.12); }
    .right-panel { width: 365px; min-width: 330px; }
    .right-header { background: rgba(12, 18, 32, 0.92); }
    .inspector-title { font-family: var(--font-display); font-size: 17px; }
    .inspector-section-title { color: var(--accent-cyan); letter-spacing: 0.12em; }
    .source-box { background: #060b14; border-radius: 9px; border-color: var(--border-subtle); }
    .experience-toggle { background: rgba(5, 10, 20, 0.7); border-color: var(--border-subtle); border-radius: 9px; }
    .experience-toggle .btn.active { background: rgba(66, 217, 255, 0.13); color: var(--accent-cyan); }
    .modal-card, .cmd-box { background: rgba(12, 18, 32, 0.96); border-color: var(--border-subtle); border-radius: 16px; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.52); }
    .modal-overlay, .cmd-overlay { background: rgba(2, 5, 12, 0.74); }
    @media (max-width: 1180px) {
      .brand::after, .repo-badge { display: none; }
      .nav-tab { padding: 8px 9px; }
      .nav-tab span { display: none; }
      .right-panel { width: 320px; min-width: 300px; }
    }
    @media (max-width: 820px) {
      header { padding: 0 12px; gap: 8px; }
      .nav-tabs { order: 3; position: absolute; top: 68px; left: 8px; right: 8px; overflow-x: auto; }
      .header-actions { margin-left: auto; }
      .workspace { margin-top: 52px; height: calc(100vh - 120px); }
      .left-panel { width: 220px; min-width: 200px; }
      .right-panel { position: absolute; z-index: 40; right: 0; top: 0; bottom: 0; width: min(92vw, 360px); }
      .arch-overview, .flow-view, .impact-view, .ai-view { padding: 20px 14px; }
      .guided-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .canvas-overlay-controls { top: 10px; left: 10px; right: 10px; }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <header>
    <div class="brand" onclick="switchView('overview')">
      <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
      <span>RepoPath</span>
    </div>

    <!-- Navigation Tabs (5 Main Views) -->
    <div class="nav-tabs">
      <button class="nav-tab active" data-view="overview" onclick="switchView('overview')">
        <i class="fa-solid fa-grid-2"></i><span>Overview</span>
      </button>
      <button class="nav-tab" data-view="graph" onclick="switchView('graph')">
        <i class="fa-solid fa-diagram-project"></i><span>Feature Explorer</span>
      </button>
      <button class="nav-tab" data-view="flow" onclick="switchView('flow')">
        <i class="fa-solid fa-route"></i><span>API & Data Flow</span>
      </button>
      <button class="nav-tab" data-view="api" onclick="switchView('api')">
        <i class="fa-solid fa-code"></i><span>API Explorer</span>
      </button>
      <button class="nav-tab" data-view="impact" onclick="switchView('impact')">
        <i class="fa-solid fa-bolt"></i><span>Change Impact</span>
      </button>
      <button class="nav-tab" data-view="ai" onclick="switchView('ai')">
        <i class="fa-solid fa-sparkles"></i><span>AI Assistant</span>
      </button>
    </div>

    <div class="header-actions">
      <span class="repo-badge" id="headerRepoBadge">No repository loaded</span>
      <span class="repo-badge" id="headerBranchBadge" style="display:none;color:var(--text-muted);border-color:var(--border-subtle);">main</span>
      <span class="repo-badge" id="headerStatusBadge" style="display:none;color:var(--accent-green);border-color:rgba(63,185,80,0.3);">✓ Ready</span>
      <button class="btn btn-sm" onclick="openCmdPalette()" title="Search (Cmd+K)"><i class="fa-solid fa-magnifying-glass"></i> Cmd+K</button>
      <button class="btn btn-sm btn-primary" onclick="openScanWizard()"><i class="fa-solid fa-plus"></i> Scan Repo</button>
      <button class="btn btn-sm" onclick="exportOfflineReport()" title="Export offline HTML"><i class="fa-solid fa-arrow-down-to-bracket"></i> Export</button>
      <button class="btn btn-sm" onclick="saveWorkspace()" title="Save selected entity and view locally"><i class="fa-regular fa-bookmark"></i> Save</button>
      <div class="experience-toggle" aria-label="Experience mode">
        <button class="btn active" id="guidedModeBtn" onclick="setExperienceMode('guided')">Guided</button>
        <button class="btn" id="expertModeBtn" onclick="setExperienceMode('expert')">Expert</button>
      </div>
    </div>
  </header>

  <!-- 3-Pane Workspace -->
  <div class="workspace">
    <!-- Left Navigation & Hierarchy Tree -->
    <aside class="left-panel">
      <div class="left-header">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input type="text" id="leftSearchInput" placeholder="Filter nodes..." oninput="handleFilter()" />
        </div>
        <div class="filter-chips">
          <span class="chip active" data-layer="all" onclick="toggleLayerFilter('all')">All</span>
          <span class="chip" data-layer="frontend" onclick="toggleLayerFilter('frontend')">Frontend</span>
          <span class="chip" data-layer="api_client" onclick="toggleLayerFilter('api_client')">API Client</span>
          <span class="chip" data-layer="backend" onclick="toggleLayerFilter('backend')">Backend</span>
          <span class="chip" data-layer="data_layer" onclick="toggleLayerFilter('data_layer')">Data Layer</span>
          <span class="chip" data-layer="tests" onclick="toggleLayerFilter('tests')">Tests</span>
        </div>
        <div class="filter-chips" id="folderChipsBar" style="display: none; margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--border-subtle);"></div>
        <div class="filter-chips" id="leftRelationChipsBar" style="display: flex; margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--border-subtle);"></div>
      </div>
      <div class="left-content" id="leftTreeList">
        <!-- Rendered dynamically -->
      </div>
    </aside>

    <!-- Center Views Container -->
    <main class="center-canvas">
      <!-- Overlay controls for Graph View -->
      <div class="canvas-overlay-controls" id="graphControls" style="display: none;">
        <div class="canvas-controls-main-row">
          <div class="graph-level-btn-group">
            <button class="btn btn-sm active" id="btnGraphLevel1" onclick="setGraphLevel(1)" title="Level 1: System Architecture">🏛️ System</button>
            <button class="btn btn-sm" id="btnGraphLevel2" onclick="setGraphLevel(2)" title="Level 2: Modules View">📦 Modules</button>
            <button class="btn btn-sm" id="btnGraphLevel3" onclick="setGraphLevel(3)" title="Level 3: Dependencies View">🔍 Dependencies</button>
          </div>
          <div class="graph-actions-btn-group">
            <button class="btn btn-sm" onclick="expandNeighbours()" title="Expand connected neighbours">+ Expand</button>
            <button class="btn btn-sm" onclick="collapseGraph()" title="Collapse view">− Collapse</button>
            <button class="btn btn-sm" id="traceModeBtn" onclick="toggleTraceMode()" title="Find path between two nodes">📍 Trace Path</button>
            <button class="btn btn-sm" onclick="resetGraphZoom()" title="Reset View">Fit View</button>
          </div>
          <select id="relationFilterSelect" class="canvas-relation-select" onchange="filterByRelation(this.value)" title="Filter by edge relation">
            <option value="all">All Relations</option>
          </select>
        </div>
        <div class="relation-filter-bar-container">
          <div class="relation-filter-bar" id="relationFilterBar"></div>
        </div>
      </div>

      <!-- Interactive Trace Path Banner -->
      <div class="trace-banner" id="traceBanner" style="display: none;">
        <div class="trace-path-steps" id="tracePathSteps"></div>
        <button class="btn btn-sm" onclick="clearTracePath()">✕ Clear Trace</button>
      </div>
      <button class="panel-toggle-btn" id="reopenInspectorBtn" onclick="toggleInspector()" style="display: none;" title="Open Inspector">◫ Inspector</button>

      <!-- View 1: Architecture Overview -->
      <section class="view-container active" id="view-overview">
        <div class="arch-overview">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h2 style="font-size: 20px; font-weight: 700; color: var(--text-bright);">Architecture Overview</h2>
              <p style="font-size: 13px; color: var(--text-muted);">Unified full-stack architecture across all configured project locations and services.</p>
            </div>
            <div id="overviewCoverageBadges" style="display: flex; gap: 6px;"></div>
          </div>
          <div class="guided-welcome" id="guidedWelcome">
            <div style="font-size:16px;font-weight:700;color:var(--text-bright);">Understand this codebase without reading every file.</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Guided View starts with verified architecture facts and reveals detail only when you need it.</div>
            <div class="guided-actions">
              <button class="guided-action" onclick="exploreGuidedProject()"><strong>🏛️ Understand the project</strong><span>Architecture, entry points, modules, and technologies.</span></button>
              <button class="guided-action" onclick="traceGuidedFeature()"><strong>⚡ Trace a feature</strong><span>Follow a request through the API and backend.</span></button>
              <button class="guided-action" onclick="guidedFindSource()"><strong>📄 Find source code</strong><span>Search for a route, function, file, or table.</span></button>
              <button class="guided-action" onclick="guidedReviewChange()"><strong>💥 Review a change</strong><span>Inspect affected nodes and relevant tests.</span></button>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
            <button class="btn btn-sm" onclick="showHealthFindings()">🩺 Architecture health</button>
            <button class="btn btn-sm" onclick="showContracts()">🔌 API contracts</button>
            <button class="btn btn-sm" onclick="downloadArchitecture()">📐 Architecture document</button>
          </div>
          <div id="projectBriefPanel" style="margin-top:12px;"></div>
          <div id="healthPanel" style="margin-top:12px;"></div>
          <div id="foldersOverviewSection" style="display: none; margin-top: 18px;"></div>
          <div class="arch-grid" id="archGrid">
            <!-- Rendered dynamically -->
          </div>
        </div>
      </section>

      <!-- View 2: Interactive Graph Canvas -->
      <section class="view-container" id="view-graph">
        <svg id="graphSvg">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#484f58" />
            </marker>
            <marker id="arrow-highlight" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#58a6ff" />
            </marker>
          </defs>
          <g id="graphRoot">
            <g id="edgesLayer"></g>
            <g id="nodesLayer"></g>
          </g>
        </svg>
        <div class="graph-legend">
          <div class="legend-item"><span class="layer-dot dot-frontend"></span> Frontend</div>
          <div class="legend-item"><span class="layer-dot dot-api_client"></span> API Client</div>
          <div class="legend-item"><span class="layer-dot dot-backend"></span> Backend</div>
          <div class="legend-item"><span class="layer-dot dot-data_layer"></span> Data Layer</div>
          <div class="legend-item"><span class="layer-dot dot-tests"></span> Tests</div>
        </div>
      </section>

      <!-- View 3: API & Data Flow (Signature View) -->
      <section class="view-container" id="view-flow">
        <div class="flow-view">
          <div>
            <h2 style="font-size: 20px; font-weight: 700; color: var(--text-bright);">API & Data Flow</h2>
            <p style="font-size: 13px; color: var(--text-muted);">End-to-end execution path: Frontend Component → API Client → Backend Route → Service → Database Query & Table.</p>
          </div>
          <div class="flow-selector-bar">
            <label style="font-size: 13px; font-weight: 600; color: var(--text-muted); flex-shrink: 0;">Feature Flow:</label>
            <div class="flow-combobox-wrapper" id="flowComboboxWrapper">
              <div class="flow-combobox-input-row" onclick="openFlowCombobox()">
                <span style="color:var(--text-muted);font-size:12px;">🔍</span>
                <input type="text" id="flowSearchInput" class="flow-search-input" placeholder="Search flows by endpoint, component, or method..." oninput="filterFlowCombobox(this.value)" onfocus="openFlowCombobox()" />
                <button class="flow-combobox-toggle-btn" type="button" onclick="event.stopPropagation(); toggleFlowCombobox();">▼</button>
              </div>
              <div class="flow-combobox-dropdown" id="flowComboboxDropdown" style="display:none;"></div>
              <select id="flowSelect" style="display:none;" onchange="renderSelectedFlow()"></select>
            </div>
          </div>
          <div class="flow-swimlane" id="flowSwimlane">
            <!-- Swimlane steps populated dynamically -->
          </div>
        </div>
      </section>

      <section class="view-container" id="view-api">
        <div class="api-explorer">
          <aside class="api-catalog">
            <div class="api-catalog-header">
              <h3><i class="fa-solid fa-code" style="color:var(--accent-cyan);"></i> API Explorer</h3>
              <p>Investigate requests, routes, contracts, data access, consumers, and verification from one evidence-backed catalog.</p>
              <input class="api-search" id="apiSearchInput" placeholder="Search method, path, service, or file..." oninput="renderApiCatalog()" />
              <div class="api-filter-row" id="apiFilterRow"></div>
            </div>
            <div class="api-list" id="apiCatalogList"></div>
          </aside>
          <section class="api-detail" id="apiDetailPanel">
            <div class="api-detail-header"><div><div style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.14em;">Select an operation</div><div class="api-detail-title">API catalog ready</div></div></div>
            <div class="api-detail-content" style="color:var(--text-muted);font-size:12px;">Select a route or request to inspect its evidence-backed implementation path.</div>
          </section>
        </div>
      </section>

      <!-- View 4: Change Impact -->
      <section class="view-container" id="view-impact">
        <div class="impact-view">
          <div>
            <h2 style="font-size: 20px; font-weight: 700; color: var(--text-bright);">Change Impact Intelligence</h2>
            <p style="font-size: 13px; color: var(--text-muted);">Inspect affected components, downstream dependencies, contracts, and recommended tests before modifying code.</p>
          </div>
          <div class="impact-form">
            <input type="text" id="impactInput" placeholder="Enter file path, function symbol, or response field..." onkeydown="if(event.key==='Enter') runImpactAnalysis()" />
            <button class="btn btn-primary" onclick="runImpactAnalysis()">Analyze Impact</button>
          </div>
          <div id="impactResultsContainer" class="impact-results-container">
            <div class="impact-results" id="impactResults">
              Select a node or enter a file/symbol above to evaluate change impact.
            </div>
          </div>
        </div>
      </section>

      <!-- View 5: AI Assistant -->
      <section class="view-container" id="view-ai">
        <div class="ai-view">
          <div id="aiActiveContextBar" style="display: none;"></div>
          <div class="ai-messages" id="aiMessages">
            <div class="ai-msg assistant">
              👋 **Hello! I'm RepoPath AI Assistant.**
              I'm grounded in this repository's static graph and source evidence. How can I help you understand the architecture?
            </div>
          </div>
          <div class="ai-prompts-bar" id="aiPromptsBar">
            <button class="ai-prompt-pill" onclick="sendAiPrompt('Explain this component')">🔍 Explain selected component</button>
            <button class="ai-prompt-pill" onclick="sendAiPrompt('Explain this feature full path')">⚡ Trace full-stack feature path</button>
            <button class="ai-prompt-pill" onclick="sendAiPrompt('What happens if I change this function?')">💥 Predict change impact</button>
            <button class="ai-prompt-pill" onclick="sendAiPrompt('Onboard me to this codebase')">🧭 Onboard new developer</button>
          </div>
          <div class="ai-input-bar">
            <input type="text" id="aiInput" placeholder="Ask a question about the architecture or selected component..." onkeydown="if(event.key==='Enter') sendAiMessage()" />
            <button class="btn btn-primary" onclick="sendAiMessage()">Ask AI</button>
          </div>
        </div>
      </section>
    </main>

    <!-- Right Node Inspector -->
    <aside class="right-panel" id="rightInspectorPanel">
      <div class="right-header">
        <div class="inspector-top-row">
          <span class="inspector-section-label">INSPECTOR</span>
          <button class="btn btn-sm btn-icon" onclick="toggleInspector()" title="Collapse Inspector Panel" id="collapseInspectorBtn">◫</button>
        </div>
        <div class="inspector-entity-meta">
          <div class="inspector-title" id="inspTitle">Select an entity</div>
          <div class="inspector-badge" id="inspKind">none</div>
        </div>
        <div class="inspector-quick-actions">
          <button class="btn btn-sm" onclick="focusSelectedInGraph()" title="Focus in Graph">🔍 Graph</button>
          <button class="btn btn-sm" onclick="focusSelectedInFlow()" title="View in API Flow">⚡ Flow</button>
          <button class="btn btn-sm" onclick="focusSelectedInImpact()" title="Analyze Change Impact">💥 Impact</button>
          <button class="btn btn-sm" onclick="askAiAboutSelected()" title="Explain with AI">🤖 AI</button>
        </div>
      </div>
      <div class="right-content" id="inspContent">
        <p style="color: var(--text-muted); font-size: 13px;">Click any component, endpoint, or table in the graph or tree to inspect its details, incoming callers, outgoing dependencies, and live source code.</p>
      </div>
    </aside>
  </div>

  <!-- Scan Wizard Modal -->
  <div class="modal-overlay" id="scanModal">
    <div class="modal-card">
      <div class="modal-header">
        <div class="modal-title">Scan Repository</div>
        <button class="btn btn-sm" onclick="closeScanWizard()">✕</button>
      </div>
      <div class="modal-steps">
        <div class="modal-step active" id="wizardStep1Tab">1. Select Repository</div>
        <div class="modal-step" id="wizardStep2Tab">2. Review Scan Plan</div>
        <div class="modal-step" id="wizardStep3Tab">3. Run Analysis</div>
      </div>
      <div class="modal-body" id="wizardBody">
        <!-- Step 1 content: Multi-Folder / Multi-Location Workspace -->
        <div id="step1View">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <label style="font-weight: 600; font-size: 13px; color: var(--text-bright);">Project Folders & Locations:</label>
            <button class="btn btn-sm" onclick="addFolderRow()" style="color: var(--accent-blue); font-size: 12px;">+ Add Folder Location</button>
          </div>
          <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
            Add multiple directories where different parts of your application live (e.g. frontend, backend, microservices, database schemas).
          </p>
          <div id="folderRowsContainer" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;"></div>
          <div style="display: flex; gap: 8px; margin-bottom: 14px;">
            <button class="btn btn-primary" onclick="inspectDirectory()" style="width: 100%;">Inspect All Folders</button>
          </div>
          <div id="detectionResults" style="display: none; background: var(--bg-primary); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 12px; font-size: 13px; margin-top: 10px;"></div>
        </div>
        <!-- Step 2 content -->
        <div id="step2View" style="display: none;">
          <div id="planSummary" style="font-size: 13px; line-height: 1.6;"></div>
        </div>
        <!-- Step 3 content -->
        <div id="step3View" style="display: none;">
          <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 600;">
            <span id="jobStageName">Starting scan...</span>
            <span id="jobPercent">0%</span>
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar-fill" id="jobProgressBar"></div>
          </div>
          <div class="logs-console" id="jobLogsConsole"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" id="wizardBackBtn" onclick="wizardBack()" style="display: none;">Back</button>
        <button class="btn btn-primary" id="wizardNextBtn" onclick="wizardNext()">Continue to Scan Plan</button>
      </div>
    </div>
  </div>

  <!-- Command Palette Modal -->
  <div class="cmd-overlay" id="cmdModal" onclick="if(event.target===this) closeCmdPalette()">
    <div class="cmd-box">
      <input type="text" class="cmd-input" id="cmdInput" placeholder="Search components, routes, database tables, or files..." oninput="handleCmdSearch()" />
      <div class="cmd-results" id="cmdResults"></div>
    </div>
  </div>

  <!-- Client-side Logic -->
  <script>
    let graph = ${embeddedGraphJson};
    const isOfflineMode = ${isOffline ? "true" : "false"};
    let selectedNodeId = null;
    let traceStartNodeId = null;
    let isTraceMode = false;
    let activeLayerFilter = "all";
    let activeFolderFilter = "all";
    let experienceMode = "guided";

    function setExperienceMode(mode) {
      experienceMode = mode === "expert" ? "expert" : "guided";
      const welcome = document.getElementById("guidedWelcome");
      if (welcome) welcome.style.display = experienceMode === "guided" ? "block" : "none";
      document.getElementById("guidedModeBtn")?.classList.toggle("active", experienceMode === "guided");
      document.getElementById("expertModeBtn")?.classList.toggle("active", experienceMode === "expert");
      if (experienceMode === "expert") {
        switchView("graph");
        setGraphLevel(2);
      } else {
        switchView("overview");
        setGraphLevel(1);
      }
      persistWorkspace();
    }

    function persistWorkspace() {
      if (isOfflineMode || !graph?.repository) return;
      localStorage.setItem("repopath:workspace:" + graph.repository, JSON.stringify({ selectedNodeId, experienceMode, graphCurrentLevel, updatedAt: new Date().toISOString() }));
    }

    function restoreWorkspace() {
      if (!graph?.repository) return;
      const saved = localStorage.getItem("repopath:workspace:" + graph.repository);
      if (!saved) return;
      try {
        const state = JSON.parse(saved);
        if (state.experienceMode) experienceMode = state.experienceMode;
        if (state.selectedNodeId && graph.nodes.some(n => n.id === state.selectedNodeId)) selectedNodeId = state.selectedNodeId;
        if (Number.isInteger(state.graphCurrentLevel)) graphCurrentLevel = state.graphCurrentLevel;
        setExperienceMode(experienceMode);
        if (selectedNodeId) selectNode(selectedNodeId);
      } catch (error) {
        console.warn("Could not restore saved RepoPath workspace:", error);
      }
    }

    function saveWorkspace() {
      persistWorkspace();
      if (selectedNodeId) window.location.hash = "entity=" + encodeURIComponent(selectedNodeId);
      alert("Workspace saved locally for this repository.");
    }

    function exploreGuidedProject() {
      setExperienceMode("guided");
      switchView("overview");
      document.getElementById("archGrid")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function traceGuidedFeature() {
      setExperienceMode("guided");
      switchView("flow");
      const request = graph?.nodes?.find(n => n.kind === "api_request");
      if (request) {
        const select = document.getElementById("flowSelect");
        if (select) select.value = request.id;
        renderSelectedFlow();
      }
    }

    function guidedFindSource() {
      setExperienceMode("guided");
      openCmdPalette();
      document.getElementById("cmdInput")?.focus();
    }

    function guidedReviewChange() {
      setExperienceMode("guided");
      switchView("impact");
      if (selectedNodeId) runImpactAnalysis();
    }

    function getNodeFolder(node) {
      if (node.attributes && node.attributes.folder) return node.attributes.folder;
      if (!node.location || !node.location.file) return "common";
      const norm = node.location.file.split(String.fromCharCode(92)).join("/");
      const parts = norm.split("/");
      return parts.length > 1 ? parts[0] : "root";
    }

    function getDistinctFolders() {
      if (!graph || !graph.nodes) return [];
      const set = new Set();
      graph.nodes.forEach(n => {
        const f = getNodeFolder(n);
        if (f && f !== "common" && f !== "root") set.add(f);
      });
      return [...set].sort();
    }

    function renderFolderFilterChips() {
      const bar = document.getElementById("folderChipsBar");
      if (!bar) return;
      const folders = getDistinctFolders();
      if (folders.length <= 1) {
        bar.style.display = "none";
        return;
      }
      bar.style.display = "flex";
      let html = '<span class="chip ' + (activeFolderFilter === 'all' ? 'active' : '') + '" data-folder="all" onclick="toggleFolderFilter(this.dataset.folder)">📁 All Folders</span>';
      folders.forEach(f => {
        html += '<span class="chip ' + (activeFolderFilter === f ? 'active' : '') + '" data-folder="' + escapeHtml(f) + '" onclick="toggleFolderFilter(this.dataset.folder)">📁 ' + escapeHtml(f) + '</span>';
      });
      bar.innerHTML = html;
    }

    function toggleFolderFilter(folder) {
      activeFolderFilter = folder;
      renderFolderFilterChips();
      renderTreeList();
      renderOverview();
      renderGraphCanvas();
    }

    // Graph visual state
    let zoomLevel = 1;
    let panX = 40;
    let panY = 40;
    let isDragging = false;
    let startDragX = 0;
    let startDragY = 0;

    // Initialize application
    function startApp() {
      if (graph) {
        initGraph(graph);
      } else if (!isOfflineMode) {
        loadGraphFromServer();
      }
      setupKeyboardShortcuts();
      setupPanZoom();
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", startApp);
    } else {
      startApp();
    }

    async function loadGraphFromServer() {
      try {
        const res = await fetch("/api/graph");
        if (res.ok) {
          const data = await res.json();
          initGraph(data);
        } else {
          openScanWizard();
        }
      } catch (e) {
        console.warn("Could not load graph from server:", e);
      }
    }

    function getDistinctRelations() {
      if (!graph || !graph.edges) return [];
      const map = new Map();
      graph.edges.forEach(e => {
        if (e.relation) {
          map.set(e.relation, (map.get(e.relation) || 0) + 1);
        }
      });
      return [...map.entries()].sort((a, b) => b[1] - a[1]);
    }

    function renderRelationButtons() {
      const bar = document.getElementById("relationFilterBar");
      const leftBar = document.getElementById("leftRelationChipsBar");
      const select = document.getElementById("relationFilterSelect");
      if (!graph || !graph.edges) return;
      const relations = getDistinctRelations();
      const totalEdges = graph.edges.length;

      // 1. Canvas overlay relation pills
      if (bar) {
        let barHtml = '<button class="relation-pill-btn ' + (visibleRelationFilter === 'all' ? 'active' : '') + '" data-rel="all" onclick="filterByRelation(this.dataset.rel)">' +
          '<span>All</span><span class="relation-count-badge">' + totalEdges + '</span></button>';
        relations.forEach(([rel, count]) => {
          barHtml += '<button class="relation-pill-btn ' + (visibleRelationFilter === rel ? 'active' : '') + '" data-rel="' + escapeHtml(rel) + '" onclick="filterByRelation(this.dataset.rel)">' +
            '<span>' + escapeHtml(rel) + '</span><span class="relation-count-badge">' + count + '</span></button>';
        });
        bar.innerHTML = barHtml;
      }

      // 2. Left explorer chips bar
      if (leftBar) {
        let leftHtml = '<span style="font-size:10px;text-transform:uppercase;color:var(--text-muted);font-weight:600;margin-right:2px;display:flex;align-items:center;">Relations:</span>' +
          '<span class="chip ' + (visibleRelationFilter === 'all' ? 'active' : '') + '" data-rel="all" onclick="filterByRelation(this.dataset.rel)">All (' + totalEdges + ')</span>';
        relations.forEach(([rel, count]) => {
          leftHtml += '<span class="chip ' + (visibleRelationFilter === rel ? 'active' : '') + '" data-rel="' + escapeHtml(rel) + '" onclick="filterByRelation(this.dataset.rel)">' + escapeHtml(rel) + ' (' + count + ')</span>';
        });
        leftBar.innerHTML = leftHtml;
      }

      // 3. Fallback select
      if (select) {
        let selHtml = '<option value="all">All Relations (' + totalEdges + ')</option>';
        relations.forEach(([rel, count]) => {
          selHtml += '<option value="' + escapeHtml(rel) + '">' + escapeHtml(rel) + ' (' + count + ')</option>';
        });
        select.innerHTML = selHtml;
        select.value = visibleRelationFilter;
      }
    }

    function initGraph(loadedGraph) {
      graph = loadedGraph;
      const hashEntity = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("entity");
      if (hashEntity && graph.nodes.some(n => n.id === hashEntity)) selectedNodeId = hashEntity;
      document.getElementById("headerRepoBadge").textContent = graph.repository || "Repository";

      // Branch & commit badge
      const branchBadge = document.getElementById("headerBranchBadge");
      if (branchBadge) {
        const branchName = graph.metadata?.workingTree?.branch || graph.metadata?.workingTree?.commit || "";
        if (branchName) {
          branchBadge.textContent = "⎇ " + branchName;
          branchBadge.style.display = "inline-flex";
        }
      }

      // Status badge
      const statusBadge = document.getElementById("headerStatusBadge");
      if (statusBadge) {
        statusBadge.textContent = "✓ " + (graph.nodes?.length || 0) + " nodes · " + (graph.edges?.length || 0) + " relations";
        statusBadge.style.display = "inline-flex";
      }

      renderFolderFilterChips();
      renderRelationButtons();
      renderTreeList();
      renderOverview();
      restoreWorkspace();
      renderGraphCanvas();
      renderFlowSelector();
      renderApiExplorer();
      if (graph.nodes && graph.nodes.length > 0) {
        selectNode(graph.nodes[0].id);
      }
    }

    function switchView(viewName) {
      document.querySelectorAll(".nav-tab").forEach(tab => {
        tab.classList.toggle("active", tab.dataset.view === viewName);
      });
      document.querySelectorAll(".view-container").forEach(view => {
        view.classList.toggle("active", view.id === "view-" + viewName);
      });
      document.getElementById("graphControls").style.display = viewName === "graph" ? "flex" : "none";
      if (viewName === "api") renderApiExplorer();
      if (viewName === "impact" && selectedNodeId) {
        const node = graph?.nodes?.find(n => n.id === selectedNodeId);
        const input = document.getElementById("impactInput");
        if (node && input && !input.value) {
          input.value = node.label;
          runImpactAnalysis();
        }
      }
    }

    let graphCurrentLevel = 1; // 1: System Architecture, 2: Modules, 3: Dependencies
    let graphHops = 1;
    let visibleRelationFilter = "all";
    let apiFilter = "all";
    let selectedApiOperationId = null;
    let apiDetailTab = "overview";

    function getApiOperationsClient() {
      if (!graph) return [];
      const byId = new Map(graph.nodes.map(n => [n.id, n]));
      const routes = graph.nodes.filter(n => n.kind === "api_route");
      const requests = graph.nodes.filter(n => n.kind === "api_request");
      const linked = new Set();
      const operations = routes.map(route => {
        const targetEdges = graph.edges.filter(e => e.relation === "TARGETS" && e.target === route.id);
        const routeRequests = targetEdges.map(e => byId.get(e.source)).filter(Boolean);
        routeRequests.forEach(n => linked.add(n.id));
        const handlers = graph.edges.filter(e => (e.relation === "HANDLES" || e.relation === "HANDLES_ROUTE") && e.source === route.id).map(e => byId.get(e.target)).filter(Boolean);
        const fields = graph.edges.filter(e => e.relation === "DECLARES_FIELD" && e.source === route.id).map(e => byId.get(e.target)).filter(Boolean);
        const tests = graph.edges.filter(e => (e.relation === "TESTS" || e.relation === "EXERCISES") && e.target === route.id).map(e => byId.get(e.source)).filter(Boolean);
        const data = [];
        const queue = handlers.map(n => n.id);
        const seen = new Set();
        while (queue.length) {
          const current = queue.shift();
          graph.edges.filter(e => e.source === current && ["CALLS", "TOUCHES_DATABASE", "QUERIES", "READS_TABLE", "WRITES_TABLE"].includes(e.relation)).forEach(e => {
            if (seen.has(e.target)) return;
            seen.add(e.target);
            const node = byId.get(e.target);
            if (node) { data.push(node); queue.push(node.id); }
          });
        }
        return {
          operationId: "operation:" + route.id,
          method: (route.label.split(" ")[0] || "HTTP").toUpperCase(),
          path: route.label.split(" ").slice(1).join(" ") || route.label,
          route, requests: routeRequests, handlers, fields, tests, dataDependencies: data,
          consumers: targetEdges.map(e => graph.edges.find(c => c.relation === "REQUESTS" && c.target === e.source)).filter(Boolean).map(e => byId.get(e.source)).filter(Boolean),
          evidence: [...targetEdges, ...graph.edges.filter(e => e.source === route.id || e.target === route.id)],
          resolution: "MATCHED",
          contractStatus: fields.length ? "described" : "partially_described",
          warnings: [!handlers.length ? "No route handler was mapped." : "", !fields.length ? "No formal response schema fields were discovered." : "", !tests.length ? "No discovered test directly exercises this operation." : ""].filter(Boolean)
        };
      });
      requests.filter(n => !linked.has(n.id)).forEach(request => {
        const label = request.label || "HTTP request";
        const parts = label.split(" ");
        const method = String(request.attributes?.httpMethod || parts.shift() || "HTTP").toUpperCase();
        const path = String(request.attributes?.urlPattern || parts.join(" ") || label);
        operations.push({ operationId: "operation:" + request.id, method, path, route: null, requests: [request], handlers: [], fields: [], tests: [], dataDependencies: [], consumers: [], evidence: [], resolution: /^https?:\\/\\//i.test(path) ? "EXTERNAL" : "UNRESOLVED", contractStatus: "missing", warnings: ["No deterministic server route match was discovered."] });
      });
      return operations.sort((a, b) => (a.method + a.path).localeCompare(b.method + b.path));
    }

    function apiOperationStatusClass(operation) {
      return String(operation.resolution || "unresolved").toLowerCase();
    }

    function renderApiExplorer() {
      const list = document.getElementById("apiCatalogList");
      const filters = document.getElementById("apiFilterRow");
      if (!list || !filters || !graph) return;
      const operations = getApiOperationsClient();
      const counts = { all: operations.length, unresolved: operations.filter(o => o.resolution === "UNRESOLVED").length, missing: operations.filter(o => o.contractStatus === "missing").length, untested: operations.filter(o => !o.tests.length).length, matched: operations.filter(o => o.resolution === "MATCHED").length };
      filters.innerHTML = [["all", "All APIs"], ["matched", "Matched"], ["unresolved", "Unresolved"], ["missing", "Missing contract"], ["untested", "Untested"]].map(([key, label]) => '<button class="api-filter ' + (apiFilter === key ? "active" : "") + '" data-api-filter="' + key + '" onclick="setApiFilter(this.dataset.apiFilter)">' + label + ' <span style="opacity:.65;">' + counts[key] + '</span></button>').join("");
      const search = (document.getElementById("apiSearchInput")?.value || "").toLowerCase();
      const visible = operations.filter(o => {
        const filterMatch = apiFilter === "all" || (apiFilter === "matched" && o.resolution === "MATCHED") || (apiFilter === "unresolved" && o.resolution === "UNRESOLVED") || (apiFilter === "missing" && o.contractStatus === "missing") || (apiFilter === "untested" && !o.tests.length);
        return filterMatch && (o.method + " " + o.path + " " + (o.route?.location?.file || "")).toLowerCase().includes(search);
      });
      list.innerHTML = visible.length ? visible.map(o => '<div class="api-row ' + (o.operationId === selectedApiOperationId ? "active" : "") + '" data-api-id="' + escapeHtml(o.operationId) + '" onclick="selectApiOperation(this.dataset.apiId)"><div class="api-row-top"><span class="api-method">' + escapeHtml(o.method) + '</span><span class="api-path">' + escapeHtml(o.path) + '</span><span class="api-status ' + apiOperationStatusClass(o) + '">' + escapeHtml(o.resolution) + '</span></div><div class="api-status-line"><span class="api-row-meta">' + o.requests.length + ' consumers · ' + o.fields.length + ' fields · ' + o.dataDependencies.length + ' data links</span><span class="api-row-meta">' + (o.tests.length ? '<i class="fa-solid fa-check"></i> tested' : '<i class="fa-solid fa-triangle-exclamation"></i> no test') + '</span></div></div>').join("") : '<div style="padding:18px;color:var(--text-muted);font-size:11px;">No API operations match this filter.</div>';
      if (!selectedApiOperationId && visible[0]) selectedApiOperationId = visible[0].operationId;
      if (selectedApiOperationId) renderApiDetail(operations.find(o => o.operationId === selectedApiOperationId) || visible[0]);
    }

    function setApiFilter(filter) {
      apiFilter = filter;
      renderApiExplorer();
    }

    function selectApiOperation(operationId) {
      selectedApiOperationId = operationId;
      apiDetailTab = "overview";
      renderApiExplorer();
      const operation = getApiOperationsClient().find(o => o.operationId === operationId);
      if (operation?.route) selectNode(operation.route.id, false);
    }

    function renderApiDetail(operation) {
      const panel = document.getElementById("apiDetailPanel");
      if (!panel || !operation) return;
      const tabs = ["overview", "request", "response", "implementation", "data", "consumers", "tests", "runtime", "changes"];
      const tabContent = {
        overview: '<div class="api-detail-grid"><div class="api-stat"><div class="api-stat-label">Resolution</div><div class="api-stat-value">' + escapeHtml(operation.resolution) + '</div></div><div class="api-stat"><div class="api-stat-label">Contract</div><div class="api-stat-value">' + escapeHtml(operation.contractStatus) + '</div></div><div class="api-stat"><div class="api-stat-label">Requests</div><div class="api-stat-value">' + operation.requests.length + ' discovered</div></div><div class="api-stat"><div class="api-stat-label">Evidence</div><div class="api-stat-value">' + operation.evidence.length + ' relationships</div></div></div><div class="api-evidence-list">' + (operation.sourceLocations?.length ? operation.sourceLocations.map(loc => '<div class="api-evidence-item"><strong><i class="fa-regular fa-file-code"></i> Source</strong> <span class="source-link-pill" data-file="' + escapeHtml(loc.file) + '" data-line="' + loc.line + '" onclick="inspectSourceLine(this.dataset.file, Number(this.dataset.line))">' + escapeHtml(loc.file) + ':' + loc.line + '</span></div>').join("") : '<div class="api-evidence-item">No source location was discovered.</div>') + '</div>',
        request: renderApiNodes(operation.requests, "Request call sites and constructed HTTP identities."),
        response: renderApiNodes(operation.fields.map(f => f.node), "Response fields are formal only when backed by schema evidence; consumer reads remain separate evidence."),
        implementation: renderApiNodes([...operation.handlers, ...(operation.route ? [operation.route] : [])], "Route and handler implementation evidence."),
        data: renderApiNodes(operation.dataDependencies, "Database operations and models reached through mapped handler dependencies."),
        consumers: renderApiNodes(operation.consumers, "Frontend or service callers mapped to this operation."),
        tests: renderApiNodes(operation.tests, operation.tests.length ? "Tests linked to this operation." : "No discovered tests directly exercise this operation."),
        runtime: '<div class="api-evidence-item">Runtime trace evidence is ' + (graph.scanScope?.runtimeTraces === "complete" ? "available in the scanned graph." : "not imported for this scan.") + '</div>',
        changes: '<div class="api-evidence-item">Run Change Impact with this operation selected to inspect affected consumers and recommended tests. Static, inferred, and unresolved evidence remain distinct.</div>'
      };
      panel.innerHTML = '<div class="api-detail-header"><div><div style="color:var(--accent-cyan);font-size:10px;text-transform:uppercase;letter-spacing:.14em;">API operation</div><div class="api-detail-title">' + escapeHtml(operation.method + " " + operation.path) + '</div></div><span class="api-status ' + apiOperationStatusClass(operation) + '">' + escapeHtml(operation.resolution) + '</span></div><div class="api-detail-tabs">' + tabs.map(tab => '<button class="api-detail-tab ' + (apiDetailTab === tab ? "active" : "") + '" data-api-tab="' + tab + '" onclick="setApiDetailTab(this.dataset.apiTab)">' + tab.toUpperCase() + '</button>').join("") + '</div><div class="api-detail-content">' + (operation.warnings.length ? '<div class="api-evidence-item" style="border-color:var(--accent-amber);margin-bottom:14px;"><strong><i class="fa-solid fa-triangle-exclamation"></i> Analysis limits</strong><div style="margin-top:5px;">' + operation.warnings.map(w => escapeHtml(w)).join("<br>") + '</div></div>' : '') + (tabContent[apiDetailTab] || tabContent.overview) + '</div>';
    }

    function renderApiNodes(nodes, description) {
      return '<div style="color:var(--text-muted);font-size:11px;margin-bottom:10px;">' + escapeHtml(description) + '</div>' + (nodes.length ? '<div class="api-evidence-list">' + nodes.map(n => '<div class="api-evidence-item" data-id="' + escapeHtml(n.id) + '" onclick="selectNode(this.dataset.id); switchView(\\'graph\\');"><strong>' + escapeHtml(n.label) + '</strong><div style="color:var(--text-muted);margin-top:3px;">' + escapeHtml(n.kind) + (n.location ? ' · ' + escapeHtml(n.location.file) + ':' + n.location.line : '') + '</div></div>').join("") + '</div>' : '<div class="api-evidence-item">No evidence discovered in the current scan.</div>');
    }

    function setApiDetailTab(tab) {
      apiDetailTab = tab;
      renderApiExplorer();
    }

    function renderEvidenceBadge(status) {
      if (status === "observed") {
        return '<span class="evidence-badge status-observed">● Runtime Observed</span>';
      }
      if (status === "statically_established") {
        return '<span class="evidence-badge status-static">● Static Match</span>';
      }
      if (status === "inferred") {
        return '<span class="evidence-badge status-inferred">● Inferred</span>';
      }
      if (status === "unresolved") {
        return '<span class="evidence-badge status-unresolved">⚠ Unresolved</span>';
      }
      return '<span class="evidence-badge status-static">● ' + escapeHtml(status || "Static") + '</span>';
    }

    function showEdgeEvidence(edgeId) {
      const edge = graph?.edges?.find(e => e.id === edgeId);
      if (!edge) return;
      const evidence = edge.evidence || {};
      const location = evidence.location ? evidence.location.file + ":" + evidence.location.line : "No source location";
      alert("Why is this connected?\\n\\n" +
        edge.relation + "\\n" +
        "Evidence: " + (evidence.status || "unresolved") + "\\n" +
        "Confidence: " + (evidence.confidence || "unknown") + "\\n" +
        "Source: " + location + "\\n" +
        (evidence.detail || "No further evidence detail available."));
    }

    /* Classification Helper */
    function getNodeLayer(node) {
      if (node.kind === "test") return "tests";
      if (node.kind === "database_operation" || node.kind === "database_entity" ||
          node.kind === "database_table" || node.kind === "data_model" ||
          node.kind === "query" || node.kind === "migration") return "data_layer";
      if (node.kind === "ui_component" || node.kind === "context" || node.kind === "client_script" ||
          (node.attributes && (node.attributes.isReactComponent || node.attributes.isProvider || node.attributes.isHook || node.attributes.isClientScript))) {
        return "frontend";
      }
      if (node.kind === "api_request" || node.kind === "query_parameter" || node.kind === "api_field" || node.kind === "static_asset") {
        return "api_client";
      }
      if (node.kind === "api_route" || node.kind === "api_contract") return "backend";
      return "backend";
    }

    function getNodeColor(layer) {
      switch(layer) {
        case "frontend": return "#39c5cf";
        case "api_client": return "#bc8cff";
        case "backend": return "#3fb950";
        case "data_layer": return "#d29922";
        case "tests": return "#58a6ff";
        default: return "#8b949e";
      }
    }

    function exploreLayer(layer) {
      if (layer === "api_client") {
        switchView("flow");
      } else {
        toggleLayerFilter(layer);
        setGraphLevel(2);
        switchView("graph");
      }
    }

    function calculateProjectMetrics(targetGraph, folderFilter) {
      const g = targetGraph || graph;
      if (!g) return null;
      const nodes = g.nodes || [];
      const edges = g.edges || [];
      const filter = folderFilter || activeFolderFilter || "all";

      const scopedNodes = filter === "all"
        ? nodes
        : nodes.filter(n => getNodeFolder(n) === filter);

      const scopedNodeIds = new Set(scopedNodes.map(n => n.id));
      const scopedEdges = filter === "all"
        ? edges
        : edges.filter(e => scopedNodeIds.has(e.source) || scopedNodeIds.has(e.target));

      const resolvedRequestIds = new Set();
      scopedEdges.forEach(e => {
        if (e.relation === "TARGETS") resolvedRequestIds.add(e.source);
      });

      const layers = {
        frontend: { total: 0, components: 0, providers: 0, clientScripts: 0, keyEntryPoints: [] },
        api_client: { total: 0, requests: 0, parameters: 0, fields: 0, staticAssets: 0, unresolvedRequests: 0, keyEntryPoints: [] },
        backend: { total: 0, routes: 0, handlers: 0, contracts: 0, keyEntryPoints: [] },
        data_layer: { total: 0, operations: 0, tables: 0, models: 0, queries: 0, migrations: 0, keyEntryPoints: [] },
        tests: { total: 0, testCases: 0, keyEntryPoints: [] },
        other: { total: 0 }
      };

      const sidebarCounts = {
        frontend: 0,
        backend_routes: 0,
        api_client: 0,
        backend_services: 0,
        data_layer: 0,
        tests: 0
      };

      scopedNodes.forEach(node => {
        const layer = getNodeLayer(node);
        if (!layers[layer]) return;
        layers[layer].total += 1;

        switch (layer) {
          case "frontend":
            sidebarCounts.frontend += 1;
            if (node.kind === "context" || (node.attributes && node.attributes.isProvider)) {
              layers.frontend.providers += 1;
            } else if (node.kind === "client_script" || (node.attributes && node.attributes.isClientScript)) {
              layers.frontend.clientScripts += 1;
            } else {
              layers.frontend.components += 1;
            }
            if (/^(app|index|main|root|layout|home|dashboard)/i.test(node.label) && layers.frontend.keyEntryPoints.length < 4) {
              layers.frontend.keyEntryPoints.push(node);
            }
            break;
          case "api_client":
            sidebarCounts.api_client += 1;
            if (node.kind === "api_request") {
              layers.api_client.requests += 1;
              if (!resolvedRequestIds.has(node.id)) {
                layers.api_client.unresolvedRequests += 1;
              }
              if (layers.api_client.keyEntryPoints.length < 4) {
                layers.api_client.keyEntryPoints.push(node);
              }
            } else if (node.kind === "query_parameter") {
              layers.api_client.parameters += 1;
            } else if (node.kind === "api_field") {
              layers.api_client.fields += 1;
            } else if (node.kind === "static_asset") {
              layers.api_client.staticAssets += 1;
            }
            break;
          case "backend":
            if (node.kind === "api_route" || node.kind === "api_contract") {
              sidebarCounts.backend_routes += 1;
              if (node.kind === "api_route") {
                layers.backend.routes += 1;
                if (layers.backend.keyEntryPoints.length < 4) {
                  layers.backend.keyEntryPoints.push(node);
                }
              } else {
                layers.backend.contracts += 1;
              }
            } else {
              sidebarCounts.backend_services += 1;
              layers.backend.handlers += 1;
              if (layers.backend.keyEntryPoints.length < 4) {
                layers.backend.keyEntryPoints.push(node);
              }
            }
            break;
          case "data_layer":
            sidebarCounts.data_layer += 1;
            if (node.kind === "database_operation") {
              layers.data_layer.operations += 1;
            } else if (node.kind === "database_table" || node.kind === "database_entity") {
              layers.data_layer.tables += 1;
              if (layers.data_layer.keyEntryPoints.length < 4) {
                layers.data_layer.keyEntryPoints.push(node);
              }
            } else if (node.kind === "data_model") {
              layers.data_layer.models += 1;
            } else if (node.kind === "query") {
              layers.data_layer.queries += 1;
            } else if (node.kind === "migration") {
              layers.data_layer.migrations += 1;
            }
            break;
          case "tests":
            sidebarCounts.tests += 1;
            layers.tests.testCases += 1;
            if (layers.tests.keyEntryPoints.length < 4) {
              layers.tests.keyEntryPoints.push(node);
            }
            break;
        }
      });

      const evidenceStatus = {
        statically_established: 0,
        observed: 0,
        inferred: 0,
        unresolved: 0
      };
      scopedEdges.forEach(e => {
        const s = e.evidence?.status || "statically_established";
        if (evidenceStatus[s] !== undefined) evidenceStatus[s] += 1;
      });

      return {
        totalNodes: scopedNodes.length,
        totalEdges: scopedEdges.length,
        layers,
        sidebarCounts,
        evidenceStatus
      };
    }

    function getNodeDisplayLabel(node, g) {
      if (!node) return "";
      const currentGraph = g || graph;
      if (node.kind === "database_operation") {
        const q = node.attributes?.query;
        let op = "";
        let table = "";
        if (q && typeof q === "string") {
          const opMatch = /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/i.exec(q);
          if (opMatch) op = opMatch[1].toUpperCase();
          const tableMatch = /(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+(?:IF\s+NOT\s+EXISTS\s+)?['"]?([A-Za-z0-9_]+)/i.exec(q);
          if (tableMatch) table = tableMatch[1];
        }
        if (!table && currentGraph && currentGraph.edges) {
          const edge = currentGraph.edges.find(e => e.source === node.id && (e.relation === "TOUCHES_DATABASE" || e.relation === "QUERIES" || e.relation === "READS_TABLE"));
          if (edge) {
            const targetNode = currentGraph.nodes.find(n => n.id === edge.target);
            if (targetNode) table = targetNode.label;
          }
        }
        if (op && table) return op + " " + table;
        if (table) return node.label + " (" + table + ")";
        if (q && typeof q === "string") {
          const cleanQ = q.replace(/\s+/g, ' ').trim();
          return cleanQ.length > 25 ? cleanQ.slice(0, 25) + '…' : cleanQ;
        }
      }
      return node.label;
    }

    function formatSmartNodeLabel(label, maxLen) {
      if (!maxLen) maxLen = 22;
      if (!label || label.length <= maxLen) return label || "";
      const httpMatch = /^(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s+(.+)$/i.exec(label);
      if (httpMatch) {
        const method = httpMatch[1].toUpperCase();
        const path = httpMatch[2];
        const segs = path.split("/").filter(Boolean);
        if (segs.length > 1) {
          const last = segs[segs.length - 1];
          const cand = method + " …/" + last;
          if (cand.length <= maxLen) return cand;
          return method + " …" + last.slice(-(maxLen - method.length - 3));
        }
      }
      if (label.indexOf("/") !== -1) {
        const parts = label.split("/").filter(Boolean);
        const fileName = parts[parts.length - 1];
        if (fileName.length <= maxLen) {
          const parent = parts[parts.length - 2];
          if (parent && ("…/" + parent + "/" + fileName).length <= maxLen) {
            return "…/" + parent + "/" + fileName;
          }
          return (parts.length > 1 ? "…/" : "") + fileName;
        }
        return "…" + fileName.slice(-(maxLen - 1));
      }
      return label.slice(0, maxLen - 1) + "…";
    }

    /* View 1: Architecture Overview */
    function renderProjectBriefGlobal() {
      const panel = document.getElementById("projectBriefPanel");
      if (!panel || !graph) return;
      const routes = graph.nodes.filter(n => n.kind === "api_route");
      const tests = graph.nodes.filter(n => n.kind === "test");
      const unresolved = graph.edges.filter(e => e.evidence?.status === "unresolved");
      const problems = [];
      if (unresolved.length) problems.push(unresolved.length + " unresolved relationships need investigation.");
      if (!tests.length) problems.push("No tests discovered in the scanned scope.");
      if (!routes.length) problems.push("No backend routes discovered; backend coverage may be incomplete.");
      panel.innerHTML = '<div class="arch-card" style="padding:14px;"><div class="arch-card-header"><span class="arch-card-title">Project Brief</span><span class="arch-badge">' + graph.nodes.length + ' discovered entities</span></div><p class="arch-card-desc">This repository contains ' + graph.nodes.filter(n => getNodeLayer(n) === "frontend").length + ' frontend, ' + routes.length + ' API/backend, and ' + graph.nodes.filter(n => getNodeLayer(n) === "data_layer").length + ' data-layer entities connected by evidence-backed relationships.</p><div style="font-size:12px;color:var(--text-muted);"><strong style="color:var(--text-bright);">Known gaps:</strong> ' + escapeHtml(problems.length ? problems.join(" ") : "No immediate gaps detected in the scanned scope.") + '</div></div>';
    }

    async function showHealthFindingsGlobal() {
      const panel = document.getElementById("healthPanel");
      if (!panel) return;
      if (isOfflineMode) { panel.textContent = "Health checks require the live dashboard service."; return; }
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error("Health check failed: " + res.status);
      const data = await res.json();
      panel.innerHTML = '<div class="arch-card" style="padding:12px;"><div class="arch-card-header"><span class="arch-card-title">Architecture Health</span><span class="arch-badge">' + data.findings.length + ' findings</span></div>' + (data.findings.length ? data.findings.map(f => '<div style="font-size:12px;margin-top:6px;">[' + escapeHtml(f.severity) + '] ' + escapeHtml(f.message) + '</div>').join("") : '<div style="color:var(--accent-green);font-size:12px;">No findings in the analyzed scope.</div>') + '</div>';
    }

    async function showContractsGlobal() {
      if (isOfflineMode) { alert("API contract exploration requires the live dashboard service."); return; }
      const res = await fetch("/api/contracts");
      if (!res.ok) throw new Error("Contract query failed: " + res.status);
      const data = await res.json();
      const panel = document.getElementById("healthPanel");
      if (panel) panel.innerHTML = '<div class="arch-card" style="padding:12px;"><div class="arch-card-header"><span class="arch-card-title">API Contracts</span><span class="arch-badge">' + data.contracts.length + ' routes</span></div>' + data.contracts.slice(0, 12).map(c => '<div style="font-size:12px;margin-top:7px;"><strong>' + escapeHtml(c.route.label) + '</strong> — ' + c.fields.length + ' response fields, ' + c.requests.length + ' client consumers' + (c.warnings.length ? '<div style="color:var(--accent-amber);">' + escapeHtml(c.warnings.join(" ")) + '</div>' : '') + '</div>').join("") + '</div>';
    }

    async function downloadArchitectureGlobal() {
      if (isOfflineMode) { alert("Architecture document generation requires the live dashboard service."); return; }
      const res = await fetch("/api/architecture");
      if (!res.ok) throw new Error("Architecture generation failed: " + res.status);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(await res.blob());
      link.download = "ARCHITECTURE.md";
      link.click();
    }

    function renderOverview() {
      if (!graph) return;
      const metrics = calculateProjectMetrics(graph, activeFolderFilter);
      renderProjectBriefGlobal();
      const folders = getDistinctFolders();
      const foldersSection = document.getElementById("foldersOverviewSection");
      if (foldersSection) {
        if (folders.length > 1) {
          foldersSection.style.display = "block";
          let fHtml = '<div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">' +
            '<h3 style="font-size:14px;font-weight:700;color:var(--text-bright);">📁 Project Folders & Locations (' + folders.length + ' detected)</h3>' +
            '<span style="font-size:12px;color:var(--text-muted);">' + (activeFolderFilter === "all" ? "Showing all locations" : "Filtered to " + escapeHtml(activeFolderFilter)) + '</span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:12px;">';

          folders.forEach(f => {
            const fMetrics = calculateProjectMetrics(graph, f);
            const isSelected = activeFolderFilter === f;
            fHtml += '<div class="arch-card" style="padding:12px;cursor:pointer;border-color:' + (isSelected ? 'var(--accent-blue)' : 'var(--border-subtle)') + ';background:' + (isSelected ? 'rgba(88,166,255,0.08)' : 'var(--bg-secondary)') + ';" data-folder="' + escapeHtml(f) + '" onclick="toggleFolderFilter(this.dataset.folder)">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
                '<strong style="color:var(--text-bright);font-size:14px;">📁 ' + escapeHtml(f) + '</strong>' +
                '<span class="arch-badge" style="background:rgba(88,166,255,0.15);color:var(--accent-blue);">' + fMetrics.totalNodes + ' entities</span>' +
              '</div>' +
              '<div style="font-size:11px;color:var(--text-muted);display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">' +
                '<span>' + fMetrics.layers.frontend.total + ' Frontend</span> · ' +
                '<span>' + fMetrics.layers.api_client.total + ' API</span> · ' +
                '<span>' + fMetrics.layers.backend.total + ' Backend</span> · ' +
                '<span>' + fMetrics.layers.data_layer.total + ' Data</span>' +
              '</div>' +
            '</div>';
          });
          fHtml += '</div>';
          foldersSection.innerHTML = fHtml;
        } else {
          foldersSection.style.display = "none";
        }

        function renderProjectBrief() {
          const panel = document.getElementById("projectBriefPanel");
          if (!panel || !graph) return;
          const areas = getDistinctFolders();
          const routes = graph.nodes.filter(n => n.kind === "api_route");
          const tests = graph.nodes.filter(n => n.kind === "test");
          const unresolved = graph.edges.filter(e => e.evidence?.status === "unresolved");
          const problems = [];
          if (unresolved.length) problems.push(unresolved.length + " unresolved relationships need investigation.");
          if (!tests.length) problems.push("No tests discovered in the scanned scope.");
          if (!routes.length) problems.push("No backend routes discovered; backend coverage may be incomplete.");
          panel.innerHTML =
            '<div class="arch-card" style="padding:14px;">' +
              '<div class="arch-card-header"><span class="arch-card-title">Project Brief</span><span class="arch-badge">' + graph.nodes.length + ' discovered entities</span></div>' +
              '<p class="arch-card-desc">This repository contains ' + graph.nodes.filter(n => getNodeLayer(n) === "frontend").length + ' frontend, ' + routes.length + ' API/backend, and ' + graph.nodes.filter(n => getNodeLayer(n) === "data_layer").length + ' data-layer entities connected by evidence-backed relationships.</p>' +
              '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;font-size:12px;">' +
                '<div><strong style="color:var(--text-bright);">Where to start</strong><div style="color:var(--text-muted);">' + escapeHtml((areas.length ? areas.slice(0, 3).join(", ") : "entry points and API routes")) + '</div></div>' +
                '<div><strong style="color:var(--text-bright);">Known gaps</strong><div style="color:var(--text-muted);">' + escapeHtml(problems.length ? problems.join(" ") : "No immediate gaps detected in the scanned scope.") + '</div></div>' +
                '<div><strong style="color:var(--text-bright);">Suggested next step</strong><div style="color:var(--text-muted);">Trace a representative feature, then run impact analysis before changing shared code.</div></div>' +
              '</div>' +
            '</div>';
        }

        async function showHealthFindings() {
          const panel = document.getElementById("healthPanel");
          if (!panel) return;
          if (isOfflineMode) {
            panel.innerHTML = '<div class="arch-card" style="padding:12px;color:var(--text-muted);">Health checks require the live dashboard service.</div>';
            return;
          }
          panel.innerHTML = '<div class="arch-card" style="padding:12px;">Running architecture health checks...</div>';
          const res = await fetch("/api/health");
          if (!res.ok) throw new Error("Health check failed: " + res.status);
          const data = await res.json();
          const findings = data.findings || [];
          panel.innerHTML = '<div class="arch-card" style="padding:12px;"><div class="arch-card-header"><span class="arch-card-title">Architecture Health</span><span class="arch-badge">' + findings.length + ' findings</span></div>' +
            (findings.length ? findings.map(f => '<div style="font-size:12px;margin-top:6px;color:' + (f.severity === "error" ? 'var(--accent-red)' : f.severity === "warning" ? 'var(--accent-amber)' : 'var(--text-muted)') + ';">[' + escapeHtml(f.severity) + '] ' + escapeHtml(f.message) + '</div>').join("") : '<div style="font-size:12px;color:var(--accent-green);">No findings in the analyzed scope.</div>') + '</div>';
        }

        async function showContracts() {
          if (isOfflineMode) {
            alert("API contract exploration requires the live dashboard service.");
            return;
          }
          const res = await fetch("/api/contracts");
          if (!res.ok) throw new Error("Contract query failed: " + res.status);
          const data = await res.json();
          const panel = document.getElementById("healthPanel");
          if (panel) panel.innerHTML = '<div class="arch-card" style="padding:12px;"><div class="arch-card-header"><span class="arch-card-title">API Contracts</span><span class="arch-badge">' + data.contracts.length + ' routes</span></div>' +
            data.contracts.slice(0, 12).map(c => '<div style="font-size:12px;margin-top:7px;"><strong style="color:var(--text-bright);">' + escapeHtml(c.route.label) + '</strong> — ' + escapeHtml(c.fields.length + ' response fields, ' + c.requests.length + ' client consumers') + (c.warnings.length ? '<div style="color:var(--accent-amber);">' + escapeHtml(c.warnings.join(" ")) + '</div>' : '') + '</div>').join("") + '</div>';
        }

        async function downloadArchitecture() {
          if (isOfflineMode) {
            alert("Architecture document generation requires the live dashboard service.");
            return;
          }
          const res = await fetch("/api/architecture");
          if (!res.ok) throw new Error("Architecture generation failed: " + res.status);
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "ARCHITECTURE.md";
          link.click();
          URL.revokeObjectURL(url);
        }
      }

      // Coverage summary badges in header
      const badgesContainer = document.getElementById("overviewCoverageBadges");
      if (badgesContainer) {
        badgesContainer.innerHTML =
          '<span class="arch-badge" style="background:var(--bg-secondary);border:1px solid var(--border-subtle);">' + metrics.totalNodes + ' Nodes · ' + metrics.totalEdges + ' Relations</span>' +
          '<span class="arch-badge" style="background:rgba(63,185,80,0.15);color:var(--accent-green);border:1px solid rgba(63,185,80,0.3);">' + metrics.evidenceStatus.statically_established + ' Verified Facts</span>' +
          (metrics.layers.api_client.unresolvedRequests > 0 ? '<span class="arch-badge" style="background:rgba(248,81,73,0.15);color:var(--accent-red);border:1px solid rgba(248,81,73,0.3);">' + metrics.layers.api_client.unresolvedRequests + ' Unresolved</span>' : '') +
          (metrics.layers.tests.total > 0 ? '<span class="arch-badge" style="background:rgba(56,139,253,0.15);color:var(--accent-blue);border:1px solid rgba(56,139,253,0.3);">' + metrics.layers.tests.total + ' Tests</span>' : '');
      }

      const grid = document.getElementById("archGrid");
      if (!grid) return;
      grid.innerHTML = "";

      // 1. Frontend Layer
      const fe = metrics.layers.frontend;
      const feTop = fe.keyEntryPoints.length > 0 ? fe.keyEntryPoints : (graph.nodes.filter(n => getNodeLayer(n) === "frontend").slice(0, 3));
      const feCard = document.createElement("div");
      feCard.className = "arch-card";
      feCard.innerHTML =
        '<div class="arch-card-header">' +
          '<span class="arch-card-title">Frontend Layer</span>' +
          '<span class="arch-badge" style="background:rgba(57,197,207,0.15);color:var(--accent-cyan);">' + fe.total + ' entities</span>' +
        '</div>' +
        '<p class="arch-card-desc">React component tree, state providers, and client scripts.</p>' +
        '<div style="display:flex;flex-direction:column;gap:3px;margin:6px 0;">' +
          '<div class="layer-metric-row"><span class="layer-metric-label">UI Components</span><span class="layer-metric-val">' + fe.components + '</span></div>' +
          '<div class="layer-metric-row"><span class="layer-metric-label">Context Providers</span><span class="layer-metric-val">' + fe.providers + '</span></div>' +
          '<div class="layer-metric-row"><span class="layer-metric-label">Client Scripts</span><span class="layer-metric-val">' + fe.clientScripts + '</span></div>' +
        '</div>' +
        '<div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-top:6px;">Key Entry Points:</div>' +
        '<ul class="arch-node-list">' +
          feTop.map(n => '<li data-id="' + escapeHtml(n.id) + '" data-view="graph" onclick="selectNode(this.dataset.id); switchView(this.dataset.view);"><span>' + escapeHtml(n.label) + '</span><span style="color:var(--text-muted);font-size:10px;">' + n.kind + '</span></li>').join('') +
        '</ul>' +
        '<button class="explore-layer-btn" data-layer="frontend" onclick="exploreLayer(this.dataset.layer)"><span>Explore Frontend Modules</span><span>→</span></button>';
      grid.appendChild(feCard);

      // 2. API Client Layer
      const api = metrics.layers.api_client;
      const apiTop = api.keyEntryPoints.length > 0 ? api.keyEntryPoints : (graph.nodes.filter(n => n.kind === "api_request").slice(0, 3));
      const apiCard = document.createElement("div");
      apiCard.className = "arch-card";
      apiCard.innerHTML =
        '<div class="arch-card-header">' +
          '<span class="arch-card-title">API Client Layer</span>' +
          '<span class="arch-badge" style="background:rgba(188,140,255,0.15);color:var(--accent-purple);">' + api.total + ' entities</span>' +
        '</div>' +
        '<p class="arch-card-desc">Outgoing HTTP client calls, query parameters, and response field models.</p>' +
        '<div style="display:flex;flex-direction:column;gap:3px;margin:6px 0;">' +
          '<div class="layer-metric-row"><span class="layer-metric-label">HTTP Requests</span><span class="layer-metric-val">' + api.requests + '</span></div>' +
          '<div class="layer-metric-row"><span class="layer-metric-label">Request Parameters</span><span class="layer-metric-val">' + api.parameters + '</span></div>' +
          '<div class="layer-metric-row"><span class="layer-metric-label">Response Fields</span><span class="layer-metric-val">' + api.fields + '</span></div>' +
          '<div class="layer-metric-row"><span class="layer-metric-label">Unresolved Requests</span><span class="layer-metric-val" style="color:' + (api.unresolvedRequests > 0 ? 'var(--accent-red)' : 'var(--text-bright)') + ';">' + api.unresolvedRequests + '</span></div>' +
        '</div>' +
        '<div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-top:6px;">Active Endpoints:</div>' +
        '<ul class="arch-node-list">' +
          (apiTop.length > 0 ? apiTop.map(n => '<li data-id="' + escapeHtml(n.id) + '" data-view="flow" onclick="selectNode(this.dataset.id); switchView(this.dataset.view);"><span>' + escapeHtml(n.label) + '</span><span style="color:var(--text-muted);font-size:10px;">' + n.kind + '</span></li>').join('') : '<li style="color:var(--text-muted);font-size:11px;">No HTTP client requests</li>') +
        '</ul>' +
        '<button class="explore-layer-btn" data-layer="api_client" onclick="exploreLayer(this.dataset.layer)"><span>Explore API Flow</span><span>→</span></button>';
      grid.appendChild(apiCard);

      // 3. Backend Services Layer
      const be = metrics.layers.backend;
      const beTop = be.keyEntryPoints.length > 0 ? be.keyEntryPoints : (graph.nodes.filter(n => n.kind === "api_route").slice(0, 3));
      const beCard = document.createElement("div");
      beCard.className = "arch-card";
      beCard.innerHTML =
        '<div class="arch-card-header">' +
          '<span class="arch-card-title">Backend Services</span>' +
          '<span class="arch-badge" style="background:rgba(63,185,80,0.15);color:var(--accent-green);">' + be.total + ' entities</span>' +
        '</div>' +
        '<p class="arch-card-desc">Express/FastAPI routes, controllers, middleware, and business services.</p>' +
        '<div style="display:flex;flex-direction:column;gap:3px;margin:6px 0;">' +
          '<div class="layer-metric-row"><span class="layer-metric-label">API Routes</span><span class="layer-metric-val">' + be.routes + '</span></div>' +
          '<div class="layer-metric-row"><span class="layer-metric-label">Service Handlers</span><span class="layer-metric-val">' + be.handlers + '</span></div>' +
          '<div class="layer-metric-row"><span class="layer-metric-label">OpenAPI / Schemas</span><span class="layer-metric-val">' + be.contracts + '</span></div>' +
        '</div>' +
        '<div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-top:6px;">Primary Routes:</div>' +
        '<ul class="arch-node-list">' +
          (beTop.length > 0 ? beTop.map(n => '<li data-id="' + escapeHtml(n.id) + '" data-view="graph" onclick="selectNode(this.dataset.id); switchView(this.dataset.view);"><span>' + escapeHtml(n.label) + '</span><span style="color:var(--text-muted);font-size:10px;">' + n.kind + '</span></li>').join('') : '<li style="color:var(--text-muted);font-size:11px;">No backend routes</li>') +
        '</ul>' +
        '<button class="explore-layer-btn" data-layer="backend" onclick="exploreLayer(this.dataset.layer)"><span>Explore Backend Routes</span><span>→</span></button>';
      grid.appendChild(beCard);

      // 4. Data Layer
      const dl = metrics.layers.data_layer;
      const dbTop = dl.keyEntryPoints.length > 0 ? dl.keyEntryPoints : (graph.nodes.filter(n => n.kind === "database_table" || n.kind === "data_model").slice(0, 3));
      const dbCard = document.createElement("div");
      dbCard.className = "arch-card";
      dbCard.innerHTML =
        '<div class="arch-card-header">' +
          '<span class="arch-card-title">Data Layer</span>' +
          '<span class="arch-badge" style="background:rgba(210,153,34,0.15);color:var(--accent-amber);">' + dl.total + ' entities</span>' +
        '</div>' +
        '<p class="arch-card-desc">Database operations, SQL statements, ORM models, and schema tables.</p>' +
        '<div style="display:flex;flex-direction:column;gap:3px;margin:6px 0;">' +
          '<div class="layer-metric-row"><span class="layer-metric-label">Database Operations</span><span class="layer-metric-val">' + dl.operations + '</span></div>' +
          '<div class="layer-metric-row"><span class="layer-metric-label">Schema Tables</span><span class="layer-metric-val">' + dl.tables + '</span></div>' +
          '<div class="layer-metric-row"><span class="layer-metric-label">Data Models & Queries</span><span class="layer-metric-val">' + (dl.models + dl.queries) + '</span></div>' +
        '</div>' +
        '<div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-top:6px;">Storage Entities:</div>' +
        '<ul class="arch-node-list">' +
          (dbTop.length > 0 ? dbTop.map(n => '<li data-id="' + escapeHtml(n.id) + '" data-view="graph" onclick="selectNode(this.dataset.id); switchView(this.dataset.view);"><span>' + escapeHtml(getNodeDisplayLabel(n, graph)) + '</span><span style="color:var(--text-muted);font-size:10px;">' + n.kind + '</span></li>').join('') : '<li style="color:var(--text-muted);font-size:11px;">No schema tables found</li>') +
        '</ul>' +
        '<button class="explore-layer-btn" data-layer="data_layer" onclick="exploreLayer(this.dataset.layer)"><span>Explore Data Layer</span><span>→</span></button>';
      grid.appendChild(dbCard);

      // 5. Automated Tests
      const tests = metrics.layers.tests;
      const testTop = tests.keyEntryPoints.length > 0 ? tests.keyEntryPoints : (graph.nodes.filter(n => n.kind === "test").slice(0, 3));
      const testCard = document.createElement("div");
      testCard.className = "arch-card";
      testCard.innerHTML =
        '<div class="arch-card-header">' +
          '<span class="arch-card-title">Automated Tests</span>' +
          '<span class="arch-badge" style="background:rgba(88,166,255,0.15);color:var(--accent-blue);">' + tests.total + ' test cases</span>' +
        '</div>' +
        '<p class="arch-card-desc">Unit, integration, and E2E test suites mapped to components and routes.</p>' +
        '<div style="display:flex;flex-direction:column;gap:3px;margin:6px 0;">' +
          '<div class="layer-metric-row"><span class="layer-metric-label">Discovered Tests</span><span class="layer-metric-val">' + tests.total + '</span></div>' +
          '<div class="layer-metric-row"><span class="layer-metric-label">Verified Relations</span><span class="layer-metric-val">' + metrics.evidenceStatus.statically_established + '</span></div>' +
        '</div>' +
        '<div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-top:6px;">Test Suites:</div>' +
        '<ul class="arch-node-list">' +
          (testTop.length > 0 ? testTop.map(n => '<li data-id="' + escapeHtml(n.id) + '" data-view="graph" onclick="selectNode(this.dataset.id); switchView(this.dataset.view);"><span>' + escapeHtml(n.label) + '</span><span style="color:var(--text-muted);font-size:10px;">' + n.kind + '</span></li>').join('') : '<li style="color:var(--text-muted);font-size:11px;">No automated tests found</li>') +
        '</ul>' +
        '<button class="explore-layer-btn" data-layer="tests" onclick="exploreLayer(this.dataset.layer)"><span>Explore Test Coverage</span><span>→</span></button>';
      grid.appendChild(testCard);
    }

    /* View 2: Interactive SVG Graph Canvas */
    function setGraphLevel(level) {
      graphCurrentLevel = level;
      const b1 = document.getElementById("btnGraphLevel1");
      const b2 = document.getElementById("btnGraphLevel2");
      const b3 = document.getElementById("btnGraphLevel3");
      if (b1) b1.classList.toggle("active", level === 1);
      if (b2) b2.classList.toggle("active", level === 2);
      if (b3) b3.classList.toggle("active", level === 3);
      renderGraphCanvas();
    }

    function expandNeighbours() {
      if (graphCurrentLevel !== 3) {
        setGraphLevel(3);
      }
      graphHops = Math.min(graphHops + 1, 5);
      renderGraphCanvas();
    }

    function collapseGraph() {
      if (graphCurrentLevel === 3 && graphHops > 1) {
        graphHops--;
        renderGraphCanvas();
      } else {
        setGraphLevel(1);
      }
    }

    function filterByRelation(rel) {
      if (visibleRelationFilter === rel && rel !== "all") {
        visibleRelationFilter = "all";
      } else {
        visibleRelationFilter = rel;
      }

      // Sync active state in canvas overlay pills
      document.querySelectorAll("#relationFilterBar .relation-pill-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.rel === visibleRelationFilter);
      });
      // Sync active state in left explorer chips
      document.querySelectorAll("#leftRelationChipsBar .chip").forEach(chip => {
        chip.classList.toggle("active", chip.dataset.rel === visibleRelationFilter);
      });
      // Sync active state in inspector relation tag buttons
      document.querySelectorAll(".relation-tag-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.rel === visibleRelationFilter);
      });
      // Sync select if present
      const select = document.getElementById("relationFilterSelect");
      if (select) select.value = visibleRelationFilter;

      // Re-render canvas
      renderGraphCanvas();
    }

    function renderGraphCanvas() {
      if (!graph) return;
      const nodesLayer = document.getElementById("nodesLayer");
      const edgesLayer = document.getElementById("edgesLayer");
      if (!nodesLayer || !edgesLayer) return;
      nodesLayer.innerHTML = "";
      edgesLayer.innerHTML = "";

      if (graphCurrentLevel === 1) {
        renderLevel1SystemOverview(nodesLayer, edgesLayer);
      } else if (graphCurrentLevel === 2) {
        renderLevel2ModulesView(nodesLayer, edgesLayer);
      } else {
        renderLevel3DependenciesView(nodesLayer, edgesLayer);
      }

      applyTransform();
    }

    function renderLevel1SystemOverview(nodesLayer, edgesLayer) {
      const tiers = [
        { key: "frontend", title: "Frontend Tier", color: "#39c5cf", x: 60, y: 80, desc: "React UI & Client State" },
        { key: "api_client", title: "API Client Layer", color: "#bc8cff", x: 360, y: 80, desc: "HTTP Requests & Payloads" },
        { key: "backend", title: "Backend Services", color: "#3fb950", x: 660, y: 80, desc: "Routes & Controllers" },
        { key: "data_layer", title: "Data Layer", color: "#d29922", x: 960, y: 80, desc: "Database & Tables" }
      ];

      for (let i = 0; i < tiers.length - 1; i++) {
        const t1 = tiers[i];
        const t2 = tiers[i + 1];
        const pipeRel = i === 0 ? "REQUESTS" : i === 1 ? "TARGETS" : "TOUCHES_DATABASE";
        const isMatchingPipe = visibleRelationFilter === "all" || visibleRelationFilter === pipeRel ||
          (visibleRelationFilter === "CALLS" && i === 1) ||
          (visibleRelationFilter === "HANDLES" && i === 1) ||
          (visibleRelationFilter === "QUERIES" && i === 2) ||
          (visibleRelationFilter === "READS_TABLE" && i === 2);

        const pipe = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const x1 = t1.x + 220;
        const y1 = t1.y + 140;
        const x2 = t2.x;
        const y2 = t2.y + 140;
        const d = "M " + x1 + " " + y1 + " C " + (x1 + 40) + " " + y1 + ", " + (x2 - 40) + " " + y2 + ", " + x2 + " " + y2;
        pipe.setAttribute("d", d);
        pipe.setAttribute("fill", "none");
        pipe.setAttribute("stroke", isMatchingPipe ? "#388bfd" : "#30363d");
        pipe.setAttribute("stroke-width", isMatchingPipe ? (visibleRelationFilter === "all" ? "3" : "4") : "1");
        pipe.setAttribute("opacity", isMatchingPipe ? "1" : "0.15");
        pipe.setAttribute("marker-end", isMatchingPipe ? "url(#arrow-highlight)" : "url(#arrow)");
        edgesLayer.appendChild(pipe);

        const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        txt.setAttribute("x", String((x1 + x2) / 2));
        txt.setAttribute("y", String(y1 - 10));
        txt.setAttribute("text-anchor", "middle");
        txt.setAttribute("fill", isMatchingPipe ? (visibleRelationFilter === "all" ? "#8b949e" : "#58a6ff") : "#484f58");
        txt.setAttribute("font-size", "10");
        txt.setAttribute("font-weight", "600");
        txt.textContent = pipeRel;
        edgesLayer.appendChild(txt);
      }

      tiers.forEach(tier => {
        const tierNodes = graph.nodes.filter(n => getNodeLayer(n) === tier.key && (activeFolderFilter === "all" || getNodeFolder(n) === activeFolderFilter));
        const tierNodeIds = new Set(tierNodes.map(n => n.id));
        const hasMatchingRelation = visibleRelationFilter === "all" || graph.edges.some(e => e.relation === visibleRelationFilter && (tierNodeIds.has(e.source) || tierNodeIds.has(e.target)));

        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("transform", "translate(" + tier.x + ", " + tier.y + ")");
        g.setAttribute("class", "level1-tier-card");
        g.dataset.layer = tier.key;
        g.style.cursor = "pointer";
        if (!hasMatchingRelation) {
          g.setAttribute("opacity", "0.35");
        }

        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("width", "220");
        rect.setAttribute("height", "280");
        rect.setAttribute("rx", "10");
        rect.setAttribute("fill", "#161b22");
        rect.setAttribute("stroke", tier.color);
        rect.setAttribute("stroke-width", "2");
        g.appendChild(rect);

        const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
        title.setAttribute("x", "16");
        title.setAttribute("y", "32");
        title.setAttribute("fill", "#f0f6fc");
        title.setAttribute("font-size", "14");
        title.setAttribute("font-weight", "700");
        title.textContent = tier.title;
        g.appendChild(title);

        const badge = document.createElementNS("http://www.w3.org/2000/svg", "text");
        badge.setAttribute("x", "204");
        badge.setAttribute("y", "32");
        badge.setAttribute("text-anchor", "end");
        badge.setAttribute("fill", tier.color);
        badge.setAttribute("font-size", "11");
        badge.setAttribute("font-weight", "600");
        badge.textContent = tierNodes.length + " nodes";
        g.appendChild(badge);

        const desc = document.createElementNS("http://www.w3.org/2000/svg", "text");
        desc.setAttribute("x", "16");
        desc.setAttribute("y", "52");
        desc.setAttribute("fill", "#8b949e");
        desc.setAttribute("font-size", "10");
        desc.textContent = tier.desc;
        g.appendChild(desc);

        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", "16");
        line.setAttribute("y1", "64");
        line.setAttribute("x2", "204");
        line.setAttribute("y2", "64");
        line.setAttribute("stroke", "#30363d");
        g.appendChild(line);

        const topNodes = tierNodes.slice(0, 4);
        topNodes.forEach((node, nIdx) => {
          const isSelected = node.id === selectedNodeId;
          const pillG = document.createElementNS("http://www.w3.org/2000/svg", "g");
          pillG.setAttribute("transform", "translate(16, " + (76 + nIdx * 42) + ")");
          pillG.style.cursor = "pointer";

          const pRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          pRect.setAttribute("width", "188");
          pRect.setAttribute("height", "34");
          pRect.setAttribute("rx", "6");
          pRect.setAttribute("fill", isSelected ? "rgba(56, 139, 253, 0.15)" : "#0d1117");
          pRect.setAttribute("stroke", isSelected ? "#58a6ff" : "#30363d");
          pRect.setAttribute("stroke-width", isSelected ? "2" : "1");

          const pText = document.createElementNS("http://www.w3.org/2000/svg", "text");
          pText.setAttribute("x", "10");
          pText.setAttribute("y", "16");
          pText.setAttribute("fill", "#c9d1d9");
          pText.setAttribute("font-size", "11");
          pText.setAttribute("font-weight", "500");
          pText.textContent = truncate(node.label, 22);

          const pSub = document.createElementNS("http://www.w3.org/2000/svg", "text");
          pSub.setAttribute("x", "10");
          pSub.setAttribute("y", "28");
          pSub.setAttribute("fill", tier.color);
          pSub.setAttribute("font-size", "9");
          pSub.textContent = node.kind;

          pillG.appendChild(pRect);
          pillG.appendChild(pText);
          pillG.appendChild(pSub);

          pillG.addEventListener("click", (e) => {
            e.stopPropagation();
            selectNode(node.id);
          });
          g.appendChild(pillG);
        });

        const btnG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        btnG.setAttribute("transform", "translate(16, 246)");
        const bRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bRect.setAttribute("width", "188");
        bRect.setAttribute("height", "24");
        bRect.setAttribute("rx", "4");
        bRect.setAttribute("fill", "rgba(56, 139, 253, 0.15)");
        const bText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        bText.setAttribute("x", "94");
        bText.setAttribute("y", "16");
        bText.setAttribute("text-anchor", "middle");
        bText.setAttribute("fill", "#58a6ff");
        bText.setAttribute("font-size", "10");
        bText.setAttribute("font-weight", "600");
        bText.textContent = "Inspect " + tier.title + " →";
        btnG.appendChild(bRect);
        btnG.appendChild(bText);
        g.appendChild(btnG);

        g.addEventListener("click", () => {
          toggleLayerFilter(tier.key);
          setGraphLevel(2);
        });
        nodesLayer.appendChild(g);
      });
    }

    function renderLevel2ModulesView(nodesLayer, edgesLayer) {
      const cols = { frontend: [], api_client: [], backend: [], data_layer: [], tests: [] };
      graph.nodes.forEach(n => {
        const l = getNodeLayer(n);
        if (cols[l]) cols[l].push(n); else cols.backend.push(n);
      });

      const colOrder = ["frontend", "api_client", "backend", "data_layer", "tests"];
      const nodePos = new Map();

      if (activeLayerFilter !== "all" && cols[activeLayerFilter]) {
        // Multi-column grid layout for single layer inspection
        const list = cols[activeLayerFilter].filter(n =>
          activeFolderFilter === "all" || getNodeFolder(n) === activeFolderFilter
        );
        const numCols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(list.length))));
        const colWidth = 230;
        const rowHeight = 72;
        const startX = 140;
        const startY = 80;

        list.forEach((node, idx) => {
          const colIdx = idx % numCols;
          const rowIdx = Math.floor(idx / numCols);
          const x = startX + colIdx * colWidth;
          const y = startY + rowIdx * rowHeight;
          nodePos.set(node.id, { x, y });
        });
      } else {
        // Multi-tier architecture columns
        const colX = { frontend: 90, api_client: 360, backend: 640, data_layer: 920, tests: 1200 };
        colOrder.forEach(colKey => {
          const list = cols[colKey].filter(n =>
            (activeFolderFilter === "all" || getNodeFolder(n) === activeFolderFilter) &&
            (activeLayerFilter === "all" || getNodeLayer(n) === activeLayerFilter)
          );
          const bx = colX[colKey];
          if (list.length > 8) {
            list.forEach((node, idx) => {
              const subCol = idx % 2;
              const subRow = Math.floor(idx / 2);
              const x = bx + (subCol === 0 ? -55 : 55);
              const y = 80 + subRow * 68;
              nodePos.set(node.id, { x, y });
            });
          } else {
            list.forEach((node, idx) => {
              const y = 80 + idx * 70;
              nodePos.set(node.id, { x: bx, y });
            });
          }
        });
      }

      graph.edges.forEach(edge => {
        if (visibleRelationFilter !== "all" && edge.relation !== visibleRelationFilter) return;
        const srcPos = nodePos.get(edge.source);
        const tgtPos = nodePos.get(edge.target);
        if (srcPos && tgtPos) {
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          const dx = tgtPos.x - srcPos.x;
          const dy = tgtPos.y - srcPos.y;
          let d = "";
          if (Math.abs(dx) < 60) {
            const offset = 95;
            d = "M " + (srcPos.x + 90) + " " + srcPos.y + " C " + (srcPos.x + 90 + offset) + " " + (srcPos.y + dy * 0.3) + ", " + (tgtPos.x + 90 + offset) + " " + (tgtPos.y - dy * 0.3) + ", " + (tgtPos.x + 90) + " " + tgtPos.y;
          } else {
            const cx1 = srcPos.x + dx * 0.5;
            const cy1 = srcPos.y;
            const cx2 = srcPos.x + dx * 0.5;
            const cy2 = tgtPos.y;
            d = "M " + (srcPos.x + (dx > 0 ? 90 : -90)) + " " + srcPos.y + " C " + cx1 + " " + cy1 + ", " + cx2 + " " + cy2 + ", " + (tgtPos.x + (dx > 0 ? -90 : 90)) + " " + tgtPos.y;
          }
          path.setAttribute("d", d);
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", edge.evidence?.status === "unresolved" ? "#f85149" : "#30363d");
          path.setAttribute("stroke-width", "1.5");
          if (edge.evidence?.status === "unresolved") path.setAttribute("stroke-dasharray", "4,4");
          path.setAttribute("marker-end", "url(#arrow)");
          path.id = "edge-" + edge.id;
          edgesLayer.appendChild(path);
        }
      });

      const allFolders = getDistinctFolders();
      graph.nodes.forEach(node => {
        const pos = nodePos.get(node.id);
        if (!pos) return;
        const layer = getNodeLayer(node);
        const color = getNodeColor(layer);
        const folder = getNodeFolder(node);

        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("transform", "translate(" + pos.x + ", " + pos.y + ")");
        g.setAttribute("class", "graph-node");
        g.style.cursor = "pointer";
        g.id = "node-" + node.id;

        const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
        titleEl.textContent = node.label + (node.location ? " (" + node.location.file + ":" + node.location.line + ")" : "");
        g.appendChild(titleEl);

        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", "-90");
        rect.setAttribute("y", "-22");
        rect.setAttribute("width", "180");
        rect.setAttribute("height", "44");
        rect.setAttribute("rx", "8");
        rect.setAttribute("fill", "#161b22");
        rect.setAttribute("stroke", node.id === selectedNodeId ? "#58a6ff" : color);
        rect.setAttribute("stroke-width", node.id === selectedNodeId ? "3" : "1.5");

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", "0");
        text.setAttribute("y", "-2");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", "#f0f6fc");
        text.setAttribute("font-size", "11");
        text.setAttribute("font-weight", "600");
        text.textContent = formatSmartNodeLabel(getNodeDisplayLabel(node, graph), 22);

        const subText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        subText.setAttribute("x", "0");
        subText.setAttribute("y", "12");
        subText.setAttribute("text-anchor", "middle");
        subText.setAttribute("fill", color);
        subText.setAttribute("font-size", "9");
        const showFolderBadge = allFolders.length > 1 && folder && folder !== "common" && folder !== "root";
        subText.textContent = truncate(node.kind + (showFolderBadge ? " [" + folder + "]" : ""), 22);

        g.appendChild(rect);
        g.appendChild(text);
        g.appendChild(subText);

        g.addEventListener("click", () => handleNodeClick(node.id));
        nodesLayer.appendChild(g);
      });
    }

    function renderLevel3DependenciesView(nodesLayer, edgesLayer) {
      const centerNode = graph.nodes.find(n => n.id === selectedNodeId) || graph.nodes[0];
      if (!centerNode) return;

      const callersSet = new Set();
      let currentHop = [centerNode.id];
      for (let h = 0; h < graphHops; h++) {
        const nextHop = [];
        currentHop.forEach(currId => {
          graph.edges.filter(e => e.target === currId && (visibleRelationFilter === "all" || e.relation === visibleRelationFilter)).forEach(e => {
            if (e.source !== centerNode.id && !callersSet.has(e.source)) {
              callersSet.add(e.source);
              nextHop.push(e.source);
            }
          });
        });
        currentHop = nextHop;
      }
      const callers = [...callersSet].map(id => graph.nodes.find(n => n.id === id)).filter(Boolean);

      const calleesSet = new Set();
      currentHop = [centerNode.id];
      for (let h = 0; h < graphHops; h++) {
        const nextHop = [];
        currentHop.forEach(currId => {
          graph.edges.filter(e => e.source === currId && (visibleRelationFilter === "all" || e.relation === visibleRelationFilter)).forEach(e => {
            if (e.target !== centerNode.id && !calleesSet.has(e.target)) {
              calleesSet.add(e.target);
              nextHop.push(e.target);
            }
          });
        });
        currentHop = nextHop;
      }
      const callees = [...calleesSet].map(id => graph.nodes.find(n => n.id === id)).filter(Boolean);

      const nodePos = new Map();
      const centerY = Math.max(160, 60 + Math.max(callers.length, callees.length) * 38);
      nodePos.set(centerNode.id, { x: 500, y: centerY, isCenter: true });

      callers.forEach((node, idx) => {
        const y = 90 + idx * 75;
        nodePos.set(node.id, { x: 140, y });
      });

      callees.forEach((node, idx) => {
        const y = 90 + idx * 75;
        nodePos.set(node.id, { x: 860, y });
      });

      const headerText = document.createElementNS("http://www.w3.org/2000/svg", "text");
      headerText.setAttribute("x", "80");
      headerText.setAttribute("y", "42");
      headerText.setAttribute("fill", "#f0f6fc");
      headerText.setAttribute("font-size", "14");
      headerText.setAttribute("font-weight", "700");
      headerText.textContent = "Dependencies: " + centerNode.label + " (" + graphHops + " hop" + (graphHops > 1 ? "s" : "") + " · " + callers.length + " Callers · " + callees.length + " Callees)";
      nodesLayer.appendChild(headerText);

      const visibleIds = new Set([centerNode.id, ...callersSet, ...calleesSet]);
      graph.edges.forEach(edge => {
        if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) return;
        if (visibleRelationFilter !== "all" && edge.relation !== visibleRelationFilter) return;

        const srcPos = nodePos.get(edge.source);
        const tgtPos = nodePos.get(edge.target);
        if (srcPos && tgtPos) {
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          const dx = tgtPos.x - srcPos.x;
          const dy = tgtPos.y - srcPos.y;
          const srcOffset = srcPos.isCenter ? 110 : 80;
          const tgtOffset = tgtPos.isCenter ? 110 : 80;

          const cx1 = srcPos.x + dx * 0.5;
          const cy1 = srcPos.y;
          const cx2 = srcPos.x + dx * 0.5;
          const cy2 = tgtPos.y;
          const d = "M " + (srcPos.x + srcOffset) + " " + srcPos.y + " C " + cx1 + " " + cy1 + ", " + cx2 + " " + cy2 + ", " + (tgtPos.x - tgtOffset) + " " + tgtPos.y;

          path.setAttribute("d", d);
          path.setAttribute("fill", "none");
          let strokeColor = "#388bfd";
          if (edge.evidence?.status === "observed") strokeColor = "#3fb950";
          else if (edge.evidence?.status === "inferred") strokeColor = "#d29922";
          else if (edge.evidence?.status === "unresolved") strokeColor = "#f85149";
          path.setAttribute("stroke", strokeColor);
          path.setAttribute("stroke-width", "2");
          path.setAttribute("marker-end", "url(#arrow-highlight)");
          path.id = "edge-" + edge.id;
          edgesLayer.appendChild(path);

          const relTxt = document.createElementNS("http://www.w3.org/2000/svg", "text");
          relTxt.setAttribute("x", String((srcPos.x + srcOffset + tgtPos.x - tgtOffset) / 2));
          relTxt.setAttribute("y", String((srcPos.y + tgtPos.y) / 2 - 6));
          relTxt.setAttribute("text-anchor", "middle");
          relTxt.setAttribute("fill", strokeColor);
          relTxt.setAttribute("font-size", "10");
          relTxt.setAttribute("font-weight", "600");
          relTxt.textContent = edge.relation;
          edgesLayer.appendChild(relTxt);
        }
      });

      nodePos.forEach((pos, id) => {
        const node = graph.nodes.find(n => n.id === id);
        if (!node) return;
        const layer = getNodeLayer(node);
        const color = getNodeColor(layer);
        const isCenter = pos.isCenter;

        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("transform", "translate(" + pos.x + ", " + pos.y + ")");
        g.setAttribute("class", "graph-node");
        g.style.cursor = "pointer";
        g.id = "node-" + node.id;

        const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
        titleEl.textContent = node.label + (node.location ? " (" + node.location.file + ":" + node.location.line + ")" : "");
        g.appendChild(titleEl);

        const w = isCenter ? 220 : 170;
        const h = isCenter ? 54 : 44;
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", String(-w / 2));
        rect.setAttribute("y", String(-h / 2));
        rect.setAttribute("width", String(w));
        rect.setAttribute("height", String(h));
        rect.setAttribute("rx", "8");
        rect.setAttribute("fill", isCenter ? "#1c2128" : "#161b22");
        rect.setAttribute("stroke", isCenter ? "#58a6ff" : color);
        rect.setAttribute("stroke-width", isCenter ? "3" : "1.5");

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", "0");
        text.setAttribute("y", isCenter ? "-4" : "-2");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", "#f0f6fc");
        text.setAttribute("font-size", isCenter ? "12" : "11");
        text.setAttribute("font-weight", "700");
        text.textContent = formatSmartNodeLabel(getNodeDisplayLabel(node, graph), isCenter ? 26 : 20);

        const subText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        subText.setAttribute("x", "0");
        subText.setAttribute("y", isCenter ? "14" : "12");
        subText.setAttribute("text-anchor", "middle");
        subText.setAttribute("fill", color);
        subText.setAttribute("font-size", "9");
        subText.textContent = truncate((isCenter ? "★ " : "") + node.kind, 24);

        g.appendChild(rect);
        g.appendChild(text);
        g.appendChild(subText);

        g.addEventListener("click", () => handleNodeClick(node.id));
        nodesLayer.appendChild(g);
      });
    }

    function handleNodeClick(nodeId) {
      if (isTraceMode) {
        if (!traceStartNodeId) {
          traceStartNodeId = nodeId;
          highlightNodeInGraph(nodeId, "#d29922");
          document.getElementById("traceModeBtn").textContent = "Select Target Node...";
        } else {
          tracePathBetween(traceStartNodeId, nodeId);
          toggleTraceMode();
        }
        return;
      }
      selectNode(nodeId);
    }

    function selectNode(nodeId, updateFlow = true) {
      selectedNodeId = nodeId;
      const node = graph.nodes.find(n => n.id === nodeId);
      if (!node) return;

      const incoming = graph.edges.filter(e => e.target === nodeId);
      const outgoing = graph.edges.filter(e => e.source === nodeId);
      const connectedNodeIds = new Set([nodeId]);
      incoming.forEach(e => connectedNodeIds.add(e.source));
      outgoing.forEach(e => connectedNodeIds.add(e.target));

      if (graphCurrentLevel === 3) {
        renderGraphCanvas();
      } else {
        document.querySelectorAll(".graph-node").forEach(gn => {
          const id = gn.id.replace("node-", "");
          const r = gn.querySelector("rect");
          if (id === nodeId) {
            if (r) r.setAttribute("stroke-width", "3");
            gn.style.opacity = "1";
          } else if (connectedNodeIds.has(id)) {
            if (r) r.setAttribute("stroke-width", "1.5");
            gn.style.opacity = "1";
          } else {
            if (r) r.setAttribute("stroke-width", "1.5");
            gn.style.opacity = "0.25";
          }
        });

        const edgeIds = new Set([...incoming.map(e => "edge-" + e.id), ...outgoing.map(e => "edge-" + e.id)]);
        document.querySelectorAll("#edgesLayer path").forEach(p => {
          if (edgeIds.has(p.id)) {
            p.setAttribute("stroke", "#58a6ff");
            p.setAttribute("stroke-width", "2.5");
            p.setAttribute("opacity", "1");
          } else {
            p.setAttribute("stroke", "#30363d");
            p.setAttribute("stroke-width", "1.5");
            p.setAttribute("opacity", "0.15");
          }
        });
      }

      // Sync Left Tree selection and scroll smoothly into view
      document.querySelectorAll(".tree-node-item").forEach(el => {
        const isSelected = el.dataset.nodeId === nodeId;
        el.classList.toggle("selected", isSelected);
        if (isSelected) {
          el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      });

      // Sync API Flow
      if (updateFlow) {
        syncSelectionWithFlow(nodeId);
      }

      // Sync Change Impact input
      const impInput = document.getElementById("impactInput");
      if (impInput) {
        impInput.value = node.label;
      }
      const activeContainer = document.querySelector(".view-container.active");
      if (activeContainer && activeContainer.id === "view-impact") {
        runImpactAnalysis();
      }

      // Sync AI Active Context
      updateAiContextBar(node);

      // Update Right Inspector
      const layer = getNodeLayer(node);
      const color = getNodeColor(layer);
      document.getElementById("inspTitle").textContent = node.label;
      const badge = document.getElementById("inspKind");
      badge.textContent = layer.toUpperCase() + " · " + node.kind;
      badge.style.color = color;

      const nodeById = new Map(graph.nodes.map(n => [n.id, n]));

      let purpose = "";
      if (node.kind === "ui_component" || (node.attributes && node.attributes.isReactComponent)) {
        purpose = "React UI component rendering view hierarchy and handling user interaction.";
      } else if (node.kind === "client_script") {
        purpose = "Client-side script executing in the browser for DOM manipulation and client requests.";
      } else if (node.kind === "context" || (node.attributes && node.attributes.isProvider)) {
        purpose = "React Context Provider providing shared state across child component trees.";
      } else if (node.kind === "api_request") {
        purpose = "Client HTTP request invoking backend services (" + (node.attributes?.httpMethod || "HTTP") + " " + (node.attributes?.urlPattern || "") + ").";
      } else if (node.kind === "api_route") {
        purpose = "Server API endpoint route handler accepting incoming client HTTP requests.";
      } else if (node.kind === "database_operation" || node.kind === "database_table") {
        purpose = "Database persistence entity executing queries or managing storage schema.";
      } else if (node.kind === "test") {
        purpose = "Automated verification test case asserting behavioral expectations.";
      } else {
        purpose = "Codebase entity participating in application logic.";
      }

      let html = '<div><div class="inspector-section-title">Purpose</div><div style="font-size:12px;color:var(--text-bright);line-height:1.4;">' + escapeHtml(purpose) + '</div></div>';

      if (node.location) {
        html += '<div><div class="inspector-section-title">Source Location</div><span class="source-link-pill" data-file="' + escapeHtml(node.location.file) + '" data-line="' + node.location.line + '" onclick="inspectSourceLine(this.dataset.file, Number(this.dataset.line))">📄 ' + escapeHtml(node.location.file) + ':' + node.location.line + '</span></div>';
      }

      const nodeFolder = getNodeFolder(node);
      if (nodeFolder && nodeFolder !== "common" && nodeFolder !== "root") {
        html += '<div><div class="inspector-section-title">Project Folder / Sub-Repo</div><span style="font-family:var(--font-mono);font-size:12px;color:var(--accent-purple);font-weight:600;">📁 ' + escapeHtml(nodeFolder) + '</span></div>';
      }

      if (node.attributes) {
        html += '<div><div class="inspector-section-title">Attributes</div><div style="font-size:12px;display:flex;flex-direction:column;gap:4px;">';
        for (const [k, v] of Object.entries(node.attributes)) {
          if (v !== undefined) {
            html += '<div><strong style="color:var(--text-muted)">' + escapeHtml(k) + ':</strong> <code>' + escapeHtml(String(v)) + '</code></div>';
          }
        }
        html += '</div></div>';
      }

      html += '<div><div class="inspector-section-title">Incoming Links (' + incoming.length + ')</div><ul class="dep-list">';
      if (incoming.length === 0) html += '<li style="font-size:12px;color:var(--text-muted)">No incoming connections</li>';
      incoming.forEach(e => {
        const src = nodeById.get(e.source);
        html += '<li class="dep-item" data-id="' + escapeHtml(e.source) + '" onclick="selectNode(this.dataset.id)">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<button class="relation-tag-btn ' + (e.relation === visibleRelationFilter ? 'active' : '') + '" data-rel="' + escapeHtml(e.relation) + '" onclick="event.stopPropagation(); filterByRelation(this.dataset.rel)">← ' + escapeHtml(e.relation) + '</button>' +
            renderEvidenceBadge(e.evidence?.status) +
          '</div>' +
          '<span style="font-weight:600;margin-top:2px;">' + escapeHtml(src?.label || e.source) + '</span>' +
          '<span style="font-size:10px;color:var(--text-muted)">' + escapeHtml(e.evidence?.detail || '') + '</span>' +
          '<button class="btn btn-sm" style="margin-top:5px;font-size:10px;" onclick="event.stopPropagation(); showEdgeEvidence(' + JSON.stringify(e.id) + ')">Why is this connected?</button>' +
        '</li>';
      });
      html += '</ul></div>';

      html += '<div><div class="inspector-section-title">Outgoing Links (' + outgoing.length + ')</div><ul class="dep-list">';
      if (outgoing.length === 0) html += '<li style="font-size:12px;color:var(--text-muted)">No outgoing connections</li>';
      outgoing.forEach(e => {
        const tgt = nodeById.get(e.target);
        html += '<li class="dep-item" data-id="' + escapeHtml(e.target) + '" onclick="selectNode(this.dataset.id)">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<button class="relation-tag-btn ' + (e.relation === visibleRelationFilter ? 'active' : '') + '" data-rel="' + escapeHtml(e.relation) + '" onclick="event.stopPropagation(); filterByRelation(this.dataset.rel)">→ ' + escapeHtml(e.relation) + '</button>' +
            renderEvidenceBadge(e.evidence?.status) +
          '</div>' +
          '<span style="font-weight:600;margin-top:2px;">' + escapeHtml(tgt?.label || e.target) + '</span>' +
          '<span style="font-size:10px;color:var(--text-muted)">' + escapeHtml(e.evidence?.detail || '') + '</span>' +
          '<button class="btn btn-sm" style="margin-top:5px;font-size:10px;" onclick="event.stopPropagation(); showEdgeEvidence(' + JSON.stringify(e.id) + ')">Why is this connected?</button>' +
        '</li>';
      });
      html += '</ul></div>';

      const primaryEvidence = incoming[0]?.evidence || outgoing[0]?.evidence;
      html += '<div><div class="inspector-section-title">Evidence & Verification</div>' +
        '<div style="font-size:12px;display:flex;flex-direction:column;gap:4px;">' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<strong style="color:var(--text-muted)">Status:</strong>' +
            renderEvidenceBadge(primaryEvidence?.status || "statically_established") +
          '</div>' +
          '<div><strong style="color:var(--text-muted)">Method:</strong> Static AST & contract resolution</div>' +
        '</div>' +
      '</div>';

      html += '<div><div class="inspector-section-title">Change Impact</div>' +
        '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">' +
          'Modifying this entity may affect <strong style="color:var(--text-bright);">' + incoming.length + ' incoming caller(s)</strong> and downstream dependencies.' +
        '</div>' +
        '<button class="btn btn-sm" style="width:100%;justify-content:center;" data-label="' + escapeHtml(node.label) + '" onclick="onAnalyzeImpactClick(this.dataset.label)">Analyze Change Impact →</button>' +
      '</div>';

      if (node.location) {
        html += '<div><div class="inspector-section-title">Source Excerpt</div><div class="source-box" id="inspSourceBox">Loading snippet...</div></div>';
        fetchSourceSnippet(node.location.file, node.location.line);
      }

      document.getElementById("inspContent").innerHTML = html;
    }

    function syncSelectionWithFlow(nodeId) {
      if (!graph || !graph.edges) return;
      const node = graph.nodes.find(n => n.id === nodeId);
      if (!node) return;

      let flowReqId = null;
      if (node.kind === "api_request") {
        flowReqId = node.id;
      } else {
        // 1. Caller component of an api_request
        const reqEdge = graph.edges.find(e => e.source === nodeId && (e.relation === "REQUESTS" || e.relation === "CALLS"));
        if (reqEdge) {
          const tgt = graph.nodes.find(n => n.id === reqEdge.target);
          if (tgt && tgt.kind === "api_request") flowReqId = tgt.id;
        }
        // 2. Target endpoint of an api_request
        if (!flowReqId) {
          const tgtEdge = graph.edges.find(e => e.target === nodeId && e.relation === "TARGETS");
          if (tgtEdge) {
            const src = graph.nodes.find(n => n.id === tgtEdge.source);
            if (src && src.kind === "api_request") flowReqId = src.id;
          }
        }
        // 3. Handler of a route
        if (!flowReqId) {
          const handlerEdge = graph.edges.find(e => e.target === nodeId && (e.relation === "HANDLES" || e.relation === "HANDLES_ROUTE"));
          if (handlerEdge) {
            const routeEdge = graph.edges.find(e => e.target === handlerEdge.source && e.relation === "TARGETS");
            if (routeEdge) flowReqId = routeEdge.source;
          }
        }
        // 4. Database operation or table
        if (!flowReqId) {
          const dbEdge = graph.edges.find(e => e.target === nodeId && (e.relation === "TOUCHES_DATABASE" || e.relation === "QUERIES" || e.relation === "READS_TABLE"));
          if (dbEdge) {
            const routeEdge = graph.edges.find(e => e.target === dbEdge.source && e.relation === "TARGETS");
            if (routeEdge) {
              flowReqId = routeEdge.source;
            } else {
              const handlerEdge = graph.edges.find(e => e.target === dbEdge.source && (e.relation === "HANDLES" || e.relation === "HANDLES_ROUTE"));
              if (handlerEdge) {
                const rEdge = graph.edges.find(e => e.target === handlerEdge.source && e.relation === "TARGETS");
                if (rEdge) flowReqId = rEdge.source;
              }
            }
          }
        }
      }

      if (flowReqId) {
        const select = document.getElementById("flowSelect");
        if (select && select.value !== flowReqId) {
          select.value = flowReqId;
          renderSelectedFlow();
        }
      }
    }

    function updateAiContextBar(node) {
      const banner = document.getElementById("aiActiveContextBar");
      const promptsBar = document.getElementById("aiPromptsBar");
      if (!banner) return;
      if (!node) {
        banner.style.display = "none";
        return;
      }
      banner.style.display = "block";
      const layer = getNodeLayer(node);
      banner.innerHTML = '<div class="ai-context-banner">' +
        '<div class="ai-context-info">' +
          '<span class="layer-dot dot-' + layer + '"></span>' +
          '<span>Target Entity: <strong style="color:var(--text-bright);">' + escapeHtml(node.label) + '</strong> <span style="color:var(--text-muted);font-size:11px;">(' + escapeHtml(node.kind) + ')</span></span>' +
        '</div>' +
        '<div style="display:flex;gap:6px;align-items:center;">' +
          '<button class="btn btn-sm" data-label="' + escapeHtml(node.label) + '" onclick="sendAiPrompt(\\'Explain entity \\' + this.dataset.label)">Explain</button>' +
          '<button class="btn btn-sm" data-label="' + escapeHtml(node.label) + '" onclick="sendAiPrompt(\\'What happens if I change \\' + this.dataset.label + \\'?\\')">Change Risk</button>' +
          '<button class="btn btn-sm" onclick="clearAiContext()" title="Clear Context" style="color:var(--text-muted);">✕</button>' +
        '</div>' +
      '</div>';

      if (promptsBar) {
        if (layer === "frontend") {
          promptsBar.innerHTML = '<button class="ai-prompt-pill" data-label="' + escapeHtml(node.label) + '" onclick="sendAiPrompt(\\'Explain component \\' + this.dataset.label)">🔍 Explain UI Component</button>' +
            '<button class="ai-prompt-pill" data-label="' + escapeHtml(node.label) + '" onclick="sendAiPrompt(\\'Who renders \\' + this.dataset.label + \\'?\\')">🎨 Trace Render Tree</button>' +
            '<button class="ai-prompt-pill" data-label="' + escapeHtml(node.label) + '" onclick="sendAiPrompt(\\'What happens if I change \\' + this.dataset.label + \\'?\\')">💥 Change Impact</button>' +
            '<button class="ai-prompt-pill" onclick="sendAiPrompt(\\'Onboard me to this codebase\\')">🧭 Codebase Onboarding</button>';
        } else if (layer === "backend" || layer === "api_client") {
          promptsBar.innerHTML = '<button class="ai-prompt-pill" onclick="sendAiPrompt(\\'Explain this feature full path\\')">⚡ Trace Full Request Path</button>' +
            '<button class="ai-prompt-pill" data-label="' + escapeHtml(node.label) + '" onclick="sendAiPrompt(\\'What parameters does \\' + this.dataset.label + \\' accept?\\')">🔍 Inspect Route Contract</button>' +
            '<button class="ai-prompt-pill" data-label="' + escapeHtml(node.label) + '" onclick="sendAiPrompt(\\'What happens if I change \\' + this.dataset.label + \\'?\\')">💥 Predict Downstream Impact</button>' +
            '<button class="ai-prompt-pill" onclick="sendAiPrompt(\\'How do I write a test for this route?\\')">🧪 Recommended Tests</button>';
        } else if (layer === "data_layer") {
          promptsBar.innerHTML = '<button class="ai-prompt-pill" data-label="' + escapeHtml(node.label) + '" onclick="sendAiPrompt(\\'Which handlers query \\' + this.dataset.label + \\'?\\')">🗄️ Query Trace</button>' +
            '<button class="ai-prompt-pill" data-label="' + escapeHtml(node.label) + '" onclick="sendAiPrompt(\\'What happens if I change schema of \\' + this.dataset.label + \\'?\\')">💥 Migration Risk</button>' +
            '<button class="ai-prompt-pill" data-label="' + escapeHtml(node.label) + '" onclick="sendAiPrompt(\\'Explain data flow for \\' + this.dataset.label)">⚡ Full Data Flow</button>';
        } else {
          promptsBar.innerHTML = '<button class="ai-prompt-pill" onclick="sendAiPrompt(\\'Explain this component\\')">🔍 Explain selected component</button>' +
            '<button class="ai-prompt-pill" onclick="sendAiPrompt(\\'Explain this feature full path\\')">⚡ Trace full-stack feature path</button>' +
            '<button class="ai-prompt-pill" onclick="sendAiPrompt(\\'What happens if I change this function?\\')">💥 Predict change impact</button>' +
            '<button class="ai-prompt-pill" onclick="sendAiPrompt(\\'Onboard me to this codebase\\')">🧭 Onboard new developer</button>';
        }
      }
    }

    function clearAiContext() {
      const banner = document.getElementById("aiActiveContextBar");
      if (banner) banner.style.display = "none";
    }

    function focusSelectedInGraph() {
      if (!selectedNodeId) return;
      switchView("graph");
      setGraphLevel(3);
    }

    function focusSelectedInFlow() {
      if (!selectedNodeId) return;
      syncSelectionWithFlow(selectedNodeId);
      switchView("flow");
    }

    function focusSelectedInImpact() {
      if (!selectedNodeId) return;
      const node = graph?.nodes?.find(n => n.id === selectedNodeId);
      const input = document.getElementById("impactInput");
      if (node && input) input.value = node.label;
      switchView("impact");
      runImpactAnalysis();
    }

    function toggleInspector() {
      const p = document.getElementById("rightInspectorPanel");
      const btn = document.getElementById("reopenInspectorBtn");
      if (!p) return;
      p.classList.toggle("collapsed");
      const isCollapsed = p.classList.contains("collapsed");
      if (btn) btn.style.display = isCollapsed ? "flex" : "none";
    }

    async function fetchSourceSnippet(file, line, preferredRoot) {
      if (isOfflineMode) {
        const box = document.getElementById("inspSourceBox");
        if (box) box.innerHTML = '<div style="color:var(--text-muted);font-style:italic;padding:8px;">Source excerpts are unavailable in an offline report because no source bundle was embedded.</div>';
        return;
      }
      try {
        const rootParam = preferredRoot ? "&projectId=" + encodeURIComponent(preferredRoot) : "";
        const res = await fetch("/api/source?file=" + encodeURIComponent(file) + "&line=" + line + rootParam);
        if (res.ok) {
          const data = await res.json();
          renderSourceBox(data, file);
        } else {
          const box = document.getElementById("inspSourceBox");
          if (box) box.innerHTML = '<div style="color:var(--text-muted);font-style:italic;padding:8px;">// Source file located at: ' + escapeHtml(file) + '</div>';
        }
      } catch (err) {
        const box = document.getElementById("inspSourceBox");
        if (box) box.textContent = "// Unable to load source code";
      }
    }

    function renderSourceBox(data, originalFile) {
      const box = document.getElementById("inspSourceBox");
      if (!box) return;
      if (data.exists === false) {
        let diagHtml = '<div style="background:rgba(248,81,73,0.1);border:1px solid rgba(248,81,73,0.3);border-radius:6px;padding:10px;margin-bottom:8px;">' +
          '<div style="font-weight:700;font-size:12px;color:var(--accent-red);display:flex;align-items:center;gap:6px;">⚠️ Source file not found on disk</div>' +
          '<div style="font-size:11px;color:var(--text-bright);margin-top:4px;word-break:break-all;">' + escapeHtml(originalFile || data.content) + '</div>';
        if (data.diagnostic && data.diagnostic.reason) {
          diagHtml += '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">' + escapeHtml(data.diagnostic.reason) + '</div>';
        }
        if (data.diagnostic && data.diagnostic.searchedRoots && data.diagnostic.searchedRoots.length > 0) {
          diagHtml += '<div style="font-size:10px;color:var(--text-muted);margin-top:6px;"><strong>Searched roots:</strong><ul style="margin:2px 0 0 16px;">' +
            data.diagnostic.searchedRoots.map(r => '<li>' + escapeHtml(r) + '</li>').join('') + '</ul></div>';
        }
        diagHtml += '</div>';
        box.innerHTML = diagHtml;
        return;
      }
      if (data.error) {
        box.innerHTML = '<div style="color:var(--text-muted);font-style:italic;padding:8px;">' + escapeHtml(data.error) + '</div>';
        return;
      }
      let headerHtml = "";
      if (data.rootIdentifier || data.repoRelativePath) {
        headerHtml = '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--bg-tertiary);border-bottom:1px solid var(--border-subtle);font-size:11px;font-family:var(--font-mono);">' +
          '<span style="color:var(--accent-purple);font-weight:600;">📁 ' + escapeHtml(data.rootIdentifier || 'root') + '</span>' +
          '<span style="color:var(--text-muted);">' + escapeHtml(data.repoRelativePath || originalFile) + ':' + data.targetLine + '</span>' +
        '</div>';
      }
      const lines = data.content.split(String.fromCharCode(10)).map(l => l.replace(new RegExp(String.fromCharCode(13) + "$"), ""));
      let out = headerHtml;
      lines.forEach((codeLine, idx) => {
        const lineNum = data.startLine + idx;
        const isTarget = lineNum === data.targetLine;
        out += '<div class="source-line ' + (isTarget ? 'highlight' : '') + '"><span class="source-num">' + lineNum + '</span><span class="source-code">' + escapeHtml(codeLine) + '</span></div>';
      });
      box.innerHTML = out;
    }

    function inspectSourceLine(file, line, projectId) {
      const matchingNode = graph.nodes.find(n => n.location && n.location.file === file && (!projectId || n.location.projectId === projectId) && Math.abs(n.location.line - line) <= 5);
      if (matchingNode) {
        selectNode(matchingNode.id);
      } else {
        document.getElementById("inspTitle").textContent = file.split("/").pop();
        document.getElementById("inspKind").textContent = "SOURCE FILE";
        document.getElementById("inspContent").innerHTML =
          '<div><div class="inspector-section-title">Source Location</div><span class="source-link-pill">📄 ' + escapeHtml(file) + ':' + line + '</span></div>' +
          '<div><div class="inspector-section-title">Source Excerpt</div><div class="source-box" id="inspSourceBox">Loading snippet...</div></div>';
        fetchSourceSnippet(file, line, projectId);
      }
    }

    function findAndSelectSymbol(symbolName) {
      const clean = symbolName.replace(new RegExp("^[<\\\\x60]|([\\\\x60/>]$)", "g"), "").trim();
      const node = graph.nodes.find(n => n.label.toLowerCase() === clean.toLowerCase() || n.label.toLowerCase().includes(clean.toLowerCase()));
      if (node) {
        selectNode(node.id);
        switchView("graph");
      }
    }

    /* Left Tree List */
    function renderTreeList() {
      if (!graph) return;
      const container = document.getElementById("leftTreeList");
      const search = (document.getElementById("leftSearchInput").value || "").toLowerCase();
      container.innerHTML = "";

      const metrics = calculateProjectMetrics(graph, activeFolderFilter);
      const folders = getDistinctFolders();
      const categories = [
        { key: "frontend", title: "Components & UI", count: metrics ? metrics.sidebarCounts.frontend : 0, kinds: ["ui_component", "client_script", "context"] },
        { key: "backend", title: "API Routes", count: metrics ? metrics.sidebarCounts.backend_routes : 0, kinds: ["api_route", "api_contract"] },
        { key: "api_client", title: "API Requests & Payloads", count: metrics ? metrics.sidebarCounts.api_client : 0, kinds: ["api_request", "query_parameter", "api_field"] },
        { key: "backend_services", title: "Functions & Services", count: metrics ? metrics.sidebarCounts.backend_services : 0, kinds: ["function", "service"] },
        { key: "data_layer", title: "Data Models & Tables", count: metrics ? metrics.sidebarCounts.data_layer : 0, kinds: ["database_operation", "database_table", "database_entity", "data_model", "query", "migration"] },
        { key: "tests", title: "Automated Tests", count: metrics ? metrics.sidebarCounts.tests : 0, kinds: ["test"] }
      ];

      categories.forEach(cat => {
        if (activeLayerFilter !== "all" && activeLayerFilter !== cat.key && !(activeLayerFilter === "backend" && cat.key === "backend_services")) return;
        const matchingNodes = graph.nodes.filter(n => {
          const matchKind = cat.kinds.includes(n.kind) || (cat.key === "frontend" && (n.attributes?.isReactComponent || n.attributes?.isProvider));
          const matchFolder = activeFolderFilter === "all" || getNodeFolder(n) === activeFolderFilter;
          const matchSearch = !search || n.label.toLowerCase().includes(search) || (n.location && n.location.file.toLowerCase().includes(search));
          return matchKind && matchFolder && matchSearch;
        });

        if (matchingNodes.length === 0) return;

        const title = document.createElement("div");
        title.className = "tree-group-title";
        title.innerHTML = '<span>' + escapeHtml(cat.title) + '</span><span>' + (search ? matchingNodes.length : cat.count) + '</span>';
        container.appendChild(title);

        matchingNodes.forEach(node => {
          const item = document.createElement("div");
          item.className = "tree-node-item" + (node.id === selectedNodeId ? " selected" : "");
          item.dataset.nodeId = node.id;
          const folder = getNodeFolder(node);
          const showFolder = folders.length > 1 && folder && folder !== "common" && folder !== "root";
          const layer = getNodeLayer(node);
          const displayLabel = getNodeDisplayLabel(node, graph);
          item.title = displayLabel + (node.location ? " (" + node.location.file + ":" + node.location.line + ")" : "");

          let labelHtml = escapeHtml(displayLabel);
          const httpMatch = /^(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s+(.+)$/i.exec(displayLabel);
          if (httpMatch) {
            const m = httpMatch[1].toUpperCase();
            const p = httpMatch[2];
            labelHtml = '<span class="method-mini-tag method-' + m.toLowerCase() + '">' + m + '</span> ' +
              '<span class="tree-route-text" style="font-family:var(--font-mono);font-size:11px;">' + escapeHtml(p) + '</span>';
          }

          item.innerHTML = '<span class="layer-dot dot-' + layer + '"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">' + labelHtml + '</span>' +
            (showFolder ? '<span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono);margin-left:6px;padding:1px 4px;background:var(--bg-tertiary);border-radius:3px;flex-shrink:0;">' + escapeHtml(folder) + '</span>' : '');
          item.onclick = () => selectNode(node.id);
          container.appendChild(item);
        });
      });
    }

    function toggleLayerFilter(layer) {
      activeLayerFilter = layer;
      document.querySelectorAll(".filter-chips .chip[data-layer]").forEach(c => {
        c.classList.toggle("active", c.dataset.layer === layer);
      });
      renderTreeList();
      renderOverview();
      renderGraphCanvas();
    }

    function handleFilter() {
      renderTreeList();
    }

    /* View 3: API & Data Flow (Combobox & Swimlane) */
    function renderFlowSelector() {
      if (!graph) return;
      const select = document.getElementById("flowSelect");
      const comboboxDropdown = document.getElementById("flowComboboxDropdown");
      const searchInput = document.getElementById("flowSearchInput");
      if (select) select.innerHTML = "";
      if (comboboxDropdown) comboboxDropdown.innerHTML = "";

      // Find API requests
      const requests = graph.nodes.filter(n => n.kind === "api_request");
      if (requests.length === 0) {
        if (select) select.innerHTML = "<option>No API requests found</option>";
        if (searchInput) searchInput.value = "No API requests found";
        return;
      }

      // Group requests by HTTP Method
      const groups = {
        GET: [],
        POST: [],
        PUT: [],
        DELETE: [],
        OTHER: []
      };

      requests.forEach(req => {
        const method = (req.attributes?.httpMethod || req.label.split(" ")[0] || "GET").toUpperCase();
        if (groups[method]) groups[method].push(req);
        else if (method === "PATCH") groups.PUT.push(req);
        else groups.OTHER.push(req);

        if (select) {
          const opt = document.createElement("option");
          opt.value = req.id;
          opt.textContent = req.label;
          select.appendChild(opt);
        }
      });

      if (comboboxDropdown) {
        let dropdownHtml = "";
        const groupKeys = ["GET", "POST", "PUT", "DELETE", "OTHER"];
        groupKeys.forEach(gKey => {
          const list = groups[gKey];
          if (list && list.length > 0) {
            dropdownHtml += '<div class="flow-group-header">' + gKey + ' Endpoints (' + list.length + ')</div>';
            list.forEach(req => {
              const methodClass = 'flow-method-' + gKey.toLowerCase();
              const callerEdge = graph.edges.find(e => e.target === req.id && (e.relation === "REQUESTS" || e.relation === "CALLS"));
              const callerNode = callerEdge ? graph.nodes.find(n => n.id === callerEdge.source) : null;
              const targetEdge = graph.edges.find(e => e.source === req.id && e.relation === "TARGETS");
              const isResolved = Boolean(targetEdge);

              dropdownHtml += '<div class="flow-combobox-item" data-id="' + escapeHtml(req.id) + '" onclick="selectFlowItem(this.dataset.id)">' +
                '<div style="display:flex;align-items:center;gap:6px;overflow:hidden;">' +
                  '<span class="flow-method-pill ' + methodClass + '">' + gKey + '</span>' +
                  '<span style="font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(req.label) + '</span>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">' +
                  (callerNode ? '<span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono);">' + escapeHtml(callerNode.label) + '</span>' : '') +
                  (isResolved ? '<span class="evidence-badge status-static" style="font-size:9px;padding:1px 4px;">Resolved</span>' : '<span class="evidence-badge status-unresolved" style="font-size:9px;padding:1px 4px;">Unresolved</span>') +
                '</div>' +
              '</div>';
            });
          }
        });
        comboboxDropdown.innerHTML = dropdownHtml;
      }

      if (requests.length > 0) {
        const firstReq = requests[0];
        if (select) select.value = firstReq.id;
        if (searchInput) searchInput.value = firstReq.label;
      }

      renderSelectedFlow();
    }

    function selectFlowItem(reqId) {
      const select = document.getElementById("flowSelect");
      const searchInput = document.getElementById("flowSearchInput");
      const dropdown = document.getElementById("flowComboboxDropdown");
      if (select) select.value = reqId;
      const reqNode = graph.nodes.find(n => n.id === reqId);
      if (searchInput && reqNode) searchInput.value = reqNode.label;
      if (dropdown) dropdown.style.display = "none";
      renderSelectedFlow();
    }

    function toggleFlowCombobox() {
      const dropdown = document.getElementById("flowComboboxDropdown");
      if (!dropdown) return;
      dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
    }

    function openFlowCombobox() {
      const dropdown = document.getElementById("flowComboboxDropdown");
      if (dropdown) dropdown.style.display = "block";
    }

    function filterFlowCombobox(searchTerm) {
      const term = (searchTerm || "").toLowerCase();
      const dropdown = document.getElementById("flowComboboxDropdown");
      if (dropdown) dropdown.style.display = "block";
      document.querySelectorAll(".flow-combobox-item").forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(term) ? "flex" : "none";
      });
    }

    function renderSelectedFlow() {
      if (!graph) return;
      const select = document.getElementById("flowSelect");
      const searchInput = document.getElementById("flowSearchInput");
      const reqId = select ? select.value : null;
      const container = document.getElementById("flowSwimlane");
      if (!container) return;
      container.innerHTML = "";

      const nodeById = new Map(graph.nodes.map(n => [n.id, n]));
      const reqNode = nodeById.get(reqId);
      if (!reqNode) return;
      if (searchInput && searchInput.value !== reqNode.label && document.activeElement !== searchInput) {
        searchInput.value = reqNode.label;
      }

      // 1. Caller Component
      const callerEdge = graph.edges.find(e => e.target === reqId && (e.relation === "REQUESTS" || e.relation === "CALLS"));
      const callerNode = callerEdge ? nodeById.get(callerEdge.source) : null;

      // 2. Target Endpoint
      const targetEdge = graph.edges.find(e => e.source === reqId && e.relation === "TARGETS");
      const endpointNode = targetEdge ? nodeById.get(targetEdge.target) : null;

      // 3. Handler
      const handlerEdge = endpointNode ? graph.edges.find(e => e.source === endpointNode.id && (e.relation === "HANDLES" || e.relation === "HANDLES_ROUTE")) : null;
      const handlerNode = handlerEdge ? nodeById.get(handlerEdge.target) : null;

      // 4. Domain Service (if handler calls a function)
      let serviceNode = null;
      let serviceEdge = null;
      if (handlerNode) {
        serviceEdge = graph.edges.find(e => e.source === handlerNode.id && e.relation === "CALLS");
        if (serviceEdge) serviceNode = nodeById.get(serviceEdge.target);
      }

      // 5. Database Operation
      let dbNode = null;
      let dbEdge = null;
      if (serviceNode) {
        dbEdge = graph.edges.find(e => e.source === serviceNode.id && (e.relation === "TOUCHES_DATABASE" || e.relation === "QUERIES"));
        if (dbEdge) dbNode = nodeById.get(dbEdge.target);
      }
      if (!dbNode && handlerNode) {
        dbEdge = graph.edges.find(e => e.source === handlerNode.id && (e.relation === "TOUCHES_DATABASE" || e.relation === "QUERIES"));
        if (dbEdge) dbNode = nodeById.get(dbEdge.target);
      }
      if (!dbNode && endpointNode) {
        dbEdge = graph.edges.find(e => e.source === endpointNode.id && (e.relation === "TOUCHES_DATABASE" || e.relation === "QUERIES"));
        if (dbEdge) dbNode = nodeById.get(dbEdge.target);
      }

      // 6. Database Table
      let tableNode = null;
      let tableEdge = null;
      if (dbNode) {
        tableEdge = graph.edges.find(e => e.source === dbNode.id && (e.relation === "TOUCHES_DATABASE" || e.relation === "QUERIES" || e.relation === "READS_TABLE"));
        if (tableEdge) tableNode = nodeById.get(tableEdge.target);
      }

      // Synchronize inspector selection with this flow!
      const targetSelectNodeId = endpointNode ? endpointNode.id : reqNode.id;
      if (selectedNodeId !== targetSelectNodeId && (!selectedNodeId || (selectedNodeId !== callerNode?.id && selectedNodeId !== handlerNode?.id && selectedNodeId !== serviceNode?.id && selectedNodeId !== dbNode?.id && selectedNodeId !== tableNode?.id))) {
        selectNode(targetSelectNodeId, false);
      }

      const steps = [
        {
          title: "1. Frontend Component",
          node: callerNode,
          label: callerNode ? callerNode.label : "Entry Point / Caller",
          edge: callerEdge,
          unresolved: !callerNode,
          missingDesc: "No UI caller statically linked"
        },
        {
          title: "2. API Client Request",
          node: reqNode,
          label: reqNode.label,
          edge: targetEdge,
          unresolved: false
        },
        {
          title: "3. Backend Route",
          node: endpointNode,
          label: endpointNode ? endpointNode.label : "Unresolved Route",
          edge: targetEdge,
          unresolved: !endpointNode,
          missingDesc: "No backend handler matches this URL path"
        },
        {
          title: "4. Route Handler",
          node: handlerNode,
          label: handlerNode ? handlerNode.label : "Handler Callback",
          edge: handlerEdge,
          unresolved: !handlerNode,
          missingDesc: "Inline callback or external controller"
        },
        {
          title: "5. Domain Service",
          node: serviceNode,
          label: serviceNode ? serviceNode.label : (handlerNode ? "Direct Controller Logic" : "No Service Identified"),
          edge: serviceEdge,
          unresolved: !serviceNode && !handlerNode,
          missingDesc: "No separate domain service invoked"
        },
        {
          title: "6. Database Operation",
          node: dbNode,
          label: dbNode ? getNodeDisplayLabel(dbNode, graph) : "No DB operation recorded",
          edge: dbEdge,
          unresolved: !dbNode,
          missingDesc: "No database query executed"
        },
        {
          title: "7. Database Table / Schema",
          node: tableNode,
          label: tableNode ? tableNode.label : "No Table Linked",
          edge: tableEdge,
          unresolved: !tableNode,
          missingDesc: "No persistent table or schema entity linked"
        }
      ];

      steps.forEach((s, idx) => {
        const card = document.createElement("div");
        const isSelectedStep = s.node && s.node.id === selectedNodeId;
        card.className = "flow-step-card" + (s.unresolved ? " unresolved" : "") + (isSelectedStep ? " active-flow-step" : "");

        let badgeHtml = "";
        if (s.unresolved) {
          badgeHtml = '<span class="evidence-badge status-unresolved">⚠ Unresolved</span>';
        } else if (s.edge?.evidence?.status) {
          badgeHtml = renderEvidenceBadge(s.edge.evidence.status);
        } else {
          badgeHtml = '<span class="evidence-badge status-static">● Static Match</span>';
        }

        let locHtml = "";
        if (s.node?.location) {
          locHtml = '<div style="margin-top:4px;"><span class="source-link-pill" style="font-size:10px;padding:2px 6px;" data-file="' + escapeHtml(s.node.location.file) + '" data-line="' + s.node.location.line + '" onclick="event.stopPropagation(); inspectSourceLine(this.dataset.file, Number(this.dataset.line));">📄 ' + escapeHtml(s.node.location.file) + ':' + s.node.location.line + '</span></div>';
        } else if (s.missingDesc) {
          locHtml = '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">' + escapeHtml(s.missingDesc) + '</div>';
        }

        card.innerHTML =
          '<div class="flow-step-header">' +
            '<span>' + s.title + '</span>' +
            badgeHtml +
          '</div>' +
          '<div class="flow-step-title">' + escapeHtml(s.label) + '</div>' +
          '<div class="flow-step-meta">' + locHtml + '</div>';

        if (s.node) {
          card.onclick = () => {
            selectNode(s.node.id);
            document.querySelectorAll(".flow-step-card").forEach(c => c.classList.remove("active-flow-step"));
            card.classList.add("active-flow-step");
          };
        }
        container.appendChild(card);

        if (idx < steps.length - 1) {
          const arrow = document.createElement("div");
          arrow.className = "flow-arrow";
          arrow.textContent = "→";
          container.appendChild(arrow);
        }
      });
    }

    /* View 4: Change Impact */
    async function runImpactAnalysis() {
      const input = (document.getElementById("impactInput").value || "").trim();
      const container = document.getElementById("impactResultsContainer");
      if (!container) return;
      if (!input) {
        container.innerHTML = '<div class="impact-results" id="impactResults">Please enter a file name, function symbol, or field name.</div>';
        return;
      }
      container.innerHTML = '<div class="impact-results" id="impactResults">Evaluating change impact...</div>';

      let serverResult = null;
      if (!isOfflineMode) {
        try {
          const res = await fetch("/api/impact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target: input })
          });
          if (res.ok) {
            serverResult = await res.json();
          }
        } catch (e) { /* fallback to client eval */ }
      }

      // Find matching nodes in graph
      const directMatches = graph.nodes.filter(n =>
        n.label.toLowerCase() === input.toLowerCase() ||
        n.label.toLowerCase().includes(input.toLowerCase()) ||
        (n.location && n.location.file.toLowerCase().includes(input.toLowerCase()))
      );

      // Status classification
      const status = serverResult?.status || (directMatches.length === 0 ? "analysis_incomplete" : (directMatches.length > 0 && graph.edges.some(e => directMatches.some(m => m.id === e.target || m.id === e.source)) ? "confirmed_impact" : "no_impact_identified"));
      const isAnalysisIncomplete = status === "analysis_incomplete";

      if (isAnalysisIncomplete) {
        let html = '<div class="impact-status-banner status-incomplete" style="background:rgba(210,153,34,0.1);border:1px solid rgba(210,153,34,0.3);border-radius:6px;padding:12px;margin-bottom:12px;">' +
          '<div style="font-weight:700;font-size:13px;color:var(--accent-amber);display:flex;align-items:center;gap:6px;">⚠️ ANALYSIS INCOMPLETE (UNMAPPED SYMBOLS)</div>' +
          '<div style="font-size:12px;color:var(--text-bright);margin-top:4px;">No graph nodes directly matched <strong>"' + escapeHtml(input) + '"</strong>. Change impact cannot be ruled out.</div>' +
          '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">' + (serverResult?.statusExplanation || "Because the changed symbols or files could not be mapped to specific graph nodes, running the full discovered test suite is recommended as a safeguard.") + '</div>' +
        '</div>';

        const allTests = graph.nodes.filter(n => n.kind === "test");
        html += '<div class="impact-card">' +
          '<div class="impact-card-header">' +
            '<span style="color:var(--accent-amber);">🧪 Recommended Safeguard: Full Test Suite (' + allTests.length + ')</span>' +
            '<span class="evidence-badge status-unresolved">Conservative Fallback</span>' +
          '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">' + (serverResult?.testExplanation || "No graph-backed test mapping reached a changed node. Running all tests prevents undetected regressions.") + '</div>';

        if (allTests.length > 0) {
          html += '<div class="impact-chip-list">';
          allTests.forEach(t => {
            html += '<div class="impact-node-pill" data-id="' + escapeHtml(t.id) + '" onclick="selectNode(this.dataset.id); switchView(\\'graph\\');">' +
              '<span class="layer-dot dot-tests"></span>' +
              '<strong>' + escapeHtml(t.label) + '</strong>' +
              '<span style="color:var(--text-muted);font-size:10px;">(' + (t.location ? escapeHtml(t.location.file) : 'test') + ')</span>' +
            '</div>';
          });
          html += '</div>';
        } else {
          html += '<p style="font-size:12px;color:var(--text-muted);">No automated test files were discovered in this repository.</p>';
        }
        html += '</div>';

        container.innerHTML = html;
        return;
      }

      // If direct matches exist:
      const primaryTarget = directMatches[0];
      const callersSet = new Set();
      const calleesSet = new Set();
      const testsSet = new Set();

      directMatches.forEach(m => {
        graph.edges.filter(e => e.target === m.id).forEach(e => callersSet.add(e.source));
        graph.edges.filter(e => e.source === m.id).forEach(e => calleesSet.add(e.target));
      });

      // Find tests exercising any of these
      graph.nodes.filter(n => n.kind === "test").forEach(t => {
        const exercises = graph.edges.some(e => e.source === t.id && (callersSet.has(e.target) || directMatches.some(m => m.id === e.target)));
        if (exercises) testsSet.add(t.id);
      });

      const callers = [...callersSet].map(id => graph.nodes.find(n => n.id === id)).filter(Boolean);
      const callees = [...calleesSet].map(id => graph.nodes.find(n => n.id === id)).filter(Boolean);
      const fallbackTests = testsSet.size === 0;
      const tests = fallbackTests ? graph.nodes.filter(n => n.kind === "test") : [...testsSet].map(id => graph.nodes.find(n => n.id === id)).filter(Boolean);

      const statusBadge = status === "confirmed_impact"
        ? '<span class="evidence-badge" style="background:rgba(248,81,73,0.15);color:var(--accent-red);border:1px solid rgba(248,81,73,0.4);">🚨 CONFIRMED IMPACT</span>'
        : '<span class="evidence-badge" style="background:rgba(63,185,80,0.15);color:var(--accent-green);border:1px solid rgba(63,185,80,0.4);">✅ NO DOWNSTREAM IMPACT IDENTIFIED</span>';

      let html = '<div class="impact-card">' +
        '<div class="impact-card-header">' +
          '<span>🎯 Target: <strong>' + escapeHtml(primaryTarget.label) + '</strong></span>' +
          statusBadge +
        '</div>' +
        (serverResult?.statusExplanation ? '<div style="font-size:12px;color:var(--text-bright);margin:4px 0 6px;">' + escapeHtml(serverResult.statusExplanation) + '</div>' : '') +
        (primaryTarget.location ? '<div style="font-size:12px;"><span class="source-link-pill" data-file="' + escapeHtml(primaryTarget.location.file) + '" data-line="' + primaryTarget.location.line + '" onclick="inspectSourceLine(this.dataset.file, Number(this.dataset.line))">📄 ' + escapeHtml(primaryTarget.location.file) + ':' + primaryTarget.location.line + '</span></div>' : '') +
        '<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">' +
          'Found ' + directMatches.length + ' matched symbol(s). Modifying this entity affects <strong style="color:var(--accent-red);">' + callers.length + ' upstream caller(s)</strong>.' +
        '</div>' +
      '</div>';

      // Upstream Callers Card
      html += '<div class="impact-card">' +
        '<div class="impact-card-header">' +
          '<span style="color:var(--accent-red);">⚠️ Upstream Callers Affected (' + callers.length + ')</span>' +
          '<span style="font-size:11px;color:var(--text-muted);">Directly depend on target</span>' +
        '</div>';
      if (callers.length === 0) {
        html += '<p style="font-size:12px;color:var(--text-muted);">No direct upstream callers identified.</p>';
      } else {
        html += '<div class="impact-chip-list">';
        callers.forEach(c => {
          html += '<div class="impact-node-pill" data-id="' + escapeHtml(c.id) + '" onclick="selectNode(this.dataset.id); switchView(\\'graph\\');">' +
            '<span class="layer-dot dot-' + getNodeLayer(c) + '"></span>' +
            '<strong>' + escapeHtml(getNodeDisplayLabel(c, graph)) + '</strong>' +
            '<span style="color:var(--text-muted);font-size:10px;">(' + c.kind + ')</span>' +
          '</div>';
        });
        html += '</div>';
      }
      html += '</div>';

      // Downstream Dependencies Card
      html += '<div class="impact-card">' +
        '<div class="impact-card-header">' +
          '<span style="color:var(--accent-blue);">📦 Downstream Dependencies (' + callees.length + ')</span>' +
          '<span style="font-size:11px;color:var(--text-muted);">Invoked by target</span>' +
        '</div>';
      if (callees.length === 0) {
        html += '<p style="font-size:12px;color:var(--text-muted);">No downstream dependencies recorded.</p>';
      } else {
        html += '<div class="impact-chip-list">';
        callees.forEach(c => {
          html += '<div class="impact-node-pill" data-id="' + escapeHtml(c.id) + '" onclick="selectNode(this.dataset.id); switchView(\\'graph\\');">' +
            '<span class="layer-dot dot-' + getNodeLayer(c) + '"></span>' +
            '<strong>' + escapeHtml(getNodeDisplayLabel(c, graph)) + '</strong>' +
            '<span style="color:var(--text-muted);font-size:10px;">(' + c.kind + ')</span>' +
          '</div>';
        });
        html += '</div>';
      }
      html += '</div>';

      // Recommended Verification Tests Card
      const testBadgeType = serverResult?.testRecommendationType || (fallbackTests ? "full_suite_fallback" : "targeted");
      const isTargetedTest = testBadgeType === "targeted";
      html += '<div class="impact-card">' +
        '<div class="impact-card-header">' +
          '<span style="color:var(--accent-green);">🧪 Recommended Tests (' + tests.length + ')</span>' +
          '<span class="evidence-badge ' + (isTargetedTest ? 'status-static' : 'status-inferred') + '">' + (isTargetedTest ? 'Targeted Suite' : 'Full Suite Fallback') + '</span>' +
        '</div>' +
        '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">' + (serverResult?.testExplanation || (isTargetedTest ? 'Targeted tests exercising modified entity path.' : 'No direct test link reached target; running full suite as safeguard.')) + '</div>';
      if (tests.length === 0) {
        html += '<p style="font-size:12px;color:var(--text-muted);">No automated test files discovered.</p>';
      } else {
        html += '<div class="impact-chip-list">';
        tests.forEach(t => {
          html += '<div class="impact-node-pill" data-id="' + escapeHtml(t.id) + '" onclick="selectNode(this.dataset.id)">' +
            '<span class="layer-dot dot-tests"></span>' +
            '<strong>' + escapeHtml(t.label) + '</strong>' +
          '</div>';
        });
        html += '</div>';
      }
      html += '</div>';

      if (serverResult?.markdown) {
        html += '<div class="impact-card"><div class="impact-card-header">Detailed Intelligence Report</div><div style="font-size:12px;line-height:1.5;">' + formatMarkdown(serverResult.markdown) + '</div></div>';
      }

      container.innerHTML = html;
    }

    /* View 5: AI Assistant */
    async function sendAiMessage() {
      const input = document.getElementById("aiInput");
      const q = input.value.trim();
      if (!q) return;
      input.value = "";

      addChatMessage(q, "user");
      const loadingEl = addChatMessage("Thinking with RepoPath graph intelligence...", "assistant");

      try {
        if (!isOfflineMode) {
          const res = await fetch("/api/ai/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: q, contextNodeId: selectedNodeId })
          });
          if (res.ok) {
            const data = await res.json();
            loadingEl.innerHTML = formatMarkdown(data.answer);
            return;
          }
        }
        // Client-side AI fallback
        loadingEl.innerHTML = formatMarkdown(generateClientAiAnswer(q));
      } catch (e) {
        loadingEl.textContent = "AI request failed: " + e.message;
      }
    }

    function sendAiPrompt(promptText) {
      document.getElementById("aiInput").value = promptText;
      switchView("ai");
      sendAiMessage();
    }

    function askAiAboutSelected() {
      if (!selectedNodeId) return;
      const node = graph.nodes.find(n => n.id === selectedNodeId);
      sendAiPrompt(\`Explain component \${node?.label || selectedNodeId}\`);
    }

    function addChatMessage(text, role) {
      const msgs = document.getElementById("aiMessages");
      const msg = document.createElement("div");
      msg.className = "ai-msg " + role;
      const copyBtn = role === "assistant" ? '<div style="position:absolute;top:8px;right:8px;"><button class="copy-msg-btn" type="button" onclick="copyMessageText(this)">📋 Copy</button></div>' : '';
      msg.innerHTML = copyBtn + formatMarkdown(text);
      msgs.appendChild(msg);
      msgs.scrollTop = msgs.scrollHeight;
      return msg;
    }

    function generateClientAiAnswer(q) {
      const node = (graph && graph.nodes) ? (graph.nodes.find(n => n.id === selectedNodeId) || graph.nodes[0]) : null;
      const repo = (graph && graph.repository) ? graph.repository : "repository";
      const count = (graph && graph.edges) ? graph.edges.length : 0;
      const label = node ? node.label : "Overview";
      return "### Offline AI Analysis\\n" +
        "Based on statically established relationships in **" + repo + "**:\\n\\n" +
        "- Active context: \\x60" + label + "\\x60\\n" +
        "- Total verified relationships: " + count + "\\n\\n" +
        "To inspect full deep reasoning and source citations, run the live local service via \\x60repopath dashboard\\x60.";
    }

    /* Trace Path Mode */
    function toggleTraceMode() {
      isTraceMode = !isTraceMode;
      const btn = document.getElementById("traceModeBtn");
      if (isTraceMode) {
        if (graphCurrentLevel === 1) setGraphLevel(2);
        traceStartNodeId = null;
        btn.textContent = "Click Source Node...";
        btn.classList.add("btn-primary");
      } else {
        traceStartNodeId = null;
        btn.textContent = "📍 Trace Path";
        btn.classList.remove("btn-primary");
        resetHighlights();
        clearTracePath();
      }
    }

    function tracePathBetween(srcId, tgtId) {
      resetHighlights();
      if (graphCurrentLevel === 1) setGraphLevel(2);
      const nodeById = new Map(graph.nodes.map(n => [n.id, n]));
      const adjacency = new Map();

      graph.edges.forEach(e => {
        const list = adjacency.get(e.source) || [];
        list.push({ target: e.target, edgeId: e.id, relation: e.relation });
        adjacency.set(e.source, list);
      });

      // BFS
      const queue = [[srcId]];
      const visited = new Set([srcId]);
      let foundPath = null;

      while (queue.length > 0) {
        const path = queue.shift();
        const curr = path[path.length - 1];
        if (curr === tgtId) {
          foundPath = path;
          break;
        }
        for (const neighbor of (adjacency.get(curr) || [])) {
          if (!visited.has(neighbor.target)) {
            visited.add(neighbor.target);
            queue.push([...path, neighbor.target]);
          }
        }
      }

      if (foundPath) {
        foundPath.forEach(nId => highlightNodeInGraph(nId, "#58a6ff"));
        for (let i = 0; i < foundPath.length - 1; i++) {
          const s = foundPath[i];
          const t = foundPath[i + 1];
          const edge = graph.edges.find(e => e.source === s && e.target === t);
          if (edge) {
            const edgeEl = document.getElementById("edge-" + edge.id);
            if (edgeEl) {
              edgeEl.setAttribute("stroke", "#58a6ff");
              edgeEl.setAttribute("stroke-width", "3");
              edgeEl.setAttribute("marker-end", "url(#arrow-highlight)");
            }
          }
        }

        // Render Trace Banner
        const banner = document.getElementById("traceBanner");
        const stepsContainer = document.getElementById("tracePathSteps");
        if (banner && stepsContainer) {
          banner.style.display = "flex";
          let bannerHtml = '<strong style="color:var(--text-bright);margin-right:6px;">📍 Execution Path:</strong>';
          foundPath.forEach((nId, idx) => {
            const n = nodeById.get(nId);
            bannerHtml += '<span class="trace-step-pill" data-id="' + escapeHtml(nId) + '" onclick="selectNode(this.dataset.id)">' + escapeHtml(n?.label || nId) + '</span>';
            if (idx < foundPath.length - 1) {
              const edge = graph.edges.find(e => e.source === nId && e.target === foundPath[idx + 1]);
              bannerHtml += '<span style="color:var(--accent-blue);font-size:11px;font-weight:600;">→ ' + escapeHtml(edge?.relation || 'CALLS') + ' →</span>';
            }
          });
          stepsContainer.innerHTML = bannerHtml;
        }
      } else {
        alert("No direct path found between selected nodes.");
      }
    }

    function clearTracePath() {
      const banner = document.getElementById("traceBanner");
      if (banner) banner.style.display = "none";
      resetHighlights();
    }

    function highlightNodeInGraph(nodeId, color) {
      const el = document.getElementById("node-" + nodeId);
      if (el) el.querySelector("rect").setAttribute("stroke", color);
    }

    function resetHighlights() {
      document.querySelectorAll(".graph-node").forEach(g => {
        g.style.opacity = "1";
        const nId = g.id.replace("node-", "");
        const node = graph.nodes.find(n => n.id === nId);
        if (node) {
          g.querySelector("rect").setAttribute("stroke", getNodeColor(getNodeLayer(node)));
          g.querySelector("rect").setAttribute("stroke-width", "1.5");
        }
      });
      document.querySelectorAll("#edgesLayer path").forEach(p => {
        p.setAttribute("stroke", "#30363d");
        p.setAttribute("stroke-width", "1.5");
        p.setAttribute("opacity", "1");
        p.setAttribute("marker-end", "url(#arrow)");
      });
      document.querySelectorAll(".tree-node-item").forEach(el => {
        el.classList.remove("selected");
      });
    }

    function showAllNodes() {
      selectedNodeId = null;
      resetHighlights();
    }

    /* Pan & Zoom */
    function setupPanZoom() {
      const svg = document.getElementById("graphSvg");
      svg.addEventListener("mousedown", (e) => {
        if (e.target.tagName === "svg" || e.target.id === "edgesLayer") {
          isDragging = true;
          startDragX = e.clientX - panX;
          startDragY = e.clientY - panY;
        }
      });
      window.addEventListener("mousemove", (e) => {
        if (isDragging) {
          panX = e.clientX - startDragX;
          panY = e.clientY - startDragY;
          applyTransform();
        }
      });
      window.addEventListener("mouseup", () => isDragging = false);
      svg.addEventListener("wheel", (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        zoomGraph(factor);
      });
    }

    function zoomGraph(factor) {
      zoomLevel = Math.max(0.2, Math.min(3, zoomLevel * factor));
      applyTransform();
    }

    function resetGraphZoom() {
      const svg = document.getElementById("graphSvg");
      const root = document.getElementById("graphRoot");
      if (svg && root) {
        try {
          const bbox = root.getBBox();
          if (bbox && bbox.width > 0 && bbox.height > 0) {
            const svgRect = svg.getBoundingClientRect();
            const padding = 60;
            const scaleX = (svgRect.width - padding * 2) / bbox.width;
            const scaleY = (svgRect.height - padding * 2) / bbox.height;
            zoomLevel = Math.max(0.3, Math.min(1.2, Math.min(scaleX, scaleY)));
            panX = Math.round((svgRect.width - bbox.width * zoomLevel) / 2 - bbox.x * zoomLevel);
            panY = Math.round((svgRect.height - bbox.height * zoomLevel) / 2 - bbox.y * zoomLevel);
            applyTransform();
            return;
          }
        } catch (e) {
          // getBBox may throw if not visible
        }
      }
      zoomLevel = 1;
      panX = 40;
      panY = 40;
      applyTransform();
    }

    function applyTransform() {
      const root = document.getElementById("graphRoot");
      if (root) root.setAttribute("transform", \`translate(\${panX}, \${panY}) scale(\${zoomLevel})\`);
    }

    /* Scan Wizard Logic: Multi-Folder / Multi-Location Workspace */
    let wizardCurrentStep = 1;

    function addFolderRow(defaultValue = "") {
      const container = document.getElementById("folderRowsContainer");
      if (!container) return;
      const count = container.children.length;
      const row = document.createElement("div");
      row.className = "folder-input-row";
      row.style.display = "flex";
      row.style.gap = "8px";
      row.style.alignItems = "center";

      const idxSpan = document.createElement("span");
      idxSpan.style.color = "var(--text-muted)";
      idxSpan.style.fontSize = "12px";
      idxSpan.style.width = "20px";
      idxSpan.style.textAlign = "right";
      idxSpan.textContent = (count + 1) + ".";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "scan-folder-input";
      input.value = defaultValue;
      input.placeholder = "e.g. ./frontend, ./backend, /path/to/repo";
      input.style.flex = "1";
      input.style.background = "var(--bg-primary)";
      input.style.border = "1px solid var(--border-subtle)";
      input.style.borderRadius = "6px";
      input.style.padding = "8px 12px";
      input.style.color = "var(--text-bright)";
      input.style.fontSize = "13px";
      input.style.outline = "none";
      input.onkeydown = (e) => { if (e.key === "Enter") inspectDirectory(); };

      const removeBtn = document.createElement("button");
      removeBtn.className = "btn btn-sm";
      removeBtn.style.color = "var(--accent-red)";
      removeBtn.style.padding = "6px 10px";
      removeBtn.title = "Remove location";
      removeBtn.textContent = "✕";
      removeBtn.onclick = () => removeFolderRow(removeBtn);
      if (count === 0) {
        removeBtn.style.visibility = "hidden";
      }

      row.appendChild(idxSpan);
      row.appendChild(input);
      row.appendChild(removeBtn);
      container.appendChild(row);
      input.focus();
    }

    function removeFolderRow(btn) {
      const row = btn.closest(".folder-input-row");
      if (row) {
        row.remove();
        const container = document.getElementById("folderRowsContainer");
        Array.from(container.children).forEach((r, idx) => {
          const span = r.querySelector("span");
          if (span) span.textContent = (idx + 1) + ".";
          const b = r.querySelector("button");
          if (b) b.style.visibility = idx === 0 && container.children.length === 1 ? "hidden" : "visible";
        });
      }
    }

    function getFolderRows() {
      const inputs = document.querySelectorAll(".scan-folder-input");
      const list = [];
      inputs.forEach(inp => {
        const v = inp.value.trim();
        if (v) list.push(v);
      });
      return list.length > 0 ? list : ["."];
    }

    function openScanWizard() {
      wizardCurrentStep = 1;
      showWizardStep(1);
      const container = document.getElementById("folderRowsContainer");
      if (container && container.children.length === 0) {
        fetch("/api/status").then(r => r.json()).then(data => {
          if (data && data.activeDirectories && data.activeDirectories.length > 0) {
            container.innerHTML = "";
            data.activeDirectories.forEach(d => addFolderRow(d));
          } else {
            addFolderRow(".");
          }
        }).catch(() => {
          addFolderRow(".");
        });
      }
      document.getElementById("scanModal").classList.add("active");
    }

    function closeScanWizard() {
      document.getElementById("scanModal").classList.remove("active");
    }

    function showWizardStep(step) {
      wizardCurrentStep = step;
      document.getElementById("wizardStep1Tab").classList.toggle("active", step === 1);
      document.getElementById("wizardStep2Tab").classList.toggle("active", step === 2);
      document.getElementById("wizardStep3Tab").classList.toggle("active", step === 3);

      document.getElementById("step1View").style.display = step === 1 ? "block" : "none";
      document.getElementById("step2View").style.display = step === 2 ? "block" : "none";
      document.getElementById("step3View").style.display = step === 3 ? "block" : "none";

      const nextBtn = document.getElementById("wizardNextBtn");
      nextBtn.disabled = false;
      nextBtn.onclick = wizardNext;
      document.getElementById("wizardBackBtn").style.display = step > 1 ? "block" : "none";
      nextBtn.textContent = step === 1 ? "Continue to Scan Plan" : step === 2 ? "Start Scan" : "Done";
    }

    async function inspectDirectory() {
      const dirs = getFolderRows();
      const resContainer = document.getElementById("detectionResults");
      resContainer.style.display = "block";
      resContainer.innerHTML = '<span style="color:var(--text-muted)">Inspecting ' + dirs.length + ' project location(s)...</span>';

      try {
        const res = await fetch("/api/project/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ directories: dirs })
        });
        if (res.ok) {
          const data = await res.json();
          let html = '<div style="font-weight:600;color:var(--text-bright);margin-bottom:6px;">Project: ' + escapeHtml(data.projectName) + ' (' + data.structure.totalFiles + ' total files)</div>' +
            '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Combined frameworks: <strong>' + escapeHtml(data.frameworks.join(', ') || 'Standard TS/JS') + '</strong> · Package managers: <strong>' + escapeHtml(data.packageManagers.join(', ') || 'None') + '</strong></div>';
          
          if (data.folders && data.folders.length > 0) {
            html += '<div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">';
            data.folders.forEach(f => {
              html += '<div style="background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:6px;padding:8px 10px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                  '<strong style="color:var(--text-bright);">📁 ' + escapeHtml(f.name) + '</strong>' +
                  '<span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono);">' + f.totalFiles + ' files</span>' +
                '</div>' +
                '<div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono);margin:2px 0 4px 0;word-break:break-all;">' + escapeHtml(f.directory) + '</div>' +
                '<div style="font-size:12px;">' +
                  '<span style="color:var(--accent-blue);margin-right:8px;">' + escapeHtml(f.frameworks.join(', ') || 'General') + '</span>' +
                  '<span>' + f.languages.map(l => escapeHtml(l.name) + ' (' + l.percentage + '%)').join(', ') + '</span>' +
                '</div>' +
              '</div>';
            });
            html += '</div>';
          }
          resContainer.innerHTML = html;
        } else {
          const err = await res.json();
          resContainer.innerHTML = '<span style="color:var(--accent-red)">Error: ' + escapeHtml(err.error || 'Failed to inspect') + '</span>';
        }
      } catch (e) {
        resContainer.innerHTML = '<span style="color:var(--accent-red)">Could not inspect directories: ' + escapeHtml(e.message) + '</span>';
      }
    }

    async function wizardNext() {
      if (wizardCurrentStep === 1) {
        // Step 1 -> Step 2: Load scan plan preview
        const dirs = getFolderRows();
        showWizardStep(2);
        const planSummary = document.getElementById("planSummary");
        planSummary.innerHTML = '<span style="color:var(--text-muted)">Generating scan plan across ' + dirs.length + ' location(s)...</span>';
        try {
          const res = await fetch("/api/scan/plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ directories: dirs })
          });
          if (res.ok) {
            const plan = await res.json();
            let html = '<p style="margin-bottom:8px;">Ready to scan <strong>' + plan.totalFiles + '</strong> files across <strong>' + (plan.folders ? plan.folders.length : dirs.length) + '</strong> location(s):</p>';
            if (plan.folders && plan.folders.length > 0) {
              html += '<ul style="padding-left:18px;margin-bottom:12px;">';
              plan.folders.forEach(f => {
                html += '<li><code>' + escapeHtml(f.name) + '</code> (' + escapeHtml(f.path) + ') — <strong>' + f.fileCount + '</strong> files</li>';
              });
              html += '</ul>';
            }
            html += '<h4 style="margin:10px 0 4px 0;font-size:12px;color:var(--text-muted);text-transform:uppercase;">Active Analyzers:</h4>' +
              '<ul style="padding-left:18px;">';
            plan.activeAnalyzers.filter(a => a.enabled).forEach(a => {
              html += '<li><strong>' + escapeHtml(a.name) + '</strong> — ' + escapeHtml(a.description) + '</li>';
            });
            html += '</ul>' +
              '<h4 style="margin:10px 0 4px 0;font-size:12px;color:var(--text-muted);text-transform:uppercase;">Ignored Folders:</h4>' +
              '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">' + escapeHtml(plan.ignoredDirectories.join(', ')) + '</div>';
            if (plan.warnings && plan.warnings.length > 0) {
              html += '<div style="margin-top:10px;padding:8px;background:rgba(210,153,34,0.15);border:1px solid var(--accent-amber);border-radius:6px;color:var(--accent-amber);font-size:12px;">' +
                '⚠️ ' + escapeHtml(plan.warnings.join('; ')) + '</div>';
            }
            planSummary.innerHTML = html;
          } else {
            const err = await res.json();
            planSummary.innerHTML = '<span style="color:var(--accent-red)">Failed to generate plan: ' + escapeHtml(err.error || 'Unknown error') + '</span>';
          }
        } catch (e) {
          planSummary.innerHTML = '<span style="color:var(--accent-red)">Could not load plan: ' + escapeHtml(e.message) + '</span>';
        }
      } else if (wizardCurrentStep === 2) {
        // Step 2 -> Step 3: Start scan
        showWizardStep(3);
        const nextBtn = document.getElementById("wizardNextBtn");
        nextBtn.disabled = true;
        nextBtn.textContent = "Scanning in progress...";
        const dirs = getFolderRows();
        try {
          const res = await fetch("/api/scan/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ directories: dirs })
          });
          if (res.ok) {
            const job = await res.json();
            pollScanJob(job.id);
          } else {
            const err = await res.json();
            document.getElementById("jobStageName").textContent = "Failed to start: " + (err.error || "Unknown error");
            nextBtn.disabled = false;
            nextBtn.textContent = "Close";
          }
        } catch (e) {
          document.getElementById("jobStageName").textContent = "Failed to start: " + e.message;
          nextBtn.disabled = false;
          nextBtn.textContent = "Close";
        }
      } else {
        closeScanWizard();
      }
    }

    function wizardBack() {
      if (wizardCurrentStep > 1) showWizardStep(wizardCurrentStep - 1);
    }

    async function pollScanJob(jobId) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(\`/api/scan/status/\${jobId}\`);
          if (res.ok) {
            const job = await res.json();
            document.getElementById("jobStageName").textContent = job.currentStage;
            document.getElementById("jobPercent").textContent = job.progress + "%";
            document.getElementById("jobProgressBar").style.width = job.progress + "%";
            document.getElementById("jobLogsConsole").innerHTML = job.logs.map(l => \`<div>\${escapeHtml(l)}</div>\`).join("");
            document.getElementById("jobLogsConsole").scrollTop = document.getElementById("jobLogsConsole").scrollHeight;

            if (job.status === "completed") {
              clearInterval(interval);
              document.getElementById("jobStageName").textContent = "✓ Scan Complete!";
              const nextBtn = document.getElementById("wizardNextBtn");
              nextBtn.disabled = false;
              nextBtn.textContent = "Explore Architecture →";
              nextBtn.onclick = () => {
                closeScanWizard();
                switchView("overview");
              };
              loadGraphFromServer();
            } else if (job.status === "failed") {
              clearInterval(interval);
              document.getElementById("jobStageName").textContent = "Scan Failed: " + (job.error || "Unknown error");
              const nextBtn = document.getElementById("wizardNextBtn");
              nextBtn.disabled = false;
              nextBtn.textContent = "Close";
              nextBtn.onclick = () => closeScanWizard();
            }
          }
        } catch (e) {
          clearInterval(interval);
        }
      }, 500);
    }

    /* Command Palette */
    function openCmdPalette() {
      document.getElementById("cmdModal").classList.add("active");
      document.getElementById("cmdInput").focus();
      handleCmdSearch();
    }
    function closeCmdPalette() {
      document.getElementById("cmdModal").classList.remove("active");
    }
    function handleCmdSearch() {
      const q = (document.getElementById("cmdInput").value || "").toLowerCase();
      const results = document.getElementById("cmdResults");
      results.innerHTML = "";

      if (!graph) return;
      const filtered = graph.nodes.filter(n => !q || n.label.toLowerCase().includes(q) || (n.location && n.location.file.toLowerCase().includes(q))).slice(0, 10);
      filtered.forEach(node => {
        const item = document.createElement("div");
        item.className = "cmd-item";
        item.innerHTML = \`<span>\${escapeHtml(node.label)}</span><span style="font-size:11px;color:var(--text-muted)">\${node.kind}</span>\`;
        item.onclick = () => {
          selectNode(node.id);
          closeCmdPalette();
          switchView("graph");
        };
        results.appendChild(item);
      });
    }

    function setupKeyboardShortcuts() {
      window.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "k") {
          e.preventDefault();
          openCmdPalette();
        }
        if (e.key === "Escape") {
          closeCmdPalette();
          closeScanWizard();
        }
      });
    }

    function exportOfflineReport() {
      window.open("/api/export", "_blank");
    }

    /* Utilities */
    function escapeHtml(str) {
      if (!str) return "";
      return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    }
    function truncate(str, len) {
      if (!str) return "";
      return str.length > len ? str.slice(0, len - 1) + "…" : str;
    }
    function hexToRgb(hex) {
      const bigint = parseInt(hex.replace('#', ''), 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      return \`\${r},\${g},\${b}\`;
    }
    function copyMessageText(btn) {
      const msg = btn.closest(".ai-msg");
      if (!msg) return;
      const text = msg.innerText.replace(/📋 Copy\s*$/, '').trim();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = "✓ Copied!";
          setTimeout(() => { btn.textContent = "📋 Copy"; }, 2000);
        });
      }
    }

    function copyCode(btn) {
      const pre = btn.closest(".code-block-wrapper") ? btn.closest(".code-block-wrapper").querySelector("pre") : null;
      if (!pre) return;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(pre.innerText).then(() => {
          btn.textContent = "✓ Copied!";
          setTimeout(() => { btn.textContent = "Copy"; }, 2000);
        });
      }
    }

    function formatMarkdown(text) {
      if (!text) return "";
      const lines = text.split(String.fromCharCode(10)).map(l => l.replace(new RegExp(String.fromCharCode(13) + "$"), ""));
      const out = [];
      let inList = false;
      let inCodeBlock = false;
      let codeBuffer = [];
      let codeLang = "typescript";

      for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const trimmed = rawLine.trim();

        if (trimmed.startsWith(String.fromCharCode(96, 96, 96))) {
          if (inCodeBlock) {
            out.push('<div class="code-block-wrapper">' +
              '<div class="code-block-header"><span>' + escapeHtml(codeLang) + '</span><button class="copy-code-btn" type="button" onclick="copyCode(this)">Copy</button></div>' +
              '<pre style="margin:0;padding:10px;overflow-x:auto;font-family:var(--font-mono);font-size:12px;color:var(--text-bright);line-height:1.4;"><code>' + escapeHtml(codeBuffer.join(String.fromCharCode(10))) + '</code></pre>' +
            '</div>');
            inCodeBlock = false;
            codeBuffer = [];
          } else {
            if (inList) { out.push("</ul>"); inList = false; }
            inCodeBlock = true;
            codeLang = trimmed.slice(3).trim() || "typescript";
            codeBuffer = [];
          }
          continue;
        }

        if (inCodeBlock) {
          codeBuffer.push(rawLine);
          continue;
        }

        if (!trimmed) {
          if (inList) { out.push("</ul>"); inList = false; }
          continue;
        }

        if (trimmed.startsWith("#### ")) {
          if (inList) { out.push("</ul>"); inList = false; }
          out.push('<h4 style="margin:10px 0 4px 0;font-size:13px;font-weight:600;color:var(--accent-purple);">' + escapeHtml(trimmed.slice(5)) + '</h4>');
          continue;
        }
        if (trimmed.startsWith("### ")) {
          if (inList) { out.push("</ul>"); inList = false; }
          out.push('<h3 style="margin:14px 0 6px 0;font-size:14px;font-weight:700;color:var(--text-bright);border-bottom:1px solid var(--border-subtle);padding-bottom:4px;">' + escapeHtml(trimmed.slice(4)) + '</h3>');
          continue;
        }
        if (trimmed.startsWith("## ")) {
          if (inList) { out.push("</ul>"); inList = false; }
          out.push('<h2 style="margin:16px 0 8px 0;font-size:16px;font-weight:700;color:var(--accent-blue);">' + escapeHtml(trimmed.slice(3)) + '</h2>');
          continue;
        }

        if (trimmed.includes("⚠️") || trimmed.startsWith("- ⚠️")) {
          if (inList) { out.push("</ul>"); inList = false; }
          const content = trimmed.replace(/^-\s*⚠️\s*/, '').replace(/^⚠️\s*/, '');
          out.push('<div style="background:rgba(248,81,73,0.1);border-left:3px solid var(--accent-red);padding:8px 12px;border-radius:4px;margin:6px 0;font-size:12px;">' + formatInlineMarkdown(content) + '</div>');
          continue;
        }
        if (trimmed.includes("ℹ️") || trimmed.startsWith("- ℹ️")) {
          if (inList) { out.push("</ul>"); inList = false; }
          const content = trimmed.replace(/^-\s*ℹ️\s*/, '').replace(/^ℹ️\s*/, '');
          out.push('<div style="background:rgba(56,139,253,0.1);border-left:3px solid var(--accent-blue);padding:8px 12px;border-radius:4px;margin:6px 0;font-size:12px;">' + formatInlineMarkdown(content) + '</div>');
          continue;
        }

        if (trimmed.startsWith("- ")) {
          if (!inList) { out.push('<ul style="margin:6px 0 6px 18px;display:flex;flex-direction:column;gap:4px;">'); inList = true; }
          out.push('<li>' + formatInlineMarkdown(trimmed.slice(2)) + '</li>');
          continue;
        }

        if (inList) { out.push("</ul>"); inList = false; }
        out.push('<p style="margin:4px 0;">' + formatInlineMarkdown(trimmed) + '</p>');
      }
      if (inCodeBlock && codeBuffer.length > 0) {
        out.push('<div class="code-block-wrapper"><pre style="margin:0;padding:10px;overflow-x:auto;"><code>' + escapeHtml(codeBuffer.join(String.fromCharCode(10))) + '</code></pre></div>');
      }
      if (inList) out.push("</ul>");
      return out.join("");
    }

    function onAnalyzeImpactClick(label) {
      const input = document.getElementById("impactInput");
      if (input) input.value = label;
      switchView("impact");
      runImpactAnalysis();
    }

    function formatInlineMarkdown(text) {
      let s = escapeHtml(text);
      s = s.split("**").map((chunk, idx) => idx % 2 === 1 ? '<strong>' + chunk + '</strong>' : chunk).join("");
      s = s.replace(/([-a-zA-Z0-9_./]+):([0-9]+)/g, function(match, f, line) {
        return '<span class="source-link-pill" data-file="' + f + '" data-line="' + line + '" onclick="inspectSourceLine(this.dataset.file, Number(this.dataset.line))">📄 ' + f + ':' + line + '</span>';
      });
      s = s.split(String.fromCharCode(96)).map((chunk, idx) => idx % 2 === 1 ? '<code class="code-pill clickable-pill" data-sym="' + chunk + '" onclick="findAndSelectSymbol(this.dataset.sym)">' + chunk + '</code>' : chunk).join("");
      return s;
    }

    // Explicitly expose functions to window for reliable HTML event binding
    window.switchView = switchView;
    window.selectNode = selectNode;
    window.toggleLayerFilter = toggleLayerFilter;
    window.handleFilter = handleFilter;
    window.renderSelectedFlow = renderSelectedFlow;
    window.runImpactAnalysis = runImpactAnalysis;
    window.onAnalyzeImpactClick = onAnalyzeImpactClick;
    window.sendAiMessage = sendAiMessage;
    window.sendAiPrompt = sendAiPrompt;
    window.askAiAboutSelected = askAiAboutSelected;
    window.toggleTraceMode = toggleTraceMode;
    window.tracePathBetween = tracePathBetween;
    window.clearTracePath = clearTracePath;
    window.zoomGraph = zoomGraph;
    window.resetGraphZoom = resetGraphZoom;
    window.showAllNodes = showAllNodes;
    window.openScanWizard = openScanWizard;
    window.closeScanWizard = closeScanWizard;
    window.wizardNext = wizardNext;
    window.wizardBack = wizardBack;
    window.inspectDirectory = inspectDirectory;
    window.addFolderRow = addFolderRow;
    window.removeFolderRow = removeFolderRow;
    window.toggleFolderFilter = toggleFolderFilter;
    window.openCmdPalette = openCmdPalette;
    window.closeCmdPalette = closeCmdPalette;
    window.handleCmdSearch = handleCmdSearch;
    window.exportOfflineReport = exportOfflineReport;
    window.setGraphLevel = setGraphLevel;
    window.setExperienceMode = setExperienceMode;
    window.saveWorkspace = saveWorkspace;
    window.showHealthFindings = showHealthFindingsGlobal;
    window.showContracts = showContractsGlobal;
    window.downloadArchitecture = downloadArchitectureGlobal;
    window.exploreGuidedProject = exploreGuidedProject;
    window.traceGuidedFeature = traceGuidedFeature;
    window.guidedFindSource = guidedFindSource;
    window.guidedReviewChange = guidedReviewChange;
    window.expandNeighbours = expandNeighbours;
    window.collapseGraph = collapseGraph;
    window.filterByRelation = filterByRelation;
    window.renderApiExplorer = renderApiExplorer;
    window.setApiFilter = setApiFilter;
    window.selectApiOperation = selectApiOperation;
    window.setApiDetailTab = setApiDetailTab;
    window.showEdgeEvidence = showEdgeEvidence;
    window.exploreLayer = exploreLayer;
    window.inspectSourceLine = inspectSourceLine;
    window.findAndSelectSymbol = findAndSelectSymbol;
    window.focusSelectedInGraph = focusSelectedInGraph;
    window.focusSelectedInFlow = focusSelectedInFlow;
    window.focusSelectedInImpact = focusSelectedInImpact;
    window.toggleInspector = toggleInspector;
    window.clearAiContext = clearAiContext;
    window.getDistinctRelations = getDistinctRelations;
    window.renderRelationButtons = renderRelationButtons;
    window.selectFlowItem = selectFlowItem;
    window.toggleFlowCombobox = toggleFlowCombobox;
    window.openFlowCombobox = openFlowCombobox;
    window.filterFlowCombobox = filterFlowCombobox;
    window.copyMessageText = copyMessageText;
    window.copyCode = copyCode;
    window.calculateProjectMetrics = calculateProjectMetrics;
    window.getNodeDisplayLabel = getNodeDisplayLabel;
    window.formatSmartNodeLabel = formatSmartNodeLabel;
  </script>
</body>
</html>`;
}
