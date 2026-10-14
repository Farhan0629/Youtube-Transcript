module.exports = (req, res) => {
  const app = require('../server.js');
  return app(req, res);
};
