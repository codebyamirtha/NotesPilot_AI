// ================================================================
// auth.js (middleware) - verifies the JWT token sent by the frontend
// ================================================================

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "notespilot_dev_secret_change_me";

function verifyToken(req, res, next) {
  const header = req.headers["authorization"];
  const token = (header && header.startsWith("Bearer ") ? header.slice(7) : null) || req.query.token;

  if (!token) {
    return res.status(401).json({ message: "No token provided. Please log in." });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: "Session expired. Please log in again." });
    }
    req.user = decoded; // { id, name, email }
    next();
  });
}

module.exports = { verifyToken, JWT_SECRET };
