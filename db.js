const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "project_moblie",
});
pool
  .getConnection()
  .then((conn) => {
    console.log("✅ Connected to MySQL as ID " + conn.threadId);
    conn.release();
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err);
  });

module.exports = pool;
