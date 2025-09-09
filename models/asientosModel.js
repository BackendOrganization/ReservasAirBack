const db = require('../config/db');


// Obtener todos los asientos
const obtenerTodosLosAsientos = (idVuelo, callback) => {
    const query = 'SELECT * FROM asiento WHERE Id_vuelo = ?';
    db.query(query, [idVuelo], (err, results) => {
        if (err) return callback(err);
        callback(null, results);
    });
};


// Obtener asientos libres
const obtenerAsientosLibres = (idVuelo, callback) => {
    const query = "SELECT * FROM asiento WHERE Id_vuelo = ? AND Estado = 'disponible'";
    db.query(query, [idVuelo], (err, results) => {
        if (err) return callback(err);
        callback(null, results);
    });
};



module.exports = {
    obtenerTodosLosAsientos,
    obtenerAsientosLibres

};
