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
                db.query(selectEvento, [resultEvento.insertId], async (err4, eventoRows) => {
                    if (err4) return callback(err4);
                    // Publicar el evento en RabbitMQ
                    try {
                        const { publishPaymentEvent } = require('../utils/rabbitmq');
                        await publishPaymentEvent({
                            Id_reserva: reservaId,
                            Id_usuario,
                            PaymentStatus: 'PENDING',
                            amount: monto
                        });
                    } catch (errPub) {
                        console.error('Error publicando evento en RabbitMQ:', errPub);
                    }
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
    generarReservaConMonto,
    cancelarReserva
};
