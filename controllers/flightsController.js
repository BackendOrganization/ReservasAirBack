
const flightsModel = require('../models/flightsModel');

exports.ingestFlight = (req, res) => {
    const flightData = req.body;
    if (!flightData || !flightData.origin || !flightData.destination || !flightData.aircraft) {
        return res.status(400).json({ error: 'Missing required flight data (id, origin, destination, aircraft)' });
    }
    
    flightsModel.insertFlight(flightData, (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Error inserting flight', details: err });
        }
        res.status(201).json({ 
            message: 'Flight and seats created successfully', 
            flightId: flightData.id,
            seatsCreated: result.seatsCreated
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
            
            // Llamar al modelo con el externalFlightId obtenido
            flightsModel.cancelReservationsByFlight(flight.externalFlightId, (err, result) => {
                if (err) {
                    console.error('Error cancelling reservations:', err);
                    return res.status(500).json({ error: 'Error cancelling reservations', details: err });
                }
                res.json({ message: 'Reservations cancelled', aircraftModel, ...result });
            });
        });
    } else if (externalFlightId) {
        // Llamada directa con externalFlightId (REST API)
        flightsModel.cancelReservationsByFlight(externalFlightId, (err, result) => {
            if (err) {
                console.error('Error cancelling reservations:', err);
                return res.status(500).json({ error: 'Error cancelling reservations', details: err });
            }
            res.json({ message: 'Reservations cancelled', ...result });
        });
    } else {
        return res.status(400).json({ error: 'Missing externalFlightId or aircraftModel parameter' });
    }
};

// ✅ NUEVO: Cambiar estado del vuelo a DELAYED
exports.updateFlightToDelayed = (req, res) => {
    const { aircraftModel } = req.params;

    if (!aircraftModel) {
        return res.status(400).json({ 
            error: 'Missing required parameter: aircraftModel' 
        });
    }

    flightsModel.updateFlightToDelayed(aircraftModel, (err, result) => {
        if (err) {
            console.error('Error updating flight to delayed:', err);
            if (err.message === 'Flight not found') {
                return res.status(404).json({ 
                    error: 'Flight not found',
                    aircraftModel
                });
            }
            return res.status(500).json({ 
                error: 'Error updating flight status' 
            });
        }
        res.status(200).json(result);
    });
};

// Actualiza cualquier campo del vuelo (status, horarios, etc)
exports.updateFlightFields = (req, res) => {
    const flightData = req.body;
    if (!flightData || !flightData.aircraftModel) {
        return res.status(400).json({ error: 'Missing required aircraftModel' });
    }
    // Usar aircraftModel como identificador
    flightData.flightId = flightData.aircraftModel;
    flightsModel.updateFlightFields(flightData, (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Error updating flight', details: err });
        }
        res.status(200).json({ message: 'Flight updated successfully', result });
    });
};