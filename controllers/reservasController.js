
const reservasModel = require('../models/reservasModel');

// Reservar un asiento disponible de un vuelo específico
exports.reservarAsiento = (req, res) => {
	const idVuelo = req.params.idVuelo;
	// Permitir tanto 'idAsiento' como 'Id_asiento' en el body
	const idAsiento = req.body.idAsiento || req.body.Id_asiento;
	if (!idVuelo || !idAsiento) {
		return res.status(400).json({ error: 'Debe proporcionar el id de vuelo (en la URL) y el id de asiento (en el body)' });
	}

	reservasModel.reservarAsiento(idVuelo, idAsiento, (err, result) => {
		if (err) {
			console.error(err);
			return res.status(500).json({ error: 'Error al reservar el asiento' });
		}
		if (!result.success) {
			return res.status(409).json(result);
		}
		res.json(result);
	});
};
