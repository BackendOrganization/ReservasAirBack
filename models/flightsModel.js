const db = require('../config/db');

// Configuración de asientos por tipo de aeronave
const aircraftConfig = {
    'B737': {
        blocks: ['A', 'B', 'C', 'D', 'E', 'F'],
        seatsPerRow: 6,
        categories: [
            { name: 'FIRST', rows: 4, price: 750 },
            { name: 'BUSINESS', rows: 4, price: 600 },
            { name: 'ECONOMY', rows: 22, price: 450 }
        ]
    },
    'E190': {
        blocks: ['A', 'B', 'C', 'D'],
        seatsPerRow: 4,
        categories: [
            { name: 'FIRST', rows: 2, price: 700 },
            { name: 'BUSINESS', rows: 3, price: 550 },
            { name: 'ECONOMY', rows: 23, price: 400 }
        ]
    },
    'A330': {
        blocks: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
        seatsPerRow: 8,
        categories: [
            { name: 'FIRST', rows: 3, price: 1100 },
            { name: 'BUSINESS', rows: 9, price: 800 },
            { name: 'ECONOMY', rows: 24, price: 520 }
        ]
    }
};

// ✅ FUNCIÓN PARA CALCULAR TOTAL DE ASIENTOS POR AERONAVE
const calculateTotalSeats = (aircraft) => {
    const config = aircraftConfig[aircraft];
    if (!config) return 0;
    
    return config.categories.reduce((total, category) => {
        return total + (category.rows * config.seatsPerRow);
    }, 0);
};

// Función para generar asientos
const generateSeats = (externalFlightId, aircraft, callback) => {
    const config = aircraftConfig[aircraft];
    if (!config) {
        return callback(new Error(`Aircraft type ${aircraft} not supported`));
    }

    const seats = [];
    let seatId = 1;
    let currentRow = 1;

    // Generar asientos por categoría
    config.categories.forEach(category => {
        for (let row = 0; row < category.rows; row++) {
            for (let blockIndex = 0; blockIndex < config.blocks.length; blockIndex++) {
                const seatNumber = `${currentRow}${config.blocks[blockIndex]}`;
                seats.push([
                    seatId,
                    externalFlightId,
                    seatNumber,
                    category.name,
                    'AVAILABLE',
                    category.price
                ]);
                seatId++;
            }
            currentRow++;
        }
    });

    // Insertar todos los asientos en la base de datos
    if (seats.length === 0) {
        return callback(null, { seatsCreated: 0 });
    }

    const insertSeatsQuery = `
        INSERT INTO seats (seatId, externalFlightId, seatNumber, category, status, price) 
        VALUES ?
    `;

    db.query(insertSeatsQuery, [seats], (err, result) => {
        if (err) return callback(err);
        callback(null, { seatsCreated: seats.length });
    });
};

const insertFlight = (flightData, callback) => {
    // Verificar si el tipo de aeronave es soportado
    if (!aircraftConfig[flightData.aircraft]) {
        return callback({
            message: `Aircraft type ${flightData.aircraft} not supported. Supported types: ${Object.keys(aircraftConfig).join(', ')}`
        });
    }

    // Verificar que aircraftModel (flightId del evento) no esté duplicado
    const checkSql = 'SELECT COUNT(*) AS count FROM flights WHERE aircraftModel = ?';
    db.query(checkSql, [flightData.aircraftModel], (err, results) => {
        if (err) return callback(err);
        if (results[0].count > 0) {
            return callback({ message: 'Ya existe un vuelo con ese aircraftModel (flightId)' });
        }

        // ✅ Calcular asientos totales según el tipo de aeronave
        const totalSeats = calculateTotalSeats(flightData.aircraft);

        const sql = `
            INSERT INTO flights (
                aircraft,
                aircraftModel,
                origin,
                destination,
                flightDate,
                duration,
                freeSeats,
                occupiedSeats,
                flightStatus
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(
            sql,
            [
                flightData.aircraft,
                flightData.aircraftModel, // Guardar flightId del evento en aircraftModel
                JSON.stringify(flightData.origin),
                JSON.stringify(flightData.destination),
                flightData.flightDate,
                flightData.duration,
                totalSeats, // total de asientos
                0, // occupiedSeats inicia en 0
                'ONTIME' // estado por defecto
            ],
            (err, result) => {
                if (err) return callback(err);

                // ✅ Obtener el ID autogenerado por MySQL
                const flightId = result.insertId;

                // Crear los asientos asociados
                generateSeats(flightId, flightData.aircraft, (seatsErr, seatsResult) => {
                    if (seatsErr) {
                        console.error('Error creating seats:', seatsErr);
                        // Si falla la creación de asientos, eliminar el vuelo insertado
                        const deleteSql = 'DELETE FROM flights WHERE id = ?';
                        db.query(deleteSql, [flightId], () => {
                            callback(seatsErr);
                        });
                        return;
                    }

                    // ✅ Actualizar freeSeats con los asientos realmente creados usando aircraftModel
                    const updateSql = 'UPDATE flights SET freeSeats = ? WHERE aircraftModel = ?';
                    db.query(updateSql, [seatsResult.seatsCreated, flightData.aircraftModel], (updateErr) => {
                        if (updateErr) {
                            console.error('Error updating freeSeats:', updateErr);
                        }
                        // Retornar resultado exitoso con info completa
                        callback(null, {
                            flightId,
                            seatsCreated: seatsResult.seatsCreated,
                            totalSeats,
                            flightStatus: 'ONTIME'
                        });
                    });
                });
            }
        );
    });
};

// Nuevo método: cancela todas las reservas de un vuelo y crea eventos de pago cancelados
const cancelReservationsByFlight = (externalFlightId, callback) => {
    // ✅ CAMBIO 1: Actualizar estado del vuelo a 'cancelled'
    const updateFlightSql = 'UPDATE flights SET flightStatus = ? WHERE externalFlightId = ?';
    db.query(updateFlightSql, ['cancelled', externalFlightId], (flightErr) => {
        if (flightErr) return callback(flightErr);

        const selectSql = `
            SELECT r.reservationId, r.externalUserId, r.seatId, r.totalPrice
            FROM reservations r
            WHERE r.externalFlightId = ? AND r.status != 'CANCELLED'
        `;
        db.query(selectSql, [externalFlightId], (err, reservations) => {
            if (err) return callback(err);
            if (reservations.length === 0) return callback(null, { updated: 0, events: [] });
            
            const reservationIds = reservations.map(r => r.reservationId);
            // CAMBIO: ahora el estado es PENDING_REFUND
            const updateSql = `UPDATE reservations SET status = 'PENDING_REFUND' WHERE reservationId IN (?)`;
            db.query(updateSql, [reservationIds], (err2) => {
                if (err2) return callback(err2);

                // Liberar asientos de reservas que estaban en PENDING
                const pendingReservations = reservations.filter(r => r.status === 'PENDING');
                if (pendingReservations.length > 0) {
                    pendingReservations.forEach(r => {
                        const seatIds = Array.isArray(r.seatId) ? r.seatId : (typeof r.seatId === 'string' ? JSON.parse(r.seatId) : []);
                        if (seatIds.length > 0) {
                            const placeholders = seatIds.map(() => '?').join(',');
                            const updateSeatsSql = `UPDATE seats SET status = 'AVAILABLE' WHERE seatId IN (${placeholders}) AND externalFlightId = ?`;
                            db.query(updateSeatsSql, [...seatIds, externalFlightId], () => {});
                        }
                    });
                }

                const events = [];
                let pending = reservations.length;
                reservations.forEach(r => {
                    // El evento de pago sigue igual
                    const eventSql = `INSERT INTO paymentEvents (reservationId, externalUserId, paymentStatus, amount) VALUES (?, ?, 'PENDING_REFUND', ?)`;
                    db.query(eventSql, [r.reservationId, r.externalUserId, r.totalPrice], (err3, result) => {
                        if (err3) return callback(err3);
                        events.push({ reservationId: r.reservationId, eventId: result.insertId });
                        pending--;
                        if (pending === 0) callback(null, { updated: reservations.length, events });
                    });
                });
            });
        });
    });
};

// Obtener todos los vuelos
const getAllFlights = (callback) => {
    const sql = 'SELECT * FROM flights where flightStatus!= "CANCELLED"';
    db.query(sql, callback);
};

// ✅ NUEVO: Cambiar estado del vuelo a DELAYED
const updateFlightToDelayed = (externalFlightId, callback) => {
    const sql = 'UPDATE flights SET flightStatus = ? WHERE aircraftModel = ?';
    db.query(sql, ['DELAYED', externalFlightId], (err, result) => {
        if (err) return callback(err);
        if (result.affectedRows === 0) {
            return callback({ message: 'Flight not found' });
        }
        callback(null, {
            success: true,
            message: 'Flight status updated to DELAYED',
            aircraftModel: externalFlightId,
            flightStatus: 'DELAYED',
            affectedRows: result.affectedRows
        });
    });
};

// Actualiza cualquier campo del vuelo según el body recibido (flexible para eventos)
// flightData debe incluir flightId y los campos a actualizar
const updateFlightFields = (flightData, callback) => {
    // Usar aircraftModel como identificador principal
    // Mapear flightId a aircraftModel si viene en el objeto
    let aircraftModel = flightData.aircraftModel;
    if (!aircraftModel && flightData.flightId) {
        aircraftModel = String(flightData.flightId);
    }
    // Copia de los campos a actualizar
    const fieldsToUpdate = { ...flightData };
    // Eliminar identificadores del objeto de actualización
    delete fieldsToUpdate.aircraftModel;
    delete fieldsToUpdate.flightId;
    if (!aircraftModel || Object.keys(fieldsToUpdate).length === 0) {
        return callback(new Error('aircraftModel y al menos un campo a actualizar son requeridos'));
    }
    // Mapear nombres del schema a columnas reales si es necesario
    const fieldMap = {
        newStatus: 'flightStatus'
    };
    let setClauses = [];
    let values = [];

    // Si hay cambios de horario, obtener los JSON actuales y modificarlos
    const updateJsonFields = async (cb) => {
        let needOrigin = fieldsToUpdate.newDepartureAt !== undefined;
        let needDestination = fieldsToUpdate.newArrivalAt !== undefined;
        if (!needOrigin && !needDestination) return cb();
        db.query('SELECT origin, destination, flightDate FROM flights WHERE aircraftModel = ?', [aircraftModel], (err, rows) => {
            if (err) return callback(err);
            if (!rows.length) return callback(new Error('Vuelo no encontrado para actualizar horarios'));
            let origin = rows[0].origin;
            let destination = rows[0].destination;
            if (typeof origin === 'string') {
                try { origin = JSON.parse(origin); } catch (e) { origin = {}; }
            }
            if (typeof destination === 'string') {
                try { destination = JSON.parse(destination); } catch (e) { destination = {}; }
            }
            // Procesar newDepartureAt
            if (needOrigin) {
                const depDate = new Date(fieldsToUpdate.newDepartureAt);
                if (!isNaN(depDate)) {
                    // Actualizar flightDate (columna) con la fecha (YYYY-MM-DD)
                    const yyyy = depDate.getUTCFullYear();
                    const mm = String(depDate.getUTCMonth() + 1).padStart(2, '0');
                    const dd = String(depDate.getUTCDate()).padStart(2, '0');
                    setClauses.push('flightDate = ?');
                    values.push(`${yyyy}-${mm}-${dd}`);
                    // Actualizar origin.time con la hora (HH:mm)
                    const hh = String(depDate.getUTCHours()).padStart(2, '0');
                    const min = String(depDate.getUTCMinutes()).padStart(2, '0');
                    origin.time = `${hh}:${min}`;
                    setClauses.push('origin = ?');
                    values.push(JSON.stringify(origin));
                }
            }
            // Procesar newArrivalAt
            if (needDestination) {
                const arrDate = new Date(fieldsToUpdate.newArrivalAt);
                if (!isNaN(arrDate)) {
                    // Actualizar flightDate (columna) con la fecha de llegada (YYYY-MM-DD)
                    const yyyy = arrDate.getUTCFullYear();
                    const mm = String(arrDate.getUTCMonth() + 1).padStart(2, '0');
                    const dd = String(arrDate.getUTCDate()).padStart(2, '0');
                    setClauses.push('flightDate = ?');
                    values.push(`${yyyy}-${mm}-${dd}`);
                    // Actualizar destination.time con la hora (HH:mm)
                    const hh = String(arrDate.getUTCHours()).padStart(2, '0');
                    const min = String(arrDate.getUTCMinutes()).padStart(2, '0');
                    destination.time = `${hh}:${min}`;
                    setClauses.push('destination = ?');
                    values.push(JSON.stringify(destination));
                }
            }
            // Eliminar estos campos del update plano
            delete fieldsToUpdate.newDepartureAt;
            delete fieldsToUpdate.newArrivalAt;
            cb();
        });
    };

    updateJsonFields(() => {
        // Descartar flightId si está presente
        if ('flightId' in fieldsToUpdate) {
            delete fieldsToUpdate.flightId;
        }
        // Procesar el resto de los campos (status, etc)
        for (const [key, value] of Object.entries(fieldsToUpdate)) {
            const column = fieldMap[key] || key;
            setClauses.push(`${column} = ?`);
            values.push(value);
        }
        if (setClauses.length === 0) return callback(null, { message: 'No hay campos para actualizar' });
        const sql = `UPDATE flights SET ${setClauses.join(', ')} WHERE aircraftModel = ?`;
        values.push(aircraftModel);
        db.query(sql, values, (err, result) => {
            if (err) return callback(err);
            callback(null, result);
        });
    });
};

module.exports = { 
    insertFlight, 
    cancelReservationsByFlight, 
    getAllFlights, 
    calculateTotalSeats,
    updateFlightToDelayed, // ✅ NUEVO
    updateFlightFields
};