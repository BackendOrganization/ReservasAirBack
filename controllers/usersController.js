const UsersModel = require('../models/usersModel');

const createUser = (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'ID es requerido' });
  }
  UsersModel.findById(id, (err, userExistente) => {
    if (err) return res.status(500).json({ error: 'Error en el servidor', details: err.message });
    if (userExistente) {
      return res.status(409).json({ error: 'El usuario ya está presente en la tabla' });
    }
    UsersModel.create(id, (err2) => {
      if (err2) return res.status(500).json({ error: 'Error en el servidor', details: err2.message });
      return res.status(201).json({ message: 'Ingreso exitoso' });
    });
  });
};

const getUser = (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'ID es requerido' });
  }
  UsersModel.findById(id, (err, user) => {
    if (err) return res.status(500).json({ error: 'Error en el servidor', details: err.message });
    if (user) {
      return res.status(200).json({ message: 'El usuario existe', user });
    } else {
      return res.status(404).json({ error: 'El usuario no existe' });
    }
  });
};

const deleteUser = (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'ID es requerido' });
  }
  UsersModel.findById(id, (err, user) => {
    if (err) return res.status(500).json({ error: 'Error en el servidor', details: err.message });
    if (!user) {
      return res.status(404).json({ error: 'El usuario no existe' });
    }
    UsersModel.delete(id, (err2) => {
      if (err2) return res.status(500).json({ error: 'Error en el servidor', details: err2.message });
      return res.status(200).json({ message: 'Usuario eliminado exitosamente' });
    });
  });
};

module.exports = { createUser, getUser, deleteUser };
