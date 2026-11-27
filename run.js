// ================================================================
// run.js - Single entry-point launcher for NotesPilot AI
// Run directly in VS Code by typing:  node run.js
// or right-clicking this file in VS Code and selecting "Run Code" / "Run JS File"
// ================================================================

const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

console.log("🚀 Starting NotesPilot AI Server from VS Code...\n");

const backendServerPath = path.join(__dirname, "backend", "server.js");

// Start the Express server
require(backendServerPath);

// Wait 1 second then automatically open the browser
setTimeout(() => {
  const url = "http://localhost:5000";
  console.log(`\n🌐 Opening NotesPilot AI in your default browser: ${url}\n`);

  const startCmd = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
  spawn(startCmd, [url], { shell: true });
}, 1200);
