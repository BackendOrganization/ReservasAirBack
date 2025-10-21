
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
exports.cancelFlightReservations = (req, res) => {
    const externalFlightId = req.params.externalFlightId;
    if (!externalFlightId) {
        return res.status(400).json({ error: 'Missing externalFlightId' });
    }
    flightsModel.cancelReservationsByFlight(externalFlightId, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error cancelling reservations', details: err });
        }
        res.json({ message: 'Reservations cancelled', ...result });
    });
};

// ✅ NUEVO: Cambiar estado del vuelo a DELAYED
exports.updateFlightToDelayed = (req, res) => {
    const { externalFlightId } = req.params;
    
    if (!externalFlightId) {
        return res.status(400).json({ 
            error: 'Missing required parameter: externalFlightId' 
        });
    }

    flightsModel.updateFlightToDelayed(externalFlightId, (err, result) => {
        if (err) {
            console.error('Error updating flight to delayed:', err);
            
            if (err.message === 'Flight not found') {
                return res.status(404).json({ 
                    error: 'Flight not found',
                    flightId: externalFlightId
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
    if (!flightData || !flightData.flightId) {
        return res.status(400).json({ error: 'Missing required flightId' });
    }
    flightsModel.updateFlightFields(flightData, (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Error updating flight', details: err });
        }
        res.status(200).json({ message: 'Flight updated successfully', result });
    });
};