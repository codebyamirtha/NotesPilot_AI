// ================================================================
// index.js - Root Entry Point for NotesPilot AI
// Run this single file directly in VS Code!
// Command:  node index.js
// ================================================================

const { spawn } = require("child_process");
const path = require("path");

console.log("==================================================");
console.log("📚 NotesPilot AI - Classroom Learning Assistant");
console.log("==================================================\n");

// Require and launch backend server
const backendPath = path.join(__dirname, "backend", "server.js");
require(backendPath);

// Automatically open browser after 1 second
setTimeout(() => {
  const url = "http://localhost:5000";
  console.log(`\n✅ Server active! Launching web browser at: ${url}\n`);
  const openCmd = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
  spawn(openCmd, [url], { shell: true });
}, 1000);
