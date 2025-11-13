const db = require('../config/db');

// GET /events - Obtener los últimos 5 eventos enviados
exports.getLatestEvents = (req, res) => {
    const query = 'SELECT * FROM eventsProducer ORDER BY id DESC LIMIT 5';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching events:', err);
            return res.status(500).json({ 
                success: false,
                error: 'Error fetching events from database' 
            });
        }
        
        // Parsear el payload JSON si es string
        const events = results.map(event => {
            let parsedPayload = event.payload;
            if (typeof event.payload === 'string') {
                try {
                    parsedPayload = JSON.parse(event.payload);
                } catch (e) {
                    // Si no se puede parsear, dejar como está
                    parsedPayload = event.payload;
                }
            }
            return {
                ...event,
                payload: parsedPayload
            };
        });
        
        res.status(200).json({
            success: true,
            count: events.length,
            events: events
        });
    });
};
