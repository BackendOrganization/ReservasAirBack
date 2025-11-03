const mysql = require('mysql2');

const db = mysql.createPool({
  host: 'centerbeam.proxy.rlwy.net',
  user: 'root',
  password: 'JjESEyIPThXsGnxlPmYBTESJkNmIgQYv',
  database: 'railway',
  port: 51597,
  waitForConnections: true,
  connectionLimit: 50,  // Aumentado de 10 a 50
  queueLimit: 0,
  acquireTimeout: 30000,  // Timeout de 30 segundos
  timeout: 60000  // Query timeout de 60 segundos
});

// Test the pool connection
db.getConnection((err, connection) => {
  if (err) {
    console.error('Error de conexión al pool:', err);
  } else {
    console.log('Conectado al pool de MySQL Railway');
    connection.release(); // devolver la conexión al pool
  }
});

module.exports = db;
