const db = require('../config/db');

const addFlightToCart = (externalUserId, flightId, callback) => {
    // Primero verificamos si el usuario ya tiene un carrito
    const checkUserSql = 'SELECT flights FROM flight_carts WHERE externalUserId = ?';
    
    db.query(checkUserSql, [externalUserId], (err, results) => {
        if (err) {
            return callback(err);
        }

        if (results.length > 0) {
            let currentFlights = results[0].flights || [];
            
            // Si flights viene como string JSON, lo parseamos
            if (typeof currentFlights === 'string') {
                try {
                    currentFlights = JSON.parse(currentFlights);
                } catch (parseErr) {
                    currentFlights = [];
                }
            }

            // Verificamos si el vuelo ya está en el carrito
            if (!currentFlights.includes(flightId)) {
                currentFlights.push(flightId);
                
                const updateSql = 'UPDATE flight_carts SET flights = ? WHERE externalUserId = ?';
                db.query(updateSql, [JSON.stringify(currentFlights), externalUserId], (updateErr, updateResult) => {
                    if (updateErr) {
                        return callback(updateErr);
                    }
                    callback(null, {
                        success: true,
                        message: 'Flight added to existing cart',
                        externalUserId: externalUserId,
                        flights: currentFlights,
                        action: 'updated'
                    });
                });
            } else {
                // El vuelo ya está en el carrito
                callback(null, {
                    success: false,
                    message: 'Flight already in cart',
                    externalUserId: externalUserId,
                    flights: currentFlights
                });
            }
        } else {
            // El usuario no tiene carrito, creamos uno nuevo
            const newFlights = [flightId];
            const insertSql = 'INSERT INTO flight_carts (externalUserId, flights) VALUES (?, ?)';
            
            db.query(insertSql, [externalUserId, JSON.stringify(newFlights)], (insertErr, insertResult) => {
                if (insertErr) {
                    return callback(insertErr);
                }
                callback(null, {
                    success: true,
                    message: 'New cart created and flight added',
                    externalUserId: externalUserId,
                    flights: newFlights,
                    action: 'created'
                });
            });
        }
    });
};

const removeFlightFromCart = (externalUserId, flightId, callback) => {
    // Primero verificamos si el usuario tiene un carrito
    const checkUserSql = 'SELECT flights FROM flight_carts WHERE externalUserId = ?';
    
    db.query(checkUserSql, [externalUserId], (err, results) => {
        if (err) {
            return callback(err);
        }

        if (results.length === 0) {
            // El usuario no tiene carrito
            return callback(null, {
                success: false,
                message: `User with ID ${externalUserId} does not have a cart`,
                externalUserId: externalUserId,
                flights: []
            });
        }

        // El usuario tiene carrito, obtenemos los vuelos actuales
        let currentFlights = results[0].flights || [];
        
        // Si flights viene como string JSON, lo parseamos
        if (typeof currentFlights === 'string') {
            try {
                currentFlights = JSON.parse(currentFlights);
            } catch (parseErr) {
                currentFlights = [];
            }
        }

        // Verificamos si el vuelo está en el carrito
        if (!currentFlights.includes(flightId)) {
            return callback(null, {
                success: false,
                message: `Flight ${flightId} is not in the cart for user ${externalUserId}`,
                externalUserId: externalUserId,
                flights: currentFlights
            });
        }

        // Removemos el vuelo del array
        const updatedFlights = currentFlights.filter(flight => flight !== flightId);
        
        // Si el carrito queda vacío, eliminamos la fila completa
        if (updatedFlights.length === 0) {
            const deleteSql = 'DELETE FROM flight_carts WHERE externalUserId = ?';
            db.query(deleteSql, [externalUserId], (deleteErr) => {
                if (deleteErr) {
                    return callback(deleteErr);
                }
                callback(null, {
                    success: true,
                    message: `Flight ${flightId} removed from cart. Cart is now empty and has been deleted.`,
                    externalUserId: externalUserId,
                    flights: [],
                    action: 'cart_deleted'
                });
            });
        } else {
            // Actualizamos el carrito con los vuelos restantes
            const updateSql = 'UPDATE flight_carts SET flights = ? WHERE externalUserId = ?';
            db.query(updateSql, [JSON.stringify(updatedFlights), externalUserId], (updateErr) => {
                if (updateErr) {
                    return callback(updateErr);
                }
                callback(null, {
                    success: true,
                    message: `Flight ${flightId} removed from cart successfully`,
                    externalUserId: externalUserId,
                    flights: updatedFlights,
                    action: 'flight_removed'
                });
            });
        }
    });
};

const getCartByUserId = (externalUserId, callback) => {
    // Primero obtenemos el carrito del usuario
    const getCartSql = 'SELECT flights FROM flight_carts WHERE externalUserId = ?';
    
    db.query(getCartSql, [externalUserId], (err, cartResults) => {
        if (err) {
            return callback(err);
        }
        
        // Si no tiene carrito o está vacío
        if (cartResults.length === 0 || !cartResults[0].flights) {
            return callback(null, {
                success: true,
                message: `User ${externalUserId} does not have a cart yet`,
                externalUserId: externalUserId,
                flights: [],
                flightCount: 0
            });
        }
        
        // Parsear el JSON de flights
        let flightIds = [];
        try {
            flightIds = typeof cartResults[0].flights === 'string' 
                ? JSON.parse(cartResults[0].flights) 
                : cartResults[0].flights;
        } catch (parseErr) {
            console.error('Error parsing flights JSON:', parseErr);
            flightIds = [];
        }
        
        // Si el array está vacío
        if (!Array.isArray(flightIds) || flightIds.length === 0) {
            return callback(null, {
                success: true,
                message: `User ${externalUserId} does not have a cart yet`,
                externalUserId: externalUserId,
                flights: [],
                flightCount: 0
            });
        }
        
        // Obtener los datos completos de los vuelos
        const placeholders = flightIds.map(() => '?').join(',');
        const getFlightsSql = `
            SELECT * 
            FROM flights 
            WHERE externalFlightId IN (${placeholders})
            AND (flightStatus IS NULL OR flightStatus != 'CANCELLED')
        `;
        
        db.query(getFlightsSql, flightIds, (err2, flightResults) => {
            if (err2) {
                return callback(err2);
            }
            
            callback(null, {
                success: true,
                message: 'Cart retrieved successfully',
                externalUserId: externalUserId,
                flights: flightResults,
                flightCount: flightResults.length
            });
        });
    });
};

module.exports = {
    addFlightToCart,
    removeFlightFromCart,
    getCartByUserId
};
