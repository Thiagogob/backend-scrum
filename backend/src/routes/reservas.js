const { Router } = require('express');
const pool = require('../config/db');
const authMiddleware = require('../middlewares/authMiddleware');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Reservas
 *   description: Agendamento e gestão de reservas de salas e laboratórios
 */

// Horários padrão por turno e número de aula
const HORARIOS = {
  matutino: {
    1: { hora_inicio: '08:00', hora_fim: '08:50' },
    2: { hora_inicio: '08:55', hora_fim: '09:45' },
    3: { hora_inicio: '09:55', hora_fim: '10:45' },
    4: { hora_inicio: '10:50', hora_fim: '11:40' },
  },
  vespertino: {
    1: { hora_inicio: '13:00', hora_fim: '13:50' },
    2: { hora_inicio: '13:55', hora_fim: '14:45' },
    3: { hora_inicio: '14:55', hora_fim: '15:45' },
    4: { hora_inicio: '15:50', hora_fim: '16:40' },
  },
  noturno: {
    1: { hora_inicio: '19:00', hora_fim: '19:50' },
    2: { hora_inicio: '19:55', hora_fim: '20:45' },
    3: { hora_inicio: '20:55', hora_fim: '21:45' },
    4: { hora_inicio: '21:50', hora_fim: '22:40' },
  },
};

/**
 * @swagger
 * /api/reservas/horarios:
 *   get:
 *     summary: Retorna os horários disponíveis por turno e número de aula
 *     tags: [Reservas]
 *     responses:
 *       200:
 *         description: Mapa de turnos com horários de cada aula
 *         content:
 *           application/json:
 *             example:
 *               matutino:
 *                 1: { hora_inicio: "08:00", hora_fim: "08:50" }
 *                 2: { hora_inicio: "08:55", hora_fim: "09:45" }
 *                 3: { hora_inicio: "09:55", hora_fim: "10:45" }
 *                 4: { hora_inicio: "10:50", hora_fim: "11:40" }
 *               vespertino:
 *                 1: { hora_inicio: "13:00", hora_fim: "13:50" }
 *                 2: { hora_inicio: "13:55", hora_fim: "14:45" }
 *                 3: { hora_inicio: "14:55", hora_fim: "15:45" }
 *                 4: { hora_inicio: "15:50", hora_fim: "16:40" }
 *               noturno:
 *                 1: { hora_inicio: "19:00", hora_fim: "19:50" }
 *                 2: { hora_inicio: "19:55", hora_fim: "20:45" }
 *                 3: { hora_inicio: "20:55", hora_fim: "21:45" }
 *                 4: { hora_inicio: "21:50", hora_fim: "22:40" }
 */
router.get('/horarios', (req, res) => {
  res.json(HORARIOS);
});

/**
 * @swagger
 * /api/reservas/disponibilidade:
 *   get:
 *     summary: Consulta salas disponíveis para uma data e turno
 *     tags: [Reservas]
 *     parameters:
 *       - in: query
 *         name: data
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Data da consulta (YYYY-MM-DD)
 *       - in: query
 *         name: turno
 *         required: true
 *         schema:
 *           type: string
 *           enum: [matutino, vespertino, noturno]
 *       - in: query
 *         name: aula_numero
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 4
 *         description: Número da aula (1–4). Se omitido, retorna disponibilidade de todas as aulas.
 *       - in: query
 *         name: tipo_sala
 *         schema:
 *           type: string
 *           enum: [sala_aula, laboratorio]
 *     responses:
 *       200:
 *         description: Lista de salas disponíveis
 *       400:
 *         description: Parâmetros obrigatórios faltando
 *       500:
 *         description: Erro interno
 */
router.get('/disponibilidade', async (req, res) => {
  const { data, turno, aula_numero, tipo_sala } = req.query;

  if (!data || !turno) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios: data, turno' });
  }
  if (!['matutino', 'vespertino', 'noturno'].includes(turno)) {
    return res.status(400).json({ error: 'turno deve ser "matutino", "vespertino" ou "noturno"' });
  }

  try {
    const aulaCondition = aula_numero ? `AND r.aula_numero = $3` : '';
    const aulaValues = aula_numero ? [data, turno, Number(aula_numero)] : [data, turno];

    const reservadasResult = await pool.query(
      `SELECT DISTINCT r.sala_id
       FROM reserva r
       WHERE r.data = $1 AND r.turno = $2 AND r.status = 'ativa' ${aulaCondition}`,
      aulaValues
    );
    const reservadasIds = reservadasResult.rows.map(r => r.sala_id);

    const conditions = [`ativo = true`];
    const values = [];
    if (tipo_sala) { values.push(tipo_sala); conditions.push(`tipo_sala = $${values.length}`); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const { rows: todasSalas } = await pool.query(
      `SELECT * FROM sala ${where} ORDER BY bloco, nome_numero`,
      values
    );

    const disponiveis = todasSalas.filter(s => !reservadasIds.includes(s.id));
    res.json(disponiveis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/reservas:
 *   get:
 *     summary: Lista reservas com filtros opcionais
 *     tags: [Reservas]
 *     parameters:
 *       - in: query
 *         name: usuario_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: sala_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: data
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: turno
 *         schema:
 *           type: string
 *           enum: [matutino, vespertino, noturno]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ativa, cancelada, concluida]
 *     responses:
 *       200:
 *         description: Lista de reservas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Reserva'
 *       500:
 *         description: Erro interno
 */
router.get('/', async (req, res) => {
  const { usuario_id, sala_id, data, turno, status } = req.query;

  const conditions = [];
  const values = [];

  if (usuario_id) { values.push(usuario_id); conditions.push(`r.usuario_id = $${values.length}`); }
  if (sala_id) { values.push(sala_id); conditions.push(`r.sala_id = $${values.length}`); }
  if (data) { values.push(data); conditions.push(`r.data = $${values.length}`); }
  if (turno) { values.push(turno); conditions.push(`r.turno = $${values.length}`); }
  if (status) { values.push(status); conditions.push(`r.status = $${values.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT r.*,
              s.nome_numero, s.bloco, s.tipo_sala,
              u.nome AS usuario_nome
       FROM reserva r
       JOIN sala s ON s.id = r.sala_id
       JOIN usuario u ON u.id = r.usuario_id
       ${where}
       ORDER BY r.data DESC, r.turno, r.aula_numero`,
      values
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/reservas/{id}:
 *   get:
 *     summary: Busca uma reserva pelo ID
 *     tags: [Reservas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Reserva encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reserva'
 *       404:
 *         description: Reserva não encontrada
 *       500:
 *         description: Erro interno
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows, rowCount } = await pool.query(
      `SELECT r.*,
              s.nome_numero, s.bloco, s.tipo_sala,
              u.nome AS usuario_nome
       FROM reserva r
       JOIN sala s ON s.id = r.sala_id
       JOIN usuario u ON u.id = r.usuario_id
       WHERE r.id = $1`,
      [id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Reserva não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/reservas:
 *   post:
 *     summary: Cria uma nova reserva
 *     tags: [Reservas]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReservaInput'
 *           example:
 *             sala_id: "uuid-da-sala"
 *             usuario_id: "uuid-do-professor"
 *             criado_por: "uuid-do-criador"
 *             data: "2026-04-10"
 *             turno: "matutino"
 *             aula_numero: 1
 *             disciplina: "Aula de Algoritmos"
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Reserva criada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reserva'
 *       400:
 *         description: Dados inválidos ou conflito de horário
 *       401:
 *         description: Token não fornecido ou inválido
 *       500:
 *         description: Erro interno
 */
router.post('/', authMiddleware, async (req, res) => {
  const { sala_id, usuario_id, criado_por, data, turno, aula_numero, disciplina } = req.body;

  if (!sala_id || !usuario_id || !data || !turno || !aula_numero) {
    return res.status(400).json({ error: 'Campos obrigatórios: sala_id, usuario_id, data, turno, aula_numero' });
  }
  if (!['matutino', 'vespertino', 'noturno'].includes(turno)) {
    return res.status(400).json({ error: 'turno deve ser "matutino", "vespertino" ou "noturno"' });
  }
  const aulaNum = Number(aula_numero);
  if (![1, 2, 3, 4].includes(aulaNum)) {
    return res.status(400).json({ error: 'aula_numero deve ser 1, 2, 3 ou 4' });
  }

  // Validação: não permitir reservas retroativas
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dataReserva = new Date(data + 'T00:00:00');
  if (dataReserva < hoje) {
    return res.status(400).json({ error: 'Não é permitido fazer reservas em datas passadas' });
  }

  try {
    // Validação: professor só pode reservar no mês corrente
    const usuarioResult = await pool.query('SELECT tipo FROM usuario WHERE id = $1', [usuario_id]);
    if (usuarioResult.rowCount === 0) return res.status(400).json({ error: 'Usuário não encontrado' });

    if (usuarioResult.rows[0].tipo === 'professor') {
      const agora = new Date();
      const mesAtual = agora.getMonth();
      const anoAtual = agora.getFullYear();
      const mesReserva = dataReserva.getMonth();
      const anoReserva = dataReserva.getFullYear();

      if (anoReserva !== anoAtual || mesReserva !== mesAtual) {
        return res.status(400).json({
          error: 'Professores só podem reservar salas dentro do mês corrente',
        });
      }
    }

    // Verificar se a sala existe e está ativa
    const salaResult = await pool.query('SELECT ativo FROM sala WHERE id = $1', [sala_id]);
    if (salaResult.rowCount === 0) return res.status(400).json({ error: 'Sala não encontrada' });
    if (!salaResult.rows[0].ativo) return res.status(400).json({ error: 'Sala inativa' });

    // Verificar conflito de horário
    const conflito = await pool.query(
      `SELECT id FROM reserva
       WHERE sala_id = $1 AND data = $2 AND turno = $3 AND aula_numero = $4 AND status = 'ativa'`,
      [sala_id, data, turno, aulaNum]
    );
    if (conflito.rowCount > 0) {
      return res.status(400).json({ error: 'Sala já reservada nesse horário' });
    }

    const { hora_inicio, hora_fim } = HORARIOS[turno][aulaNum];
    const criador = criado_por || usuario_id;

    const { rows } = await pool.query(
      `INSERT INTO reserva (sala_id, usuario_id, criado_por, data, turno, aula_numero, hora_inicio, hora_fim, disciplina, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ativa')
       RETURNING *`,
      [sala_id, usuario_id, criador, data, turno, aulaNum, hora_inicio, hora_fim, disciplina || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/reservas/{id}/cancelar:
 *   patch:
 *     summary: Cancela uma reserva ativa
 *     tags: [Reservas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cancelado_por:
 *                 type: string
 *                 format: uuid
 *                 description: ID do usuário que está cancelando
 *             required:
 *               - cancelado_por
 *           example:
 *             cancelado_por: "uuid-do-usuario"
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reserva cancelada com sucesso
 *       400:
 *         description: Reserva não está ativa
 *       401:
 *         description: Token não fornecido ou inválido
 *       404:
 *         description: Reserva não encontrada
 *       500:
 *         description: Erro interno
 */
router.patch('/:id/cancelar', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { cancelado_por } = req.body;

  if (!cancelado_por) {
    return res.status(400).json({ error: 'Campo obrigatório: cancelado_por' });
  }

  try {
    const reservaResult = await pool.query('SELECT status FROM reserva WHERE id = $1', [id]);
    if (reservaResult.rowCount === 0) return res.status(404).json({ error: 'Reserva não encontrada' });
    if (reservaResult.rows[0].status !== 'ativa') {
      return res.status(400).json({ error: 'Apenas reservas ativas podem ser canceladas' });
    }

    const { rows } = await pool.query(
      `UPDATE reserva
       SET status = 'cancelada', cancelado_em = NOW(), cancelado_por = $1
       WHERE id = $2
       RETURNING *`,
      [cancelado_por, id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
