const db = require('../config/db');

const findById = (id, callback) => {
  db.query('SELECT * FROM users WHERE id = ?', [id], (err, results) => {
    if (err) return callback(err);
    callback(null, results.length > 0 ? results[0] : null);
  });
};

const create = (id, callback) => {
  db.query('INSERT INTO users (id) VALUES (?)', [id], (err, result) => {
    if (err) return callback(err);
    callback(null, result);
  });
};

const deleteUser = (id, callback) => {
  db.query('DELETE FROM users WHERE id = ?', [id], (err, result) => {
    if (err) return callback(err);
    callback(null, result);
  });
};

module.exports = {
  findById,
  create,
  delete: deleteUser
};
