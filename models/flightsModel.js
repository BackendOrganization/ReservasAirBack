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
    // Verifica si el externalFlightId ya existe
    const checkSql = 'SELECT COUNT(*) AS count FROM flights WHERE externalFlightId = ?';
    db.query(checkSql, [flightData.id], (err, results) => {
        if (err) return callback(err);
        if (results[0].count > 0) {
            return callback({ message: 'externalFlightId already exists' });
        }

        // Verificar si el tipo de aeronave es soportado
        if (!aircraftConfig[flightData.aircraft]) {
            return callback({ 
                message: `Aircraft type ${flightData.aircraft} not supported. Supported types: ${Object.keys(aircraftConfig).join(', ')}` 
            });
        }

        // ✅ CALCULAR ASIENTOS LIBRES SEGÚN EL TIPO DE AERONAVE
        const totalSeats = calculateTotalSeats(flightData.aircraft);

        const sql = `
            INSERT INTO flights (
                externalFlightId,
                aircraft,
                aircraftModel,
                origin,
                destination,
                flightDate,
                duration,
                freeSeats,
                occupiedSeats
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        db.query(
            sql,
            [
                flightData.id,
                flightData.aircraft,
                flightData.aircraftModel,
                JSON.stringify(flightData.origin),
                JSON.stringify(flightData.destination),
                flightData.flightDate,
                flightData.duration,
                totalSeats, // ✅ A330=288, E190=112, B737=180
                0 // occupiedSeats siempre inicia en 0
            ],
            (err, result) => {
                if (err) return callback(err);
                
                // Después de insertar el vuelo, generar los asientos
                generateSeats(flightData.id, flightData.aircraft, (seatsErr, seatsResult) => {
                    if (seatsErr) {
                        console.error('Error creating seats:', seatsErr);
                        // Si falla la creación de asientos, eliminar el vuelo insertado
                        const deleteSql = 'DELETE FROM flights WHERE externalFlightId = ?';
                        db.query(deleteSql, [flightData.id], () => {
                            callback(seatsErr);
                        });
                        return;
                    }
                    
                    // ✅ ACTUALIZAR freeSeats CON LOS ASIENTOS REALMENTE CREADOS
                    const updateSql = 'UPDATE flights SET freeSeats = ? WHERE externalFlightId = ?';
                    db.query(updateSql, [seatsResult.seatsCreated, flightData.id], (updateErr) => {
                        if (updateErr) {
                            console.error('Error updating freeSeats:', updateErr);
                        }
                        
                        // Retornar resultado exitoso con información de asientos creados
                        callback(null, {
                            ...result,
                            seatsCreated: seatsResult.seatsCreated,
                            flightId: flightData.id,
                            totalSeats: totalSeats
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
            const updateSql = `UPDATE reservations SET status = 'CANCELLED' WHERE reservationId IN (?)`;
            db.query(updateSql, [reservationIds], (err2) => {
                if (err2) return callback(err2);
                
                const events = [];
                let pending = reservations.length;
                reservations.forEach(r => {
                    // ✅ CAMBIO 2: 'REFUND' → 'pending_refund'
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
    const sql = 'SELECT * FROM flights';
    db.query(sql, callback);
};

module.exports = { insertFlight, cancelReservationsByFlight, getAllFlights, calculateTotalSeats };