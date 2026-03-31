require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const app = require('./src/app');

const PORT = process.env.PORT || 3003;

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log(`Documentação Swagger: http://localhost:${PORT}/api/docs`);
});
