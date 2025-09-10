const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'centerbeam.proxy.rlwy.net',
  user: 'root',
  password: 'JjESEyIPThXsGnxlPmYBTESJkNmIgQYv',
  database: 'railway',
  port: 51597
});

db.connect((err) => {
  if (err) {
    console.error('Error de conexión:', err);
    throw err;
  }
  console.log('Conectado a MySQL Railway');
});

module.exports = db;
