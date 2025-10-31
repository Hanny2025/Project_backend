const mysql = require('mysql2');
const connection = mysql.createConnection({
  host: 'localhost',     
  user: 'root',          
  password: '',          
  database: 'project_moblie' 
});
connection.connect((err) => {
  if (err) {
    console.error('❌ Database connection failed: ' + err.stack);
    return;
  }
  console.log('✅ Connected to database as ID ' + connection.threadId);
});
connection.query('SELECT * FROM users', (err, results) => {
  if (err) throw err;
  console.log(results);
});


