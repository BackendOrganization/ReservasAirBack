
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

// Cancelar una reserva (insertar evento CANCELLED)
exports.cancelarReserva = (req, res) => {
	const idVuelo = req.params.idVuelo;
	const idAsiento = req.body.idAsiento || req.body.Id_asiento;
	const idUsuario = req.body.idUsuario || req.body.Id_usuario;
	const monto = req.body.amount;
	if (!idVuelo || !idAsiento || !idUsuario || monto == null) {
		return res.status(400).json({ error: 'Faltan datos requeridos: idVuelo, idAsiento, idUsuario, amount' });
	}
	reservasModel.cancelarReserva(idUsuario, idVuelo, idAsiento, monto, (err, result) => {
		if (err) {
			console.error(err);
			return res.status(500).json({ error: 'Error al cancelar la reserva' });
		}
		if (!result.success) {
			// Si la cancelación no procede, solo devuelve el mensaje y success false
			return res.json({ success: false, message: result.message });
		}
		res.json(result);
	});
};

