const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const salasRouter = require('./routes/salas');
const usuariosRouter = require('./routes/usuarios');
const equipamentosRouter = require('./routes/equipamentos');
const authRouter = require('./routes/auth');

const app = express();

app.use(cors());
app.use(express.json());

// Documentação Swagger
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Rotas
app.use('/api/auth', authRouter);
app.use('/api/salas', salasRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/equipamentos', equipamentosRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rota não encontrada
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

module.exports = app;
