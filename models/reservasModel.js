const db = require('../config/db');
const asientosModel = require('./asientosModel');



const generarReserva = (Id_usuario, Id_vuelo, Id_asiento, callback) => {
    const Estado = 'pendiente';
    const query = `INSERT INTO reserva (Id_usuario, Id_vuelo, Id_asiento, Estado) VALUES (?, ?, ?, ?)`;
    db.query(query, [Id_usuario, Id_vuelo, Id_asiento, Estado], (err, result) => {
        if (err) return callback(err);
        asientosModel.reservarAsiento(Id_vuelo, Id_asiento, (err2, res2) => {
            if (err2) return callback(err2);
            callback(null, { success: true, reservaId: result.insertId, asiento: res2 });
        });
    });
};

const cancelarReserva = (Id_reserva, Id_vuelo, Id_asiento, callback) => {
    // Actualiza el estado de la reserva a 'cancelado'
    const query = `UPDATE reserva SET Estado = 'cancelado' WHERE Id_reserva = ?`;
    db.query(query, [Id_reserva], (err, result) => {
        if (err) return callback(err);
        // Si la reserva se canceló, liberar el asiento
        asientosModel.cancelarAsiento(Id_vuelo, Id_asiento, (err2, res2) => {
            if (err2) return callback(err2);
            callback(null, { success: true, reservaId: Id_reserva, asiento: res2 });
        });
    });
};


module.exports = {
    generarReserva,
    cancelarReserva
};
