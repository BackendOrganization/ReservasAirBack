const db = require('../config/db');

const UsersModel = {
  async findById(id) {
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  },

  async create(id) {
    await db.query('INSERT INTO users (id) VALUES (?)', [id]);
  },

  async delete(id) {
    await db.query('DELETE FROM users WHERE id = ?', [id]);
  }
};

module.exports = UsersModel;
