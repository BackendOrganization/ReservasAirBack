const express = require('express');
const router = express.Router();
const { createUser, getUser, deleteUser } = require('../controllers/usersController');

router.post('/', createUser);

router.get('/:id', getUser);

router.delete('/:id', deleteUser);

module.exports = router;
