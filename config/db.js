const mysql = require('mysql');
const db = mysql.createConnection({
  host: '127.0.0.1',
  user: 'agusmel03',
  password: '1234',
  database: 'ReservasAirBack',
  port: 3306 // <-- agrega esto
});
db.connect((err) => {
  if (err) {
    console.error('Error de conexión:', err);
    throw err;
  }
  console.log('Conectado a MySQL');
});
module.exports = db;