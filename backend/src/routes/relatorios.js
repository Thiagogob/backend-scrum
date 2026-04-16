const { Router } = require('express');
const pool = require('../config/db');

const router = Router();

const MESES = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/**
 * @swagger
 * tags:
 *   name: Relatórios
 *   description: |
 *     Consulta de utilização dos espaços para administradores.
 *
 *     ---
 *
 *     ## Como usar — Guia rápido para o frontend
 *
 *     ### Diário — salas utilizadas e reservadas em um dia
 *     ```
 *     GET /api/relatorios/diario?data=2026-04-16
 *     ```
 *     Retorna o resumo do dia (totais por status) + lista completa de reservas com dados da sala e do professor.
 *
 *     ---
 *
 *     ### Semanal — ocupação ao longo de uma semana
 *     ```
 *     GET /api/relatorios/semanal?data_inicio=2026-04-14&data_fim=2026-04-20
 *     ```
 *     Retorna totais por dia no período + lista de reservas. `data_inicio` e `data_fim` são inclusivos.
 *     Para a semana atual use a segunda-feira e domingo da semana.
 *
 *     ---
 *
 *     ### Mensal — total de reservas e salas no mês
 *     ```
 *     GET /api/relatorios/mensal?mes=4&ano=2026
 *     ```
 *     Retorna resumo do mês + ranking de salas mais utilizadas + totais por dia.
 *
 *     ---
 *
 *     ### Semestral — visão ampla por mês ao longo do semestre
 *     ```
 *     GET /api/relatorios/semestral?semestre=1&ano=2026
 *     GET /api/relatorios/semestral?semestre=2&ano=2026
 *     ```
 *     `semestre=1` cobre Janeiro–Junho. `semestre=2` cobre Julho–Dezembro.
 *     Retorna totais agrupados por mês.
 *
 *     ---
 *
 *     ### Campos comuns na resposta
 *     - `total_reservas` — reservas ativas + concluídas (exclui canceladas)
 *     - `canceladas` — reservas canceladas no período
 *     - `salas_utilizadas` — número de salas distintas com pelo menos uma reserva não-cancelada
 */

// ──────────────────────────────────────────────────────────────────────────────
// DIÁRIO
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/relatorios/diario:
 *   get:
 *     summary: Relatório diário de utilização das salas
 *     tags: [Relatórios]
 *     description: |
 *       Retorna o resumo de ocupação de um dia específico e a lista completa de reservas desse dia.
 *
 *       **Como usar:**
 *       ```
 *       GET /api/relatorios/diario?data=2026-04-16
 *       ```
 *
 *       **Resposta inclui:**
 *       - `resumo`: contagem de reservas por status e número de salas utilizadas
 *       - `reservas`: lista com dados de sala, professor, turno, aula e horário
 *     parameters:
 *       - in: query
 *         name: data
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: "Data do relatório (YYYY-MM-DD). Ex: 2026-04-16"
 *         example: "2026-04-16"
 *     responses:
 *       200:
 *         description: Relatório diário gerado com sucesso
 *         content:
 *           application/json:
 *             example:
 *               data: "2026-04-16"
 *               resumo:
 *                 total_reservas: 12
 *                 ativas: 10
 *                 concluidas: 2
 *                 canceladas: 1
 *                 salas_utilizadas: 8
 *               reservas:
 *                 - sala_id: "uuid-sala"
 *                   nome_numero: "B-101"
 *                   bloco: "Bloco B"
 *                   tipo_sala: "sala_aula"
 *                   turno: "matutino"
 *                   aula_numero: 1
 *                   hora_inicio: "08:00"
 *                   hora_fim: "08:50"
 *                   status: "ativa"
 *                   disciplina: "Banco de Dados"
 *                   usuario_nome: "Prof. João Silva"
 *       400:
 *         description: Parâmetro obrigatório ausente
 *         content:
 *           application/json:
 *             example:
 *               error: "Parâmetro obrigatório: data"
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/diario', async (req, res) => {
  const { data } = req.query;
  if (!data) return res.status(400).json({ error: 'Parâmetro obrigatório: data' });

  try {
    const [resumoResult, reservasResult] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)                                              AS total_geral,
           COUNT(*) FILTER (WHERE status != 'cancelada')        AS total_reservas,
           COUNT(*) FILTER (WHERE status = 'ativa')             AS ativas,
           COUNT(*) FILTER (WHERE status = 'concluida')         AS concluidas,
           COUNT(*) FILTER (WHERE status = 'cancelada')         AS canceladas,
           COUNT(DISTINCT sala_id) FILTER (WHERE status != 'cancelada') AS salas_utilizadas
         FROM reserva
         WHERE data = $1`,
        [data]
      ),
      pool.query(
        `SELECT
           r.id, r.sala_id, r.usuario_id, r.turno, r.aula_numero,
           r.hora_inicio, r.hora_fim, r.status, r.disciplina, r.criado_em,
           s.nome_numero, s.bloco, s.tipo_sala,
           u.nome AS usuario_nome
         FROM reserva r
         JOIN sala    s ON s.id = r.sala_id
         JOIN usuario u ON u.id = r.usuario_id
         WHERE r.data = $1
         ORDER BY r.turno, r.aula_numero, s.bloco, s.nome_numero`,
        [data]
      ),
    ]);

    const r = resumoResult.rows[0];
    res.json({
      data,
      resumo: {
        total_reservas:   parseInt(r.total_reservas),
        ativas:           parseInt(r.ativas),
        concluidas:       parseInt(r.concluidas),
        canceladas:       parseInt(r.canceladas),
        salas_utilizadas: parseInt(r.salas_utilizadas),
      },
      reservas: reservasResult.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// SEMANAL
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/relatorios/semanal:
 *   get:
 *     summary: Relatório semanal de ocupação dos espaços
 *     tags: [Relatórios]
 *     description: |
 *       Retorna a ocupação dos espaços ao longo de um período (tipicamente uma semana).
 *
 *       **Como usar:**
 *       ```
 *       GET /api/relatorios/semanal?data_inicio=2026-04-14&data_fim=2026-04-20
 *       ```
 *
 *       **Resposta inclui:**
 *       - `resumo`: totais do período completo
 *       - `por_dia`: contagem de reservas e salas utilizadas para cada dia
 *       - `reservas`: lista completa de reservas no período
 *     parameters:
 *       - in: query
 *         name: data_inicio
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: "Primeiro dia do período (YYYY-MM-DD). Ex: 2026-04-14"
 *         example: "2026-04-14"
 *       - in: query
 *         name: data_fim
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: "Último dia do período, inclusivo (YYYY-MM-DD). Ex: 2026-04-20"
 *         example: "2026-04-20"
 *     responses:
 *       200:
 *         description: Relatório semanal gerado com sucesso
 *         content:
 *           application/json:
 *             example:
 *               data_inicio: "2026-04-14"
 *               data_fim: "2026-04-20"
 *               resumo:
 *                 total_reservas: 45
 *                 canceladas: 3
 *                 salas_utilizadas: 12
 *               por_dia:
 *                 - data: "2026-04-14"
 *                   total_reservas: 8
 *                   canceladas: 0
 *                   salas_utilizadas: 5
 *                 - data: "2026-04-15"
 *                   total_reservas: 10
 *                   canceladas: 1
 *                   salas_utilizadas: 7
 *               reservas:
 *                 - nome_numero: "B-101"
 *                   bloco: "Bloco B"
 *                   data: "2026-04-14"
 *                   turno: "matutino"
 *                   aula_numero: 1
 *                   hora_inicio: "08:00"
 *                   hora_fim: "08:50"
 *                   status: "ativa"
 *                   usuario_nome: "Prof. João Silva"
 *       400:
 *         description: Parâmetros obrigatórios ausentes
 *         content:
 *           application/json:
 *             example:
 *               error: "Parâmetros obrigatórios: data_inicio, data_fim"
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/semanal', async (req, res) => {
  const { data_inicio, data_fim } = req.query;
  if (!data_inicio || !data_fim) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios: data_inicio, data_fim' });
  }

  try {
    const [resumoResult, porDiaResult, reservasResult] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status != 'cancelada') AS total_reservas,
           COUNT(*) FILTER (WHERE status = 'cancelada')  AS canceladas,
           COUNT(DISTINCT sala_id) FILTER (WHERE status != 'cancelada') AS salas_utilizadas
         FROM reserva
         WHERE data BETWEEN $1 AND $2`,
        [data_inicio, data_fim]
      ),
      pool.query(
        `SELECT
           data,
           COUNT(*) FILTER (WHERE status != 'cancelada') AS total_reservas,
           COUNT(*) FILTER (WHERE status = 'cancelada')  AS canceladas,
           COUNT(DISTINCT sala_id) FILTER (WHERE status != 'cancelada') AS salas_utilizadas
         FROM reserva
         WHERE data BETWEEN $1 AND $2
         GROUP BY data
         ORDER BY data`,
        [data_inicio, data_fim]
      ),
      pool.query(
        `SELECT
           r.id, r.sala_id, r.data, r.turno, r.aula_numero,
           r.hora_inicio, r.hora_fim, r.status, r.disciplina,
           s.nome_numero, s.bloco, s.tipo_sala,
           u.nome AS usuario_nome
         FROM reserva r
         JOIN sala    s ON s.id = r.sala_id
         JOIN usuario u ON u.id = r.usuario_id
         WHERE r.data BETWEEN $1 AND $2
         ORDER BY r.data, r.turno, r.aula_numero`,
        [data_inicio, data_fim]
      ),
    ]);

    const r = resumoResult.rows[0];
    res.json({
      data_inicio,
      data_fim,
      resumo: {
        total_reservas:   parseInt(r.total_reservas),
        canceladas:       parseInt(r.canceladas),
        salas_utilizadas: parseInt(r.salas_utilizadas),
      },
      por_dia: porDiaResult.rows.map(d => ({
        data:             d.data,
        total_reservas:   parseInt(d.total_reservas),
        canceladas:       parseInt(d.canceladas),
        salas_utilizadas: parseInt(d.salas_utilizadas),
      })),
      reservas: reservasResult.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// MENSAL
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/relatorios/mensal:
 *   get:
 *     summary: Relatório mensal de reservas e salas ocupadas
 *     tags: [Relatórios]
 *     description: |
 *       Retorna o total de reservas e salas utilizadas no mês, com ranking de salas e distribuição por dia.
 *
 *       **Como usar:**
 *       ```
 *       GET /api/relatorios/mensal?mes=4&ano=2026
 *       ```
 *
 *       **Resposta inclui:**
 *       - `resumo`: totais do mês (reservas, salas utilizadas, professores ativos)
 *       - `por_sala`: ranking das salas mais utilizadas no mês
 *       - `por_dia`: distribuição de reservas por dia
 *     parameters:
 *       - in: query
 *         name: mes
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         description: "Número do mês (1–12). Ex: 4 para Abril"
 *         example: 4
 *       - in: query
 *         name: ano
 *         required: true
 *         schema:
 *           type: integer
 *         description: "Ano com 4 dígitos. Ex: 2026"
 *         example: 2026
 *     responses:
 *       200:
 *         description: Relatório mensal gerado com sucesso
 *         content:
 *           application/json:
 *             example:
 *               mes: 4
 *               nome_mes: "Abril"
 *               ano: 2026
 *               resumo:
 *                 total_reservas: 180
 *                 canceladas: 12
 *                 salas_utilizadas: 15
 *                 professores_ativos: 22
 *               por_sala:
 *                 - sala_id: "uuid-sala"
 *                   nome_numero: "B-101"
 *                   bloco: "Bloco B"
 *                   tipo_sala: "sala_aula"
 *                   total_reservas: 28
 *               por_dia:
 *                 - data: "2026-04-01"
 *                   total_reservas: 10
 *                   canceladas: 1
 *                   salas_utilizadas: 6
 *       400:
 *         description: Parâmetros obrigatórios ausentes ou inválidos
 *         content:
 *           application/json:
 *             example:
 *               error: "Parâmetros obrigatórios: mes (1-12), ano"
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/mensal', async (req, res) => {
  const mes = parseInt(req.query.mes);
  const ano = parseInt(req.query.ano);

  if (!mes || !ano || mes < 1 || mes > 12) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios: mes (1-12), ano' });
  }

  try {
    const [resumoResult, porSalaResult, porDiaResult] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status != 'cancelada')        AS total_reservas,
           COUNT(*) FILTER (WHERE status = 'cancelada')         AS canceladas,
           COUNT(DISTINCT sala_id)    FILTER (WHERE status != 'cancelada') AS salas_utilizadas,
           COUNT(DISTINCT usuario_id) FILTER (WHERE status != 'cancelada') AS professores_ativos
         FROM reserva
         WHERE EXTRACT(MONTH FROM data) = $1 AND EXTRACT(YEAR FROM data) = $2`,
        [mes, ano]
      ),
      pool.query(
        `SELECT
           s.id AS sala_id, s.nome_numero, s.bloco, s.tipo_sala,
           COUNT(r.id) FILTER (WHERE r.status != 'cancelada') AS total_reservas
         FROM sala s
         LEFT JOIN reserva r
           ON r.sala_id = s.id
           AND EXTRACT(MONTH FROM r.data) = $1
           AND EXTRACT(YEAR  FROM r.data) = $2
         GROUP BY s.id, s.nome_numero, s.bloco, s.tipo_sala
         ORDER BY total_reservas DESC, s.bloco, s.nome_numero`,
        [mes, ano]
      ),
      pool.query(
        `SELECT
           data,
           COUNT(*) FILTER (WHERE status != 'cancelada') AS total_reservas,
           COUNT(*) FILTER (WHERE status = 'cancelada')  AS canceladas,
           COUNT(DISTINCT sala_id) FILTER (WHERE status != 'cancelada') AS salas_utilizadas
         FROM reserva
         WHERE EXTRACT(MONTH FROM data) = $1 AND EXTRACT(YEAR FROM data) = $2
         GROUP BY data
         ORDER BY data`,
        [mes, ano]
      ),
    ]);

    const r = resumoResult.rows[0];
    res.json({
      mes,
      nome_mes: MESES[mes],
      ano,
      resumo: {
        total_reservas:     parseInt(r.total_reservas),
        canceladas:         parseInt(r.canceladas),
        salas_utilizadas:   parseInt(r.salas_utilizadas),
        professores_ativos: parseInt(r.professores_ativos),
      },
      por_sala: porSalaResult.rows.map(s => ({
        sala_id:        s.sala_id,
        nome_numero:    s.nome_numero,
        bloco:          s.bloco,
        tipo_sala:      s.tipo_sala,
        total_reservas: parseInt(s.total_reservas),
      })),
      por_dia: porDiaResult.rows.map(d => ({
        data:             d.data,
        total_reservas:   parseInt(d.total_reservas),
        canceladas:       parseInt(d.canceladas),
        salas_utilizadas: parseInt(d.salas_utilizadas),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// SEMESTRAL
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/relatorios/semestral:
 *   get:
 *     summary: Relatório semestral de utilização agrupado por mês
 *     tags: [Relatórios]
 *     description: |
 *       Retorna a visão ampla de utilização dos espaços ao longo de um semestre, agrupada por mês.
 *
 *       **Como usar:**
 *       ```
 *       GET /api/relatorios/semestral?semestre=1&ano=2026
 *       GET /api/relatorios/semestral?semestre=2&ano=2026
 *       ```
 *
 *       **Períodos:**
 *       - `semestre=1` — Janeiro a Junho
 *       - `semestre=2` — Julho a Dezembro
 *
 *       **Resposta inclui:**
 *       - `resumo`: totais do semestre completo
 *       - `por_mes`: totais mensais com nome do mês, reservas e salas utilizadas
 *     parameters:
 *       - in: query
 *         name: semestre
 *         required: true
 *         schema:
 *           type: integer
 *           enum: [1, 2]
 *         description: "1 = Janeiro–Junho, 2 = Julho–Dezembro"
 *         example: 1
 *       - in: query
 *         name: ano
 *         required: true
 *         schema:
 *           type: integer
 *         description: "Ano com 4 dígitos. Ex: 2026"
 *         example: 2026
 *     responses:
 *       200:
 *         description: Relatório semestral gerado com sucesso
 *         content:
 *           application/json:
 *             example:
 *               semestre: 1
 *               ano: 2026
 *               periodo:
 *                 inicio: "2026-01-01"
 *                 fim: "2026-06-30"
 *               resumo:
 *                 total_reservas: 820
 *                 canceladas: 48
 *                 salas_utilizadas: 18
 *               por_mes:
 *                 - mes: 1
 *                   nome_mes: "Janeiro"
 *                   total_reservas: 95
 *                   canceladas: 5
 *                   salas_utilizadas: 12
 *                 - mes: 2
 *                   nome_mes: "Fevereiro"
 *                   total_reservas: 140
 *                   canceladas: 8
 *                   salas_utilizadas: 15
 *       400:
 *         description: Parâmetros obrigatórios ausentes ou inválidos
 *         content:
 *           application/json:
 *             example:
 *               error: "Parâmetros obrigatórios: semestre (1 ou 2), ano"
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/semestral', async (req, res) => {
  const semestre = parseInt(req.query.semestre);
  const ano      = parseInt(req.query.ano);

  if (!semestre || !ano || ![1, 2].includes(semestre)) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios: semestre (1 ou 2), ano' });
  }

  const mesInicio = semestre === 1 ? 1 : 7;
  const mesFim    = semestre === 1 ? 6 : 12;
  const dataInicio = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
  // Last day of the semester: first day of the next month minus 1
  const dataFim = semestre === 1 ? `${ano}-06-30` : `${ano}-12-31`;

  try {
    const [resumoResult, porMesResult] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status != 'cancelada')        AS total_reservas,
           COUNT(*) FILTER (WHERE status = 'cancelada')         AS canceladas,
           COUNT(DISTINCT sala_id) FILTER (WHERE status != 'cancelada') AS salas_utilizadas
         FROM reserva
         WHERE data BETWEEN $1 AND $2`,
        [dataInicio, dataFim]
      ),
      pool.query(
        `SELECT
           EXTRACT(MONTH FROM data)::int                        AS mes,
           COUNT(*) FILTER (WHERE status != 'cancelada')        AS total_reservas,
           COUNT(*) FILTER (WHERE status = 'cancelada')         AS canceladas,
           COUNT(DISTINCT sala_id) FILTER (WHERE status != 'cancelada') AS salas_utilizadas
         FROM reserva
         WHERE data BETWEEN $1 AND $2
         GROUP BY EXTRACT(MONTH FROM data)
         ORDER BY mes`,
        [dataInicio, dataFim]
      ),
    ]);

    const r = resumoResult.rows[0];
    res.json({
      semestre,
      ano,
      periodo: { inicio: dataInicio, fim: dataFim },
      resumo: {
        total_reservas:   parseInt(r.total_reservas),
        canceladas:       parseInt(r.canceladas),
        salas_utilizadas: parseInt(r.salas_utilizadas),
      },
      por_mes: porMesResult.rows.map(m => ({
        mes:              m.mes,
        nome_mes:         MESES[m.mes],
        total_reservas:   parseInt(m.total_reservas),
        canceladas:       parseInt(m.canceladas),
        salas_utilizadas: parseInt(m.salas_utilizadas),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
