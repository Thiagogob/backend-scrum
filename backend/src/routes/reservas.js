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
 *     summary: Retorna a tabela de horários por turno e número de aula
 *     tags: [Reservas]
 *     description: |
 *       Retorna o mapa completo de horários do sistema. Use esta rota para popular dropdowns e exibir horários reais no frontend, sem precisar hardcodar os valores.
 *
 *       **Como usar:**
 *       1. Chame esta rota uma vez ao carregar a tela de reservas
 *       2. Quando o usuário escolher um `turno` e um `aula_numero`, exiba `horarios[turno][aula_numero].hora_inicio` e `hora_fim`
 *       3. Envie apenas `turno` e `aula_numero` no corpo da reserva — o backend calcula os horários automaticamente
 *
 *       **Tabela de horários:**
 *       | Turno | Aula 1 | Aula 2 | Aula 3 | Aula 4 |
 *       |---|---|---|---|---|
 *       | Matutino | 08:00–08:50 | 08:55–09:45 | 09:55–10:45 | 10:50–11:40 |
 *       | Vespertino | 13:00–13:50 | 13:55–14:45 | 14:55–15:45 | 15:50–16:40 |
 *       | Noturno | 19:00–19:50 | 19:55–20:45 | 20:55–21:45 | 21:50–22:40 |
 *     responses:
 *       200:
 *         description: Tabela de horários retornada com sucesso
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
 *     description: |
 *       Retorna as salas que **não possuem reserva ativa** para a data, turno e (opcionalmente) número de aula informados.
 *
 *       **Parâmetros obrigatórios:** `data` e `turno`
 *
 *       **Comportamento do filtro `aula_numero`:**
 *       - Se informado: retorna salas livres especificamente naquela aula
 *       - Se omitido: retorna salas que não possuem **nenhuma** reserva em qualquer aula do turno
 *
 *       **Exemplo de uso típico no frontend:**
 *       1. Usuário escolhe data e turno → chame esta rota para listar salas disponíveis
 *       2. Usuário escolhe uma sala e uma aula → chame `POST /api/reservas` para confirmar
 *     parameters:
 *       - in: query
 *         name: data
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: 'Data da consulta no formato YYYY-MM-DD. Ex: 2026-04-10'
 *       - in: query
 *         name: turno
 *         required: true
 *         schema:
 *           type: string
 *           enum: [matutino, vespertino, noturno]
 *         description: Turno a ser consultado
 *       - in: query
 *         name: aula_numero
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 4
 *         description: 'Número da aula (1–4). Se omitido, verifica disponibilidade em todas as aulas do turno'
 *       - in: query
 *         name: tipo_sala
 *         schema:
 *           type: string
 *           enum: [sala_aula, laboratorio]
 *         description: Filtra pelo tipo de espaço (opcional)
 *     responses:
 *       200:
 *         description: Lista de salas disponíveis no período informado
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Sala'
 *       400:
 *         description: Parâmetros obrigatórios não informados ou turno inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               params_faltando:
 *                 summary: data ou turno ausente
 *                 value:
 *                   error: "Parâmetros obrigatórios: data, turno"
 *               turno_invalido:
 *                 summary: Turno inválido
 *                 value:
 *                   error: "turno deve ser \"matutino\", \"vespertino\" ou \"noturno\""
 *       500:
 *         description: Erro interno do servidor
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
 *     description: |
 *       Retorna as reservas cadastradas no sistema. Sem filtros, retorna todas as reservas.
 *       Combine os filtros para buscar reservas específicas.
 *
 *       **Campos extras na resposta** (além dos campos da reserva):
 *       - `nome_numero`: nome/número da sala reservada
 *       - `bloco`: bloco da sala
 *       - `tipo_sala`: tipo da sala
 *       - `usuario_nome`: nome do professor que fez a reserva
 *
 *       **Exemplos de uso:**
 *       - Reservas de um professor: `?usuario_id=<uuid>`
 *       - Reservas de uma sala hoje: `?sala_id=<uuid>&data=2026-04-07`
 *       - Todas as reservas ativas do turno noturno: `?status=ativa&turno=noturno`
 *     parameters:
 *       - in: query
 *         name: usuario_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filtra as reservas de um professor específico
 *       - in: query
 *         name: sala_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filtra as reservas de uma sala específica
 *       - in: query
 *         name: data
 *         schema:
 *           type: string
 *           format: date
 *         description: 'Filtra por data (YYYY-MM-DD). Ex: 2026-04-10'
 *       - in: query
 *         name: turno
 *         schema:
 *           type: string
 *           enum: [matutino, vespertino, noturno]
 *         description: Filtra pelo turno
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ativa, cancelada, concluida]
 *         description: 'Filtra pelo status da reserva. Use "ativa" para ver apenas reservas em vigor'
 *     responses:
 *       200:
 *         description: Lista de reservas retornada com sucesso. Reservas futuras aparecem primeiro (mais próxima de hoje primeiro), seguidas das passadas (mais recente primeiro). Dentro do mesmo dia, ordenadas por horário de início.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Reserva'
 *       500:
 *         description: Erro interno do servidor
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

  // Use Brazil's current date (UTC-3) as the reference for sorting
  const hojeStrBR = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  values.push(hojeStrBR);
  const hojeParam = `$${values.length}::date`;

  try {
    const { rows } = await pool.query(
      `SELECT r.*,
              s.nome_numero, s.bloco, s.tipo_sala,
              u.nome AS usuario_nome
       FROM reserva r
       JOIN sala s ON s.id = r.sala_id
       JOIN usuario u ON u.id = r.usuario_id
       ${where}
       ORDER BY
         CASE WHEN r.data >= ${hojeParam} THEN 0 ELSE 1 END ASC,
         CASE
           WHEN r.data >= ${hojeParam} THEN (r.data - ${hojeParam})
           ELSE (${hojeParam} - r.data)
         END ASC,
         r.hora_inicio ASC`,
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
 *     description: |
 *       Retorna os dados completos de uma reserva específica.
 *
 *       **Campos extras na resposta** (além dos campos padrão da reserva):
 *       - `nome_numero`: nome/número da sala reservada
 *       - `bloco`: bloco onde a sala está localizada
 *       - `tipo_sala`: tipo da sala (`sala_aula` ou `laboratorio`)
 *       - `usuario_nome`: nome do professor para quem a reserva foi feita
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID único da reserva (UUID)
 *     responses:
 *       200:
 *         description: Reserva encontrada com dados da sala e do usuário
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reserva'
 *       404:
 *         description: Nenhuma reserva encontrada com o ID informado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Reserva não encontrada"
 *       500:
 *         description: Erro interno do servidor
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
 *     summary: Cria uma nova reserva de sala ou laboratório
 *     tags: [Reservas]
 *     description: |
 *       Cria uma reserva para um professor em uma sala específica. **Requer autenticação.**
 *
 *       **Campos obrigatórios:** `sala_id`, `usuario_id`, `data`, `turno`, `aula_numero`
 *
 *       **Como o horário é calculado:**
 *       Você **não** precisa enviar `hora_inicio` e `hora_fim`. O backend calcula automaticamente com base no `turno` e `aula_numero`. Consulte `GET /api/reservas/horarios` para ver a tabela completa.
 *
 *       **Campo `criado_por`:**
 *       - Se um **professor** está criando sua própria reserva: **omita este campo** (o backend usa o `usuario_id` automaticamente)
 *       - Se um **admin_cpd** está criando em nome de um professor: envie o ID do admin neste campo
 *
 *       **Regras de negócio aplicadas:**
 *       - ❌ Datas passadas não são permitidas
 *       - ❌ Horários já passados no dia atual não são permitidos
 *       - ❌ Professores só podem reservar dentro do mês corrente
 *       - ❌ Uma sala não pode ter duas reservas ativas no mesmo turno e aula
 *       - ❌ Salas inativas não podem ser reservadas
 *
 *       **Fluxo recomendado no frontend:**
 *       1. Chame `GET /api/reservas/disponibilidade?data=...&turno=...` para listar salas livres
 *       2. Usuário escolhe a sala e a aula
 *       3. Chame este endpoint com os dados selecionados
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReservaInput'
 *           example:
 *             sala_id: "uuid-da-sala"
 *             usuario_id: "uuid-do-professor"
 *             criado_por: "uuid-do-admin-cpd"
 *             data: "2026-04-10"
 *             turno: "matutino"
 *             aula_numero: 1
 *             disciplina: "Banco de Dados"
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Reserva criada com sucesso. Retorna o registro completo com `hora_inicio` e `hora_fim` calculados.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reserva'
 *       400:
 *         description: Dados inválidos ou regra de negócio violada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               campos_faltando:
 *                 summary: Campos obrigatórios ausentes
 *                 value:
 *                   error: "Campos obrigatórios: sala_id, usuario_id, data, turno, aula_numero"
 *               data_passada:
 *                 summary: Data no passado
 *                 value:
 *                   error: "Não é permitido fazer reservas em datas passadas"
 *               horario_passado:
 *                 summary: Horário já passou no dia atual
 *                 value:
 *                   error: "Não é permitido fazer reservas em horários já passados"
 *               mes_diferente:
 *                 summary: Professor tentando reservar fora do mês corrente
 *                 value:
 *                   error: "Professores só podem reservar salas dentro do mês corrente"
 *               conflito:
 *                 summary: Sala já reservada nesse horário
 *                 value:
 *                   error: "Sala já reservada nesse horário"
 *               sala_inativa:
 *                 summary: Sala inativa
 *                 value:
 *                   error: "Sala inativa"
 *       401:
 *         description: Token JWT não enviado ou inválido. Faça login em POST /api/auth/login para obter o token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Token de autenticação não fornecido"
 *       500:
 *         description: Erro interno do servidor
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

  // Validação: não permitir reservas retroativas (horário de Brasília UTC-3)
  const agora = new Date();
  const TZ = 'America/Sao_Paulo';
  const hojeStrBR = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(agora); // YYYY-MM-DD
  if (data < hojeStrBR) {
    return res.status(400).json({ error: 'Não é permitido fazer reservas em datas passadas' });
  }

  // Validação: não permitir horários já passados no dia atual
  if (data === hojeStrBR) {
    const { hora_inicio } = HORARIOS[turno][aulaNum];
    const [hh, mm] = hora_inicio.split(':').map(Number);
    const agoraBR = new Date(agora.toLocaleString('en-US', { timeZone: TZ }));
    const minutosAgora = agoraBR.getHours() * 60 + agoraBR.getMinutes();
    const minutosSlot = hh * 60 + mm;
    if (minutosAgora > minutosSlot) {
      return res.status(400).json({ error: 'Não é permitido fazer reservas em horários já passados' });
    }
  }

  try {
    // Validação: professor só pode reservar no mês corrente
    const usuarioResult = await pool.query('SELECT tipo FROM usuario WHERE id = $1', [usuario_id]);
    if (usuarioResult.rowCount === 0) return res.status(400).json({ error: 'Usuário não encontrado' });

    if (usuarioResult.rows[0].tipo === 'professor') {
      const agoraBR = new Date(agora.toLocaleString('en-US', { timeZone: TZ }));
      const mesAtual = agoraBR.getMonth();
      const anoAtual = agoraBR.getFullYear();
      const dataReserva = new Date(data + 'T00:00:00');
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
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Sala já reservada nesse horário' });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/reservas/{id}:
 *   patch:
 *     summary: Edita uma reserva ativa
 *     tags: [Reservas]
 *     description: |
 *       Atualiza os dados de uma reserva com status `ativa`. **Requer autenticação.**
 *
 *       Também aceita **PUT** no mesmo endpoint (`PUT /api/reservas/{id}`) com comportamento idêntico.
 *
 *       Todos os campos são opcionais — envie apenas o que deseja alterar.
 *
 *       > ⚠️ **`hora_inicio` e `hora_fim` não são campos de entrada.** Para alterar o horário da reserva,
 *       > envie `turno` e/ou `aula_numero`. O backend recalcula `hora_inicio` e `hora_fim` automaticamente
 *       > e os retorna na resposta. Consulte `GET /api/reservas/horarios` para ver a tabela de horários.
 *
 *       **Regras de negócio aplicadas:**
 *       - ❌ Datas passadas não são permitidas
 *       - ❌ Horários já passados no dia atual não são permitidos
 *       - ❌ Professores só podem reservar dentro do mês corrente
 *       - ❌ Conflito de horário com outra reserva ativa na mesma sala (exceto a própria)
 *       - ❌ Salas inativas não podem ser reservadas
 *       - ❌ Só é possível editar reservas com status `ativa`
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID da reserva a ser editada
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sala_id:
 *                 type: string
 *                 format: uuid
 *               data:
 *                 type: string
 *                 format: date
 *               turno:
 *                 type: string
 *                 enum: [matutino, vespertino, noturno]
 *               aula_numero:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 4
 *               disciplina:
 *                 type: string
 *           example:
 *             sala_id: "uuid-da-nova-sala"
 *             data: "2026-04-15"
 *             turno: "vespertino"
 *             aula_numero: 2
 *             disciplina: "Algoritmos"
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reserva atualizada com sucesso. `hora_inicio` e `hora_fim` são calculados automaticamente pelo backend com base em `turno` e `aula_numero`.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reserva'
 *             example:
 *               id: "uuid-da-reserva"
 *               sala_id: "uuid-da-nova-sala"
 *               usuario_id: "uuid-do-professor"
 *               criado_por: "uuid-do-professor"
 *               data: "2026-04-15"
 *               turno: "vespertino"
 *               aula_numero: 2
 *               hora_inicio: "13:55"
 *               hora_fim: "14:45"
 *               status: "ativa"
 *               disciplina: "Algoritmos"
 *               criado_em: "2026-04-10T10:00:00.000Z"
 *               cancelado_em: null
 *               cancelado_por: null
 *       400:
 *         description: Dados inválidos ou regra de negócio violada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               nao_ativa:
 *                 summary: Reserva não está ativa
 *                 value:
 *                   error: "Apenas reservas ativas podem ser editadas"
 *               data_passada:
 *                 summary: Data no passado
 *                 value:
 *                   error: "Não é permitido fazer reservas em datas passadas"
 *               horario_passado:
 *                 summary: Horário já passou no dia atual
 *                 value:
 *                   error: "Não é permitido fazer reservas em horários já passados"
 *               mes_diferente:
 *                 summary: Professor fora do mês corrente
 *                 value:
 *                   error: "Professores só podem reservar salas dentro do mês corrente"
 *               conflito:
 *                 summary: Conflito de horário
 *                 value:
 *                   error: "Sala já reservada nesse horário"
 *               sala_inativa:
 *                 summary: Sala inativa
 *                 value:
 *                   error: "Sala inativa"
 *       401:
 *         description: Token JWT não enviado ou inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Token de autenticação não fornecido"
 *       404:
 *         description: Reserva não encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Reserva não encontrada"
 *       500:
 *         description: Erro interno do servidor
 */
async function editarReserva(req, res) {
  const { id } = req.params;
  const { sala_id, data, turno, aula_numero, disciplina } = req.body;

  if (turno && !['matutino', 'vespertino', 'noturno'].includes(turno)) {
    return res.status(400).json({ error: 'turno deve ser "matutino", "vespertino" ou "noturno"' });
  }
  const aulaNum = aula_numero !== undefined ? Number(aula_numero) : undefined;
  if (aulaNum !== undefined && ![1, 2, 3, 4].includes(aulaNum)) {
    return res.status(400).json({ error: 'aula_numero deve ser 1, 2, 3 ou 4' });
  }

  try {
    const reservaResult = await pool.query('SELECT * FROM reserva WHERE id = $1', [id]);
    if (reservaResult.rowCount === 0) return res.status(404).json({ error: 'Reserva não encontrada' });

    const reserva = reservaResult.rows[0];
    if (reserva.status !== 'ativa') {
      return res.status(400).json({ error: 'Apenas reservas ativas podem ser editadas' });
    }

    // Merge: use new values if provided, otherwise keep existing
    const novaData = data || reserva.data;
    const novoTurno = turno || reserva.turno;
    const novaAula = aulaNum !== undefined ? aulaNum : reserva.aula_numero;
    const novaSalaId = sala_id || reserva.sala_id;

    // Validação: não permitir datas passadas (horário de Brasília UTC-3)
    const agora = new Date();
    const TZ = 'America/Sao_Paulo';
    const hojeStrBR = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(agora); // YYYY-MM-DD
    if (novaData < hojeStrBR) {
      return res.status(400).json({ error: 'Não é permitido fazer reservas em datas passadas' });
    }

    // Validação: não permitir horários já passados no dia atual
    if (novaData === hojeStrBR) {
      const { hora_inicio } = HORARIOS[novoTurno][novaAula];
      const [hh, mm] = hora_inicio.split(':').map(Number);
      const agoraBR = new Date(agora.toLocaleString('en-US', { timeZone: TZ }));
      const minutosAgora = agoraBR.getHours() * 60 + agoraBR.getMinutes();
      const minutosSlot = hh * 60 + mm;
      if (minutosAgora > minutosSlot) {
        return res.status(400).json({ error: 'Não é permitido fazer reservas em horários já passados' });
      }
    }

    // Validação: professor só pode reservar no mês corrente
    const usuarioResult = await pool.query('SELECT tipo FROM usuario WHERE id = $1', [reserva.usuario_id]);
    if (usuarioResult.rows[0].tipo === 'professor') {
      const agoraBR = new Date(agora.toLocaleString('en-US', { timeZone: TZ }));
      const dataReserva = new Date(novaData + 'T00:00:00');
      if (dataReserva.getFullYear() !== agoraBR.getFullYear() || dataReserva.getMonth() !== agoraBR.getMonth()) {
        return res.status(400).json({ error: 'Professores só podem reservar salas dentro do mês corrente' });
      }
    }

    // Verificar se a sala existe e está ativa
    const salaResult = await pool.query('SELECT ativo FROM sala WHERE id = $1', [novaSalaId]);
    if (salaResult.rowCount === 0) return res.status(400).json({ error: 'Sala não encontrada' });
    if (!salaResult.rows[0].ativo) return res.status(400).json({ error: 'Sala inativa' });

    // Verificar conflito (excluindo a própria reserva)
    const conflito = await pool.query(
      `SELECT id FROM reserva
       WHERE sala_id = $1 AND data = $2 AND turno = $3 AND aula_numero = $4 AND status = 'ativa' AND id != $5`,
      [novaSalaId, novaData, novoTurno, novaAula, id]
    );
    if (conflito.rowCount > 0) {
      return res.status(400).json({ error: 'Sala já reservada nesse horário' });
    }

    const { hora_inicio, hora_fim } = HORARIOS[novoTurno][novaAula];
    const novaDisciplina = disciplina !== undefined ? disciplina : reserva.disciplina;

    const { rows } = await pool.query(
      `UPDATE reserva
       SET sala_id = $1, data = $2, turno = $3, aula_numero = $4, hora_inicio = $5, hora_fim = $6, disciplina = $7
       WHERE id = $8
       RETURNING *`,
      [novaSalaId, novaData, novoTurno, novaAula, hora_inicio, hora_fim, novaDisciplina, id]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Sala já reservada nesse horário' });
    }
    res.status(500).json({ error: err.message });
  }
}

/**
 * @swagger
 * /api/reservas/{id}:
 *   put:
 *     summary: Edita uma reserva ativa (alias de PATCH)
 *     tags: [Reservas]
 *     description: |
 *       Comportamento idêntico ao `PATCH /api/reservas/{id}`. Aceito para compatibilidade com clientes que utilizam PUT.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID da reserva a ser editada
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sala_id:
 *                 type: string
 *                 format: uuid
 *               data:
 *                 type: string
 *                 format: date
 *               turno:
 *                 type: string
 *                 enum: [matutino, vespertino, noturno]
 *               aula_numero:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 4
 *               disciplina:
 *                 type: string
 *           example:
 *             sala_id: "uuid-da-nova-sala"
 *             data: "2026-04-15"
 *             turno: "vespertino"
 *             aula_numero: 2
 *             disciplina: "Algoritmos"
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reserva atualizada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reserva'
 *       400:
 *         $ref: '#/components/responses/400'
 *       401:
 *         description: Token JWT não enviado ou inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Token de autenticação não fornecido"
 *       404:
 *         description: Reserva não encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Reserva não encontrada"
 *       500:
 *         description: Erro interno do servidor
 */
router.patch('/:id', authMiddleware, editarReserva);
// Alias PUT para compatibilidade com frontend que usa PUT em vez de PATCH
router.put('/:id', authMiddleware, editarReserva);

/**
 * @swagger
 * /api/reservas/{id}/cancelar:
 *   patch:
 *     summary: Cancela uma reserva ativa
 *     tags: [Reservas]
 *     description: |
 *       Cancela uma reserva que está com status `ativa`. **Requer autenticação.**
 *
 *       **O que acontece ao cancelar:**
 *       - O status da reserva muda para `cancelada`
 *       - Os campos `cancelado_em` (data/hora) e `cancelado_por` (ID do usuário) são preenchidos automaticamente
 *       - A sala fica imediatamente disponível para novas reservas naquele horário
 *
 *       **Regra:** só é possível cancelar reservas com status `ativa`. Reservas já canceladas ou concluídas retornam erro 400.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID da reserva a ser cancelada
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cancelado_por]
 *             properties:
 *               cancelado_por:
 *                 type: string
 *                 format: uuid
 *                 description: ID do usuário que está realizando o cancelamento (o próprio professor ou um admin_cpd)
 *           example:
 *             cancelado_por: "uuid-do-usuario"
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reserva cancelada com sucesso. Retorna o registro atualizado com `status = "cancelada"`.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reserva'
 *       400:
 *         description: Campo obrigatório ausente ou reserva não está ativa
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               campo_faltando:
 *                 summary: cancelado_por não informado
 *                 value:
 *                   error: "Campo obrigatório: cancelado_por"
 *               nao_ativa:
 *                 summary: Reserva já cancelada ou concluída
 *                 value:
 *                   error: "Apenas reservas ativas podem ser canceladas"
 *       401:
 *         description: Token JWT não enviado ou inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Token de autenticação não fornecido"
 *       404:
 *         description: Reserva não encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Reserva não encontrada"
 *       500:
 *         description: Erro interno do servidor
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
