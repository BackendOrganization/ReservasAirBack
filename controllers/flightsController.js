const flightsModel = require('../models/flightsModel');
const reservationsController = require('./reservationsController'); // Import the reservations controller
const reservationsModel = require('../models/reservationsModel'); // Import the updated reservations model

exports.ingestFlight = (req, res) => {
    const flightData = req.body;
    if (!flightData || !flightData.origin || !flightData.destination || !flightData.aircraft) {
        return res.status(400).json({ error: 'Missing required flight data (id, origin, destination, aircraft)' });
    }
    // flightStatus puede venir en el body, lo pasamos al modelo
    flightsModel.insertFlight(flightData, (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Error inserting flight', details: err });
        }
        res.status(201).json({ 
            message: 'Flight and seats created successfully', 
            flightId: flightData.id,
            seatsCreated: result.seatsCreated,
            flightStatus: flightData.flightStatus || 'ONTIME'
        });
    });
};

// Obtener todos los vuelos
exports.getAllFlights = (req, res) => {
    flightsModel.getAllFlights((err, results) => {
        if (err) {
            console.error('Error fetching flights:', err);
            return res.status(500).json({ error: 'Error fetching flights', details: err });
        }
        
        // Parsear los campos JSON (origin y destination) para cada vuelo
        const flights = results.map(flight => {
            try {
                return {
                    ...flight,
                    origin: typeof flight.origin === 'string' ? JSON.parse(flight.origin) : flight.origin,
                    destination: typeof flight.destination === 'string' ? JSON.parse(flight.destination) : flight.destination
                };
            } catch (parseErr) {
                console.error('Error parsing flight data for flight ID:', flight.id, parseErr);
                return flight; // Devolver el vuelo sin parsear si hay error
            }
        });
        
        res.status(200).json({
            message: 'Flights retrieved successfully',
            count: flights.length,
            flights: flights
        });
    });
};

// Nuevo método: cancela todas las reservas de un vuelo y crea eventos de pago cancelados
// Acepta tanto externalFlightId (REST API) como aircraftModel (eventos Kafka)
exports.cancelFlightReservations = (req, res) => {
    const externalFlightId = req.params.externalFlightId;
    const aircraftModel = req.params.aircraftModel;

    // Helper function to cancel all confirmed and pending reservations for a flight
    const paymentEventsController = require('./paymentEventsController');
    const cancelAllReservations = (flightId, res) => {
        console.log(`Fetching reservations for flightId: ${flightId}`);

        reservationsModel.getAllReservationsByExternalFlightId(flightId, (err, reservations) => {
            if (err) {
                console.error('Error fetching reservations:', err);
                return res.status(500).json({ error: 'Error fetching reservations', details: err });
            }

            console.log(`Reservations fetched:`, reservations);

            const confirmedReservations = reservations.filter(r => r.status === 'PAID');
            const pendingReservations = reservations.filter(r => r.status === 'PENDING');

            console.log(`Confirmed reservations:`, confirmedReservations);
            console.log(`Pending reservations:`, pendingReservations);

            // Si no hay reservas PAID ni PENDING, solo actualizar el estado del vuelo
            if (confirmedReservations.length === 0 && pendingReservations.length === 0) {
                flightsModel.cancelReservationsByFlight(flightId, (updateErr, updateResult) => {
                    if (updateErr) {
                        console.error('Error updating flight status to CANCELLED:', updateErr);
                        return res.status(500).json({ error: 'Error updating flight status', details: updateErr });
                    }
                    return res.status(200).json({ message: 'No reservations to cancel. Flight status updated to CANCELLED.' });
                });
                return;
            }

            let totalToProcess = confirmedReservations.length + pendingReservations.length;
            let completed = 0;
            let errors = [];

            // Cancelar reservas PAID
            confirmedReservations.forEach(reservation => {
                const mockReq = { params: { reservationId: reservation.reservationId } };
                const mockRes = {
                    status: (code) => ({
                        json: (result) => {
                            if (code >= 400) {
                                errors.push({ reservationId: reservation.reservationId, error: result });
                            }
                            completed++;
                            if (completed === totalToProcess) {
                                if (errors.length > 0) {
                                    return res.status(500).json({ message: 'Some reservations failed to cancel.', errors });
                                }
                                flightsModel.cancelReservationsByFlight(flightId, (updateErr, updateResult) => {
                                    if (updateErr) {
                                        console.error('Error updating flight status to CANCELLED:', updateErr);
                                        return res.status(500).json({ error: 'Error updating flight status', details: updateErr });
                                    }
                                    res.status(200).json({ message: 'All reservations cancelled successfully. Flight status updated to CANCELLED.' });
                                });
                            }
                        }
                    })
                };
                reservationsController.cancelReservation(mockReq, mockRes);
            });

            // Marcar reservas PENDING como FAILED
            pendingReservations.forEach(reservation => {
                const mockReq = {
                    body: {
                        paymentStatus: 'FAILED',
                        reservationId: reservation.reservationId,
                        externalUserId: reservation.externalUserId,
                        amount: reservation.totalAmount || reservation.totalPrice || 0,
                        currency: reservation.currency || ''
                    }
                };
                const mockRes = {
                    status: (code) => ({
                        json: (result) => {
                            if (code >= 400) {
                                errors.push({ reservationId: reservation.reservationId, error: result });
                            }
                            completed++;
                            if (completed === totalToProcess) {
                                if (errors.length > 0) {
                                    return res.status(500).json({ message: 'Some reservations failed to cancel.', errors });
                                }
                                flightsModel.cancelReservationsByFlight(flightId, (updateErr, updateResult) => {
                                    if (updateErr) {
                                        console.error('Error updating flight status to CANCELLED:', updateErr);
                                        return res.status(500).json({ error: 'Error updating flight status', details: updateErr });
                                    }
                                    res.status(200).json({ message: 'All reservations cancelled successfully. Flight status updated to CANCELLED.' });
                                });
                            }
                        }
                    })
                };
                paymentEventsController.failPayment(mockReq, mockRes);
            });
        });
    };

    // Si viene aircraftModel (desde eventos), buscar el externalFlightId
    if (aircraftModel && !externalFlightId) {
        flightsModel.getFlightByAircraftModel(aircraftModel, (err, flight) => {
            if (err) {
                console.error('Error finding flight by aircraftModel:', err);
                return res.status(404).json({ 
                    error: 'Flight not found', 
                    aircraftModel,
                    details: err.message 
                });
            }

            // Cancelar todas las reservas confirmadas para el vuelo
            cancelAllReservations(flight.externalFlightId, res);
        });
    } else if (externalFlightId) {
        // Cancelar todas las reservas confirmadas para el vuelo
        cancelAllReservations(externalFlightId, res);
    } else {
        return res.status(400).json({ error: 'Missing externalFlightId or aircraftModel parameter' });
    }
};

// ✅ NUEVO: Cambiar estado del vuelo a DELAYED usando updateFlightFields con validación
exports.updateFlightToDelayed = (req, res) => {
    const { aircraftModel } = req.params;

    if (!aircraftModel) {
        return res.status(400).json({ 
            error: 'Missing required parameter: aircraftModel' 
        });
    }

    // Usar updateFlightFields para aprovechar la validación de reactivación
    const flightData = {
        aircraftModel: aircraftModel,
        flightId: aircraftModel,
        flightStatus: 'DELAYED'
    };

    flightsModel.updateFlightFields(flightData, (err, result) => {
        if (err) {
            console.error('Error updating flight to delayed:', err);
            return res.status(500).json({ 
                success: false,
                error: 'Error updating flight status',
                message: err.message || err
            });
        }
        res.status(200).json({
            success: true,
            message: 'Flight status updated to DELAYED',
            aircraftModel: aircraftModel,
            flightStatus: 'DELAYED',
            result
        });
    });
};

// Actualiza cualquier campo del vuelo (status, horarios, etc)
exports.updateFlightFields = (req, res) => {
    let payload = req.body;
    
    // Mapeo de status (igual que en kafkaConsumer)
    const statusMap = {
        'EN_HORA': 'ONTIME',
        'ONTIME': 'ONTIME',
        'DELAYED': 'DELAYED',
        'DEMORADO': 'DELAYED',
        'CANCELLED': 'CANCELLED',
        'CANCELADO': 'CANCELLED'
    };
    
    // Mapear campos del payload al formato del modelo (igual que kafkaConsumer)
    const flightData = {};
    
    if (payload.flightId) {
        flightData.aircraftModel = String(payload.flightId);
        flightData.flightId = String(payload.flightId);
    } else {
        return res.status(400).json({ 
            success: false,
            error: 'Missing required flightId in body' 
        });
    }
    
    if (payload.newStatus) {
        const normalizeStatus = (s) => (s && statusMap[s.toUpperCase()]) || s;
        flightData.flightStatus = normalizeStatus(payload.newStatus);
    }
    if (payload.newDepartureAt) {
        flightData.newDepartureAt = payload.newDepartureAt;
    }
    if (payload.newArrivalAt) {
        flightData.newArrivalAt = payload.newArrivalAt;
    }
    
    flightsModel.updateFlightFields(flightData, (err, result) => {
        if (err) {
            console.error('Error updating flight:', err);
            return res.status(500).json({ 
                success: false,
                error: 'Error updating flight', 
                message: err.message || err
            });
        }
        res.status(200).json({ 
            success: true,
            message: 'Flight updated successfully',
            aircraftModel: flightData.aircraftModel,
            flightStatus: flightData.flightStatus,
            result 
        });
    });
};

// Nuevo método para verificar si un vuelo está cancelado
exports.isFlightCancelled = (req, res) => {
    const { externalFlightId } = req.params;

    if (!externalFlightId) {
        return res.status(400).json({ error: 'Missing required parameter: externalFlightId' });
    }

    flightsModel.getFlightByExternalFlightId(externalFlightId, (err, flight) => {
        if (err) {
            console.error('Error fetching flight:', err);
            return res.status(500).json({ error: 'Error fetching flight', details: err.message });
        }

        if (!flight) {
            return res.status(404).json({ message: 'Flight not found' });
        }

        // Usar la misma lógica SQL que el carrito
        const db = require('../config/db');
        const sql = `SELECT * FROM flights WHERE externalFlightId = ? AND (flightStatus IS NULL OR flightStatus != 'CANCELLED') AND (CONCAT(flightDate, ' ', LPAD(JSON_UNQUOTE(JSON_EXTRACT(origin, '$.time')), 5, '0')) > NOW())`;
        db.query(sql, [externalFlightId], (err2, results) => {
            if (err2) {
                console.error('Error running SQL for isFlightCancelled:', err2);
                return res.status(500).json({ error: 'Error running SQL', details: err2.message });
            }
            // Si no hay resultados, el vuelo está cancelado o inhabilitado
            const cancelled = results.length === 0;
            res.status(200).json({ cancelled });
        });
    });
};