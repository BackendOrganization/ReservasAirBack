const db = require('../config/db');
const seatsModel = require('./seatsModel');

/**
 * Helpers
 */
const safeParseSeatIds = (seatIdRaw) => {
  let seatIds = [];
  if (!seatIdRaw && seatIdRaw !== 0) return seatIds;
  try {
    seatIds = JSON.parse(seatIdRaw);
    if (!Array.isArray(seatIds)) seatIds = [seatIds];
  } catch {
    if (Array.isArray(seatIdRaw)) seatIds = seatIdRaw;
    else if (typeof seatIdRaw === 'string') {
      const matches = seatIdRaw.match(/\d+/g);
      seatIds = matches ? matches.map(n => Number(n)) : [Number(seatIdRaw)].filter(n => !isNaN(n));
    } else if (!isNaN(seatIdRaw)) {
      seatIds = [Number(seatIdRaw)];
    } else {
      seatIds = [];
    }
  }
  return seatIds.map(id => Number(id)).filter(id => !isNaN(id));
};

/**
 * Confirm payment (uses simple queries, no long transaction)
 */
const confirmPayment = (paymentStatus, reservationId, externalUserId, callback) => {
  // Solo permitir confirmación si la reserva NO está en estado PAID
  const checkReservationQuery = `SELECT status FROM reservations WHERE reservationId = ? LIMIT 1`;
  db.query(checkReservationQuery, [reservationId], (errRes, resRows) => {
    if (errRes) return callback(errRes);
    if (!resRows[0]) return callback(null, { success: false, message: 'Reservation not found.' });
    if (resRows[0].status === 'PAID') {
      return callback(null, { success: false, message: 'Payment already confirmed for this reservation.' });
    }
    function continueConfirm() {
      const getPendingEventQuery = `SELECT amount FROM paymentEvents WHERE reservationId = ? AND externalUserId = ? AND paymentStatus = 'PENDING' LIMIT 1`;
      db.query(getPendingEventQuery, [reservationId, externalUserId], (err, rows) => {
        console.log('[confirmPayment] Resultado SQL:', rows);
        if (err) return callback(err);
        if (!rows[0]) return callback(null, { success: false, message: 'No pending payment event found.' });
        const amount = rows[0].amount;

        db.getConnection((connErr, connection) => {
          if (connErr) {
            console.error('[confirmPayment] DB connection error:', connErr);
            return callback(connErr);
          }

          connection.beginTransaction((txErr) => {
            if (txErr) {
              console.error('[confirmPayment] beginTransaction error:', txErr);
              connection.release();
              return callback(txErr);
            }

            const insertSuccessQuery = `INSERT INTO paymentEvents (reservationId, externalUserId, paymentStatus, amount) VALUES (?, ?, 'SUCCESS', ?)`;
            connection.query(insertSuccessQuery, [reservationId, externalUserId, amount], (err2) => {
              if (err2) {
                console.error('[confirmPayment] Error inserting SUCCESS event:', err2);
                return connection.rollback(() => { connection.release(); callback(err2); });
              }

              const updateReservationQuery = `UPDATE reservations SET status = 'PAID' WHERE reservationId = ?`;
              connection.query(updateReservationQuery, [reservationId], (err3) => {
                if (err3) {
                  console.error('[confirmPayment] Error updating reservation to PAID:', err3);
                  return connection.rollback(() => { connection.release(); callback(err3); });
                }

                const getReservationQuery = `SELECT seatId, externalFlightId FROM reservations WHERE reservationId = ?`;
                connection.query(getReservationQuery, [reservationId], (err4, rows2) => {
                  if (err4) {
                    console.error('[confirmPayment] Error fetching reservation after update:', err4);
                    return connection.rollback(() => { connection.release(); callback(err4); });
                  }
                  if (!rows2[0]) {
                    console.error('[confirmPayment] Reservation not found after update.');
                    return connection.rollback(() => { connection.release(); callback(null, { success: false, message: 'Reservation not found.' }); });
                  }

                  const { seatId, externalFlightId } = rows2[0];
                  const seatIds = safeParseSeatIds(seatId);

                  // Obtener fechas para el evento
                  const getDatesQuery = `
                    SELECT r.createdAt as reservationDate, f.flightDate 
                    FROM reservations r 
                    LEFT JOIN flights f ON r.externalFlightId = f.externalFlightId 
                    WHERE r.reservationId = ?
                  `;
                  connection.query(getDatesQuery, [reservationId], (err4b, dateRows) => {
                    if (err4b) {
                      console.error('[confirmPayment] Error fetching dates:', err4b);
                      return connection.rollback(() => { connection.release(); callback(err4b); });
                    }
                    const dates = dateRows[0] || {};

                    if (seatIds.length === 0) {
                      return connection.commit((cErr) => {
                        if (cErr) {
                          console.error('[confirmPayment] Commit error (no seats):', cErr);
                          return connection.rollback(() => { connection.release(); callback(cErr); });
                        }
                        connection.release();
                        callback(null, { 
                          success: true, 
                          message: 'Payment confirmed, reservation PAID. No seats to confirm.',
                          reservationDate: dates.reservationDate,
                          flightDate: dates.flightDate
                        });
                      });
                    }

                    const placeholders = seatIds.map(() => '?').join(',');
                    const confirmSeatsQuery = `UPDATE seats SET status = 'CONFIRMED' WHERE seatId IN (${placeholders}) AND externalFlightId = ?`;
                    connection.query(confirmSeatsQuery, [...seatIds, externalFlightId], (err5) => {
                      if (err5) {
                        console.error('[confirmPayment] Error confirming seats:', err5);
                        return connection.rollback(() => { connection.release(); callback(err5); });
                      }

                      connection.commit((cErr) => {
                        if (cErr) {
                          console.error('[confirmPayment] Commit error (after seats):', cErr);
                          return connection.rollback(() => { connection.release(); callback(cErr); });
                        }
                        connection.release();
                        callback(null, { 
                          success: true, 
                          message: 'Payment confirmed, reservation PAID, seats CONFIRMED, payment event created.',
                          reservationDate: dates.reservationDate,
                          flightDate: dates.flightDate
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    }
    continueConfirm();
  });
}

/**
 * Cancel payment (uses transaction via pool connection)
 */
const cancelPayment = (reservationId, externalUserId, callback) => {
  console.log('[cancelPayment] called with reservationId:', reservationId, 'externalUserId:', externalUserId);
  db.getConnection((errConn, connection) => {
    if (errConn) { console.error('[cancelPayment] DB connection error:', errConn); return callback(errConn); }

    connection.beginTransaction(errTrans => {
      if (errTrans) { console.error('[cancelPayment] beginTransaction error:', errTrans); connection.release(); return callback(errTrans); }

      const findReservationQuery = `SELECT * FROM reservations WHERE reservationId = ? FOR UPDATE`;
      connection.query(findReservationQuery, [reservationId], (err, reservationRows) => {
        if (err) { console.error('[cancelPayment] findReservationQuery error:', err); return connection.rollback(() => { connection.release(); callback(err); }); }

        if (!reservationRows[0]) {
          console.warn('[cancelPayment] Reservation does not exist:', reservationId);
          return connection.rollback(() => { connection.release(); callback(null, { success: false, message: 'Reservation does not exist.' }); });
        }

        const reservation = reservationRows[0];
        console.log('[cancelPayment] Current reservation status:', reservation.status);
        if (reservation.status !== 'PENDING' && reservation.status !== 'PENDING_REFUND') {
          console.warn('[cancelPayment] Only PENDING or PENDING_REFUND reservations can be refunded. Current status:', reservation.status);
          return connection.rollback(() => { connection.release(); callback(null, { success: false, message: 'Only PENDING or PENDING_REFUND reservations can be refunded.' }); });
        }

        const checkRefundQuery = `SELECT eventId FROM paymentEvents WHERE reservationId = ? AND paymentStatus = 'REFUND' LIMIT 1`;
        connection.query(checkRefundQuery, [reservationId], (errCheck, refundRows) => {
          if (errCheck) { console.error('[cancelPayment] checkRefundQuery error:', errCheck); return connection.rollback(() => { connection.release(); callback(errCheck); }); }
          if (refundRows.length > 0) {
            console.warn('[cancelPayment] Refund event already exists for this reservation:', reservationId);
            return connection.rollback(() => { connection.release(); callback(null, { success: false, message: 'Refund event already exists for this reservation.' }); });
          }

          const cancelQuery = `UPDATE reservations SET status = 'CANCELLED' WHERE reservationId = ?`;
          connection.query(cancelQuery, [reservationId], (err2) => {
            if (err2) { console.error('[cancelPayment] cancelQuery error:', err2); return connection.rollback(() => { connection.release(); callback(err2); }); }

            const getReservationQuery = `SELECT seatId, externalFlightId, totalPrice FROM reservations WHERE reservationId = ?`;
            connection.query(getReservationQuery, [reservationId], (err3, rows) => {
              if (err3) { console.error('[cancelPayment] getReservationQuery error:', err3); return connection.rollback(() => { connection.release(); callback(err3); }); }
              if (!rows[0]) { console.warn('[cancelPayment] Reservation not found after cancel:', reservationId); return connection.rollback(() => { connection.release(); callback(null, { success: false, message: 'Reservation not found.' }); }); }

              const { seatId, externalFlightId, totalPrice } = rows[0];
              const seatIds = safeParseSeatIds(seatId);

              const refundEventQuery = `INSERT INTO paymentEvents (reservationId, externalUserId, paymentStatus, amount) VALUES (?, ?, 'REFUND', ?)`;
              connection.query(refundEventQuery, [reservationId, externalUserId, totalPrice], (err5) => {
                if (err5) { console.error('[cancelPayment] refundEventQuery error:', err5); return connection.rollback(() => { connection.release(); callback(err5); }); }

                // Obtener fechas para el evento
                const getDatesQuery = `
                  SELECT r.createdAt as reservationDate, f.flightDate 
                  FROM reservations r 
                  LEFT JOIN flights f ON r.externalFlightId = f.externalFlightId 
                  WHERE r.reservationId = ?
                `;
                connection.query(getDatesQuery, [reservationId], (errDates, dateRows) => {
                  if (errDates) { console.error('[cancelPayment] getDatesQuery error:', errDates); return connection.rollback(() => { connection.release(); callback(errDates); }); }
                  const dates = dateRows[0] || {};

                  if (seatIds.length === 0) {
                    console.log('[cancelPayment] No seats to release. Committing.');
                    return connection.commit((errCommit) => {
                      if (errCommit) { console.error('[cancelPayment] commit error:', errCommit); return connection.rollback(() => { connection.release(); callback(errCommit); }); }
                      connection.release();
                      return callback(null, { 
                        success: true, 
                        message: 'Reservation cancelled, refund event created.',
                        reservationDate: dates.reservationDate,
                        flightDate: dates.flightDate
                      });
                    });
                  }

                  const placeholders = seatIds.map(() => '?').join(',');
                  const releaseSeatsQuery = `
                    UPDATE seats SET status = 'AVAILABLE'
                    WHERE externalFlightId = ? AND seatId IN (${placeholders}) AND status IN ('RESERVED','CONFIRMED')
                  `;
                  connection.query(releaseSeatsQuery, [externalFlightId, ...seatIds], (err6) => {
                    if (err6) { console.error('[cancelPayment] releaseSeatsQuery error:', err6); return connection.rollback(() => { connection.release(); callback(err6); }); }

                    const seatsCount = seatIds.length;
                    const updateFlightSql = `
                      UPDATE flights
                      SET freeSeats = freeSeats + ?, occupiedSeats = occupiedSeats - ?
                      WHERE externalFlightId = ?
                    `;
                    connection.query(updateFlightSql, [seatsCount, seatsCount, externalFlightId], (err7) => {
                      if (err7) { console.error('[cancelPayment] updateFlightSql error:', err7); return connection.rollback(() => { connection.release(); callback(err7); }); }

                      console.log('[cancelPayment] All updates done. Committing.');
                      connection.commit((errCommit) => {
                        if (errCommit) { console.error('[cancelPayment] commit error:', errCommit); return connection.rollback(() => { connection.release(); callback(errCommit); }); }
                        connection.release();
                        callback(null, { 
                          success: true, 
                          message: 'Reservation cancelled, seats released, refund event created.',
                          reservationDate: dates.reservationDate,
                          flightDate: dates.flightDate
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
};

/**
 * Create FAILED payment event and mark reservation as FAILED (transactional)
 */
const createPaymentEventAndFailReservation = (paymentData, callback) => {
  db.getConnection((errConn, connection) => {
    if (errConn) return callback(errConn);

    connection.beginTransaction((txErr) => {
      if (txErr) {
        connection.release();
        return callback(txErr);
      }

      const checkSql = `SELECT COUNT(*) AS count FROM paymentEvents WHERE reservationId = ? AND paymentStatus = 'FAILED'`;
      connection.query(checkSql, [paymentData.reservationId], (err, results) => {
        if (err) return connection.rollback(() => { connection.release(); callback(err); });
        if (results[0].count > 0) {
          return connection.rollback(() => { connection.release(); callback({ message: 'A FAILED payment event already exists for this reservationId.' }); });
        }

        const getReservationSql = `SELECT totalPrice, seatId, externalFlightId FROM reservations WHERE reservationId = ?`;
        connection.query(getReservationSql, [paymentData.reservationId], (err2, rows) => {
          if (err2) return connection.rollback(() => { connection.release(); callback(err2); });
          const amount = rows[0] ? rows[0].totalPrice : 0;
          const seatIdRaw = rows[0] ? rows[0].seatId : null;
          const externalFlightId = rows[0] ? rows[0].externalFlightId : null;

          const seatIds = safeParseSeatIds(seatIdRaw);
          const seatsCount = seatIds.length;

          const insertEventSql = `
            INSERT INTO paymentEvents (paymentStatus, reservationId, externalUserId, amount)
            VALUES (?, ?, ?, ?)
          `;
          connection.query(insertEventSql, [paymentData.paymentStatus, paymentData.reservationId, paymentData.externalUserId, amount], (err3, eventResult) => {
            if (err3) return connection.rollback(() => { connection.release(); callback(err3); });

            const updateReservationSql = `UPDATE reservations SET status = 'FAILED' WHERE reservationId = ? AND status != 'FAILED'`;
            connection.query(updateReservationSql, [paymentData.reservationId], (err4) => {
              if (err4) return connection.rollback(() => { connection.release(); callback(err4); });

              // Obtener fechas para el evento
              const getDatesQuery = `
                SELECT r.createdAt as reservationDate, f.flightDate 
                FROM reservations r 
                LEFT JOIN flights f ON r.externalFlightId = f.externalFlightId 
                WHERE r.reservationId = ?
              `;
              connection.query(getDatesQuery, [paymentData.reservationId], (errDates, dateRows) => {
                if (errDates) return connection.rollback(() => { connection.release(); callback(errDates); });
                const dates = dateRows[0] || {};

                if (seatsCount === 0 || !externalFlightId) {
                  return connection.commit((cErr) => {
                    if (cErr) return connection.rollback(() => { connection.release(); callback(cErr); });
                    connection.release();
                    return callback(null, { 
                      paymentEventId: eventResult.insertId, 
                      reservationId: paymentData.reservationId,
                      reservationDate: dates.reservationDate,
                      flightDate: dates.flightDate
                    });
                  });
                }

                const placeholders = seatIds.map(() => '?').join(',');
                const updateSeatsSql = `
                  UPDATE seats SET status = 'AVAILABLE'
                  WHERE seatId IN (${placeholders}) AND externalFlightId = ? AND status = 'RESERVED'
                `;
                connection.query(updateSeatsSql, [...seatIds, externalFlightId], (err5) => {
                  if (err5) return connection.rollback(() => { connection.release(); callback(err5); });

                  const updateFlightSql = `
                    UPDATE flights
                    SET freeSeats = freeSeats + ?, occupiedSeats = occupiedSeats - ?
                    WHERE externalFlightId = ?
                  `;
                  connection.query(updateFlightSql, [seatsCount, seatsCount, externalFlightId], (err6) => {
                    if (err6) return connection.rollback(() => { connection.release(); callback(err6); });

                    connection.commit((cErr) => {
                      if (cErr) return connection.rollback(() => { connection.release(); callback(cErr); });
                      connection.release();
                      callback(null, { 
                        paymentEventId: eventResult.insertId, 
                        reservationId: paymentData.reservationId,
                        reservationDate: dates.reservationDate,
                        flightDate: dates.flightDate
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
};

module.exports = {
  confirmPayment,
  cancelPayment,
  createPaymentEventAndFailReservation
};
