// Cambiar el asiento de una reserva existente y registrar evento de pago/refund
exports.cambiarAsientoReserva = (req, res) => {
	const idVuelo = req.params.idVuelo;
	const idReserva = req.body.idReserva || req.body.Id_reserva;
	const idUsuario = req.body.idUsuario || req.body.Id_usuario;
	const idAsientoActual = req.body.idAsientoActual || req.body.Id_asiento_actual;
	const idAsientoNuevo = req.body.idAsientoNuevo || req.body.Id_asiento_nuevo;
	if (!idVuelo || !idReserva || !idUsuario || !idAsientoActual || !idAsientoNuevo) {
		return res.status(400).json({ error: 'Faltan datos requeridos: idVuelo, idReserva, idUsuario, idAsientoActual, idAsientoNuevo' });
	}
	reservasModel.cambiarAsientoReserva(idReserva, idUsuario, idAsientoActual, idAsientoNuevo, (err, result) => {
		if (err) {
			console.error(err);
			return res.status(500).json({ error: 'Error al cambiar el asiento de la reserva' });
		}
		res.json(result);
	});
};

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
