const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const pool = require('./config/db');

const salasRouter = require('./routes/salas');
const usuariosRouter = require('./routes/usuarios');
const equipamentosRouter = require('./routes/equipamentos');
const authRouter = require('./routes/auth');
const reservasRouter = require('./routes/reservas');
const logsRouter = require('./routes/logs');
const optionalAuthMiddleware = require('./middlewares/optionalAuthMiddleware');

async function concluirReservasExpiradas() {
  try {
    await pool.query(
      `UPDATE reserva
       SET status = 'concluida'
       WHERE status = 'ativa'
         AND (
           data < CURRENT_DATE
           OR (data = CURRENT_DATE AND hora_fim < CURRENT_TIME)
         )`
    );
  } catch (err) {
    console.error('Erro ao concluir reservas expiradas:', err.message);
  }
}

async function garantirConstraints() {
  try {
    // Impede dupla reserva do mesmo slot mesmo sob concorrência
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS reserva_slot_unico
       ON reserva (sala_id, data, turno, aula_numero)
       WHERE status = 'ativa'`
    );
  } catch (err) {
    console.error('Erro ao criar índice de constraint:', err.message);
  }
}

// Executa ao iniciar e a cada 5 minutos
garantirConstraints();
concluirReservasExpiradas();
setInterval(concluirReservasExpiradas, 5 * 60 * 1000);

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null,
  'http://localhost:3000',
  'http://localhost:3003',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Permite requisições sem origin (ex: Postman, curl)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(optionalAuthMiddleware);

// Documentação Swagger
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Rotas
app.use('/api/auth', authRouter);
app.use('/api/salas', salasRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/equipamentos', equipamentosRouter);
app.use('/api/reservas', reservasRouter);
app.use('/api/logs', logsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rota não encontrada
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

module.exports = app;
