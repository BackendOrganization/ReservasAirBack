// Cambiar el asiento de una reserva existente y registrar evento de pago/refund
const cambiarAsientoReserva = (Id_reserva, Id_usuario, Id_asiento_actual, Id_asiento_nuevo, callback) => {
    // 1. Obtener precios y estados de ambos asientos
    const checkQuery = `SELECT Id_asiento, Estado, Precio_asiento FROM asiento WHERE Id_asiento IN (?, ?)`;
    db.query(checkQuery, [Id_asiento_actual, Id_asiento_nuevo], (err, rows) => {
        if (err) return callback(err);
        console.log('DEBUG cambiarAsientoReserva rows:', rows);
        console.log('DEBUG Id_asiento_actual:', Id_asiento_actual, 'Id_asiento_nuevo:', Id_asiento_nuevo);
        // Forzar a BigInt para comparar correctamente
        const idActualNum = typeof Id_asiento_actual === 'bigint' ? Id_asiento_actual : BigInt(Id_asiento_actual);
        const idNuevoNum = typeof Id_asiento_nuevo === 'bigint' ? Id_asiento_nuevo : BigInt(Id_asiento_nuevo);
        let actual = rows.find(r => BigInt(r.Id_asiento) === idActualNum);
        let nuevo = rows.find(r => BigInt(r.Id_asiento) === idNuevoNum);
        console.log('DEBUG asiento actual:', actual);
        console.log('DEBUG asiento nuevo:', nuevo);
        if (!actual || !nuevo) {
            return callback(null, { success: false, message: 'Uno de los asientos no existe.' });
        }
        if (actual.Estado !== 'confirmado') {
            return callback(null, { success: false, message: 'El asiento actual no está en estado confirmado.' });
        }
        if (nuevo.Estado !== 'disponible') {
            return callback(null, { success: false, message: 'El asiento nuevo no está disponible.' });
        }
        // 2. Calcular diferencia de precio
        const diferencia = nuevo.Precio_asiento - actual.Precio_asiento;
        const paymentStatus = diferencia < 0 ? 'REFUND' : 'PENDING';
        // 3. Actualizar estados de los asientos
        const updateActual = `UPDATE asiento SET Estado = 'disponible' WHERE Id_asiento = ?`;
        const updateNuevo = `UPDATE asiento SET Estado = 'confirmado' WHERE Id_asiento = ?`;
        db.query(updateActual, [Id_asiento_actual], (err1) => {
            if (err1) return callback(err1);
            db.query(updateNuevo, [Id_asiento_nuevo], (err2) => {
                if (err2) return callback(err2);
                // 4. Actualizar la reserva con el nuevo asiento
                const updateReserva = `UPDATE reservas SET Id_asiento = ? WHERE Id_reserva = ?`;
                db.query(updateReserva, [Id_asiento_nuevo, Id_reserva], (err3, resultReserva) => {
                    if (err3) return callback(err3);
                    // 5. Solo crear evento si la diferencia es distinta de 0
                    if (diferencia !== 0) {
                        const eventoQuery = `INSERT INTO eventos_payment (Id_reserva, Id_usuario, PaymentStatus, amount) VALUES (?, ?, ?, ?)`;
                        db.query(eventoQuery, [Id_reserva, Id_usuario, paymentStatus, Math.abs(diferencia)], (err4, resultEvento) => {
                            if (err4) return callback(err4);
                            // Obtener el evento recién creado
                            const selectEvento = `SELECT * FROM eventos_payment WHERE Id_transaccion = ?`;
                            db.query(selectEvento, [resultEvento.insertId], (err5, eventoRows) => {
                                if (err5) return callback(err5);
                                callback(null, { success: true, reservaId: Id_reserva, evento: eventoRows[0], diferencia });
                            });
                        });
                    } else {
                        // Si la diferencia es 0, no crear evento
                        callback(null, { success: true, reservaId: Id_reserva, evento: null, diferencia });
                    }
                });
            });
        });
    });
};
const db = require('../config/db');
const asientosModel = require('./asientosModel');



const generarReserva = (Id_usuario, Id_vuelo, Id_asiento, callback) => {
    const Estado = 'pendiente';
    const query = `INSERT INTO reservas (Id_usuario, Id_vuelo, Id_asiento, Estado) VALUES (?, ?, ?, ?)`;
    db.query(query, [Id_usuario, Id_vuelo, Id_asiento, Estado], (err, result) => {
        if (err) return callback(err);
        asientosModel.reservarAsiento(Id_vuelo, Id_asiento, (err2, res2) => {
            if (err2) return callback(err2);
            // Lógica para evento pending_payment
            const reservaId = result.insertId;
            // Suponiendo que el monto se recibe como parámetro o se calcula aquí
            const monto = res2 && res2.monto ? res2.monto : 0; // Ajusta según tu lógica
            const eventoQuery = `INSERT INTO eventos_payment (Id_reserva, Id_usuario, PaymentStatus, amount) VALUES (?, ?, 'PENDING', ?)`;
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
};

const cancelarReserva = (Id_reserva, Id_vuelo, Id_asiento, callback) => {
    // Actualiza el estado de la reserva a 'cancelado'
    const query = `UPDATE reservas SET Estado = 'cancelado' WHERE Id_reserva = ?`;
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
    cancelarReserva,
    cambiarAsientoReserva
};
