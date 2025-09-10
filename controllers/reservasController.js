
const reservasModel = require('../models/reservasModel');

// Reservar un asiento disponible de un vuelo específico
exports.reservarAsiento = (req, res) => {
	const idVuelo = req.params.idVuelo;
	const idAsiento = req.body.idAsiento || req.body.Id_asiento;
	const idUsuario = req.body.idUsuario || req.body.Id_usuario;
	const monto = req.body.amount;
	if (!idVuelo || !idAsiento || !idUsuario || monto == null) {
		return res.status(400).json({ error: 'Faltan datos requeridos: idVuelo, idAsiento, idUsuario, amount' });
	}
	const { generarReservaConMonto } = require('../models/reservasModel');
	generarReservaConMonto(idUsuario, idVuelo, idAsiento, monto, (err, result) => {
		if (err) {
			console.error(err);
			return res.status(500).json({ error: 'Error al reservar el asiento' });
		}
		res.json(result);
	});
};

// Cancelar una reserva (pasar de confirmado a disponible)
exports.cancelarAsiento = (req, res) => {
	const idVuelo = req.params.idVuelo;
	const idAsiento = req.body.idAsiento || req.body.Id_asiento;
	if (!idVuelo || !idAsiento) {
		return res.status(400).json({ error: 'Debe proporcionar el id de vuelo (en la URL) y el id de asiento (en el body)' });
	}

	reservasModel.cancelarAsiento(idVuelo, idAsiento, (err, result) => {
		if (err) {
			console.error(err);
			return res.status(500).json({ error: 'Error al cancelar el asiento' });
		}
		if (!result.success) {
			return res.status(409).json(result);
		}
		res.json(result);
	});
};

