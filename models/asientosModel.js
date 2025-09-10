const db = require('../config/db');


const obtenerTodosLosAsientos = (idVuelo, callback) => {
    const query = 'SELECT * FROM asiento WHERE Id_vuelo = ?';
    db.query(query, [idVuelo], (err, results) => {
        if (err) return callback(err);
        callback(null, results);
    });
};

// const obtenerAsientosLibres = (idVuelo, callback) => {
//     const query = "SELECT * FROM asiento WHERE Id_vuelo = ? AND Estado = 'disponible'";
//     db.query(query, [idVuelo], (err, results) => {
//         if (err) return callback(err);
//         callback(null, results);
//     });
// };
//
// // Obtener asientos ocupados (reservado o confirmado)
// const obtenerAsientosOcupados = (idVuelo, callback) => {
//     const query = "SELECT * FROM asiento WHERE Id_vuelo = ? AND Estado IN ('reservado', 'confirmado')";
//     db.query(query, [idVuelo], (err, results) => {
//         if (err) return callback(err);
//         callback(null, results);
//     });
// };

const reservarAsiento = (idVuelo, idAsiento, callback) => {
    const query = `UPDATE asiento SET Estado = 'reservado' WHERE Id_vuelo = ? AND Id_asiento = ? AND Estado = 'disponible'`;
    db.query(query, [idVuelo, idAsiento], (err, result) => {
        if (err) return callback(err);
        if (result.affectedRows === 0) {
            return callback(null, { success: false, message: 'El asiento no está disponible o no existe.' });
        }
        callback(null, { success: true, message: 'Asiento reservado correctamente.' });
    });
};

const cancelarAsiento = (idVuelo, idAsiento, callback) => {
    const query = `UPDATE asiento SET Estado = 'disponible' WHERE Id_vuelo = ? AND Id_asiento = ? AND Estado = 'confirmado'`;
    db.query(query, [idVuelo, idAsiento], (err, result) => {
        if (err) return callback(err);
        if (result.affectedRows === 0) {
            return callback(null, { success: false, message: 'El asiento no estaba confirmado o no existe.' });
        }
        callback(null, { success: true, message: 'Asiento cancelado correctamente.' });
    });
};

const timeOutFallaAsiento = (idVuelo, idAsiento, callback) => {
    const query = `UPDATE asiento SET Estado = 'disponible' WHERE Id_vuelo = ? AND Id_asiento = ? AND Estado = 'pendiente'`;
    db.query(query, [idVuelo, idAsiento], (err, result) => {
        if (err) return callback(err);
        if (result.affectedRows === 0) {
            return callback(null, { success: false, message: 'Timeout o falla del medio de pago' });
        }
        callback(null, { success: true, message: 'Reserva fallida, intente nuevamente' });
    });
};


module.exports = {
    obtenerTodosLosAsientos,
    obtenerAsientosLibres,
    obtenerAsientosOcupados,
    reservarAsiento,
    cancelarAsiento
};


