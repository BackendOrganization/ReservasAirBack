const db = require('../config/db');
const asientosModel = require('./asientosModel');



const generarReservaConMonto = (Id_usuario, Id_vuelo, Id_asiento, monto, callback) => {
    const Estado = 'pendiente';
    const query = `INSERT INTO reservas (Id_usuario, Id_vuelo, Id_asiento, Estado) VALUES (?, ?, ?, ?)`;
    db.query(query, [Id_usuario, Id_vuelo, Id_asiento, Estado], (err, result) => {
        if (err) return callback(err);
        asientosModel.reservarAsiento(Id_vuelo, Id_asiento, (err2, res2) => {
            if (err2) return callback(err2);
            const reservaId = result.insertId;
            const eventoQuery = `INSERT INTO eventos_payment (Id_reserva, Id_usuario, PaymentStatus, amount) VALUES (?, ?, 'PENDING', ?)`;
            db.query(eventoQuery, [reservaId, Id_usuario, monto], async (err3, resultEvento) => {
                if (err3) return callback(err3);
                // Obtener el evento recién creado
                const selectEvento = `SELECT * FROM eventos_payment WHERE Id_transaccion = ?`;
                db.query(selectEvento, [resultEvento.insertId], (err4, eventoRows) => {
                    if (err4) return callback(err4);
                    callback(null, { success: true, reservaId, asiento: res2, evento: eventoRows[0] });
                });
            });
        });
    });
};

const cancelarReserva = (Id_usuario, Id_vuelo, Id_asiento, monto, callback) => {
    // Validar que el asiento esté confirmado antes de cancelar
    const checkEstadoQuery = `SELECT Estado FROM asiento WHERE Id_vuelo = ? AND Id_asiento = ?`;
    db.query(checkEstadoQuery, [Id_vuelo, Id_asiento], (errCheck, estadoRows) => {
        if (errCheck) return callback(errCheck);
        if (!estadoRows[0] || estadoRows[0].Estado === 'cancelado' || estadoRows[0].Estado !== 'reservado') {
            return callback(null, {
                success: false,
                message: 'El asiento no estaba confirmado, no existe o ya está cancelado.'
            });
        }
        // Si está confirmado, proceder con la cancelación
        const Estado = 'cancelado';
        const query = `INSERT INTO reservas (Id_usuario, Id_vuelo, Id_asiento, Estado) VALUES (?, ?, ?, ?)`;
        db.query(query, [Id_usuario, Id_vuelo, Id_asiento, Estado], (err, result) => {
            if (err) return callback(err);
            asientosModel.cancelarAsiento(Id_vuelo, Id_asiento, (err2, res2) => {
                if (err2) return callback(err2);
                const reservaId = result.insertId;
                const eventoQuery = `INSERT INTO eventos_payment (Id_reserva, Id_usuario, PaymentStatus, amount) VALUES (?, ?, 'CANCELLED', ?)`;
                db.query(eventoQuery, [reservaId, Id_usuario, monto], (err3, resultEvento) => {
                    if (err3) return callback(err3);
                    // Obtener el evento recién creado
                    const selectEvento = `SELECT * FROM eventos_payment WHERE Id_transaccion = ?`;
                    db.query(selectEvento, [resultEvento.insertId], (err4, eventoRows) => {
                        if (err4) return callback(err4);
                        callback(null, { success: true, reservaId, asiento: res2, evento: eventoRows[0] });
                    });
                });
            });
        });
    });
};


module.exports = {
    generarReservaConMonto,
    cancelarReserva
};
