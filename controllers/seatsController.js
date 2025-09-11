const seatsModel = require('../models/seatsModel');

// Get all seats
exports.getAllSeats = (req, res) => {
    const flightId = req.params.flightId || req.query.flightId;
    if (!flightId) {
        return res.status(400).json({ error: 'Missing flightId' });
    }
    seatsModel.getAllSeats(flightId, (err, seats) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error getting seats' });
        }
        res.json(seats);
    });
};


// Obtener asientos libres
exports.getAsientosLibres = (req, res) => {
    const idVuelo = req.params.idVuelo || req.query.idVuelo;
    if (!idVuelo) {
        return res.status(400).json({ error: 'Debe proporcionar el id de vuelo' });
    }

    asientosModel.obtenerAsientosLibres(idVuelo, (err, asientos) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error al obtener los asientos libres' });
        }
        res.json(asientos);
    });
};


// Obtener asientos ocupados
exports.getAsientosOcupados = (req, res) => {
    const idVuelo = req.params.idVuelo || req.query.idVuelo;
    if (!idVuelo) {
        return res.status(400).json({ error: 'Debe proporcionar el id de vuelo' });
    }

    asientosModel.obtenerAsientosOcupados(idVuelo, (err, asientos) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error al obtener los asientos ocupados' });
        }
        res.json(asientos);
    });
};