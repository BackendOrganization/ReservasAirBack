const asientosModel = require('../models/asientosModel');

// Obtener todos los asientos
exports.getTodosLosAsientos = (req, res) => {
    const idVuelo = req.params.idVuelo || req.query.idVuelo;
    if (!idVuelo) {
        return res.status(400).json({ error: 'Debe proporcionar el id de vuelo' });
    }


    asientosModel.obtenerTodosLosAsientos(idVuelo, (err, asientos) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error al obtener los asientos' });
        }
        res.json(asientos);
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