// ================================================================
// db.js - Tiny file-based JSON database
// Keeps the project dependency-free (no MongoDB installation needed).
// Data is stored in backend/data/db.json and read/written with fs.
// ================================================================

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

const DEFAULT_DATA = {
  users: [],
  lectures: [],
  quizzes: [],
  planners: [],
  timetables: [],
  attendance: [],
  attendanceSessions: []
};

// Create the db file the first time the server runs
function ensureDbExists() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DATA, null, 2), "utf-8");
  }
}

function readDb() {
  ensureDbExists();
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  try {
    const data = JSON.parse(raw);
    if (!data.users) data.users = [];
    if (!data.lectures) data.lectures = [];
    if (!data.quizzes) data.quizzes = [];
    if (!data.planners) data.planners = [];
    if (!data.timetables) data.timetables = [];
    if (!data.attendance) data.attendance = [];
    if (!data.attendanceSessions) data.attendanceSessions = [];
    return data;
  } catch (err) {
    // If the file ever gets corrupted, reset it instead of crashing the server
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DATA, null, 2), "utf-8");
    return { ...DEFAULT_DATA };
  }
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
}

module.exports = { readDb, writeDb, ensureDbExists };
