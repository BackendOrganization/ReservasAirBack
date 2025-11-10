const UsersModel = require('../models/usersModel');

const createUser = async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'ID es requerido' });
  }
  try {
    const userExistente = await UsersModel.findById(id);
    if (userExistente) {
      return res.status(409).json({ error: 'El usuario ya está presente en la tabla' });
    }
    await UsersModel.create(id);
    return res.status(201).json({ message: 'Ingreso exitoso' });
  } catch (error) {
    return res.status(500).json({ error: 'Error en el servidor', details: error.message });
  }
};

const getUser = async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'ID es requerido' });
  }
  try {
    const user = await UsersModel.findById(id);
    if (user) {
      return res.status(200).json({ message: 'El usuario existe', user });
    } else {
      return res.status(404).json({ error: 'El usuario no existe' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Error en el servidor', details: error.message });
  }
};

const deleteUser = async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'ID es requerido' });
  }
  try {
    const user = await UsersModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'El usuario no existe' });
    }
    await UsersModel.delete(id);
    return res.status(200).json({ message: 'Usuario eliminado exitosamente' });
  } catch (error) {
    return res.status(500).json({ error: 'Error en el servidor', details: error.message });
  }
};

module.exports = { createUser, getUser, deleteUser };
