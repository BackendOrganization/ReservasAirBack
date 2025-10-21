const flightCartsModel = require('../models/flightCartsModel');


exports.addFlightToCart = (req, res) => {
    const { externalUserId, flights } = req.body;
    
    // Validar que los campos requeridos estén presentes
    if (!externalUserId || !flights) {
        return res.status(400).json({ 
            error: 'Missing required fields: externalUserId and flights are required' 
        });
    }

    // Validar que flights sea un número
    if (typeof flights !== 'number' && !Number.isInteger(Number(flights))) {
        return res.status(400).json({ 
            error: 'flights must be a valid number (e.g., 1001)' 
        });
    }

    const flightId = Number(flights);

    flightCartsModel.addFlightToCart(externalUserId, flightId, (err, result) => {
        if (err) {
            console.error('Error adding flight to cart:', err);
            return res.status(500).json({ 
                error: 'Error adding flight to cart',
                details: err.message 
            });
        }
        
        if (result.success) {
            return res.status(201).json(result);
        } else {
            return res.status(400).json(result);
        }
    });
};


exports.removeFlightFromCart = (req, res) => {
    const { externalUserId, flights } = req.body;
    
    // Validar que los campos requeridos estén presentes
    if (!externalUserId || !flights) {
        return res.status(400).json({ 
            error: 'Missing required fields: externalUserId and flights are required' 
        });
    }

    // Validar que flights sea un número
    if (typeof flights !== 'number' && !Number.isInteger(Number(flights))) {
        return res.status(400).json({ 
            error: 'flights must be a valid number (e.g., 1001)' 
        });
    }

    const flightId = Number(flights);

    flightCartsModel.removeFlightFromCart(externalUserId, flightId, (err, result) => {
        if (err) {
            console.error('Error removing flight from cart:', err);
            return res.status(500).json({ 
                error: 'Error removing flight from cart',
                details: err.message 
            });
        }
        
        if (result.success) {
            return res.status(200).json(result);
        } else {
            return res.status(404).json(result);
        }
    });
};


exports.getCartByUserId = (req, res) => {
    const { externalUserId } = req.params; 
    
    if (!externalUserId) {
        return res.status(400).json({ error: 'Missing externalUserId parameter' });
    }

    flightCartsModel.getCartByUserId(externalUserId, (err, result) => {
        if (err) {
            console.error('Error getting cart with flight details:', err);
            return res.status(500).json({ error: 'Error fetching cart' });
        }

        res.status(200).json({
            externalUserId,
            flights: result,
            totalFlights: result.length
        });
    });
};