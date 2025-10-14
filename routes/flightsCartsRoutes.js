const express = require('express');
const router = express.Router();
const flightCartsController = require('../controllers/flightCartsController');


// Body: { "externalUserId": 123, "flights": 1001 }
router.post('/flight-cart/add', flightCartsController.addFlightToCart);

router.post('/flight-cart/remove', flightCartsController.removeFlightFromCart);

//cambiar despues a metodo get sacando el id del usuario del token
router.post('/flight-cart/get', flightCartsController.getCartByUserId);

module.exports = router;