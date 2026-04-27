const { Router } = require('express');
const pool = require('../config/db');
const {
  csvDiario, csvSemanal, csvMensal, csvSemestral,
  pdfDiario, pdfSemanal, pdfMensal, pdfSemestral,
} = require('../utils/exportHelper');

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
 *     GET /api/relatorios/semanal?data_inicio=2026-04-14
 *     ```
 *     Retorna totais por dia no período + lista de reservas. O backend calcula automaticamente `data_fim` como 6 dias após `data_inicio` (janela de 7 dias, inclusiva).
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
 *     ### Exportar para CSV ou PDF
 *     Adicione `&formato=csv` ou `&formato=pdf` a qualquer endpoint de relatório para baixar o arquivo.
 *     ```
 *     GET /api/relatorios/diario?data=2026-04-16&formato=csv
 *     GET /api/relatorios/mensal?mes=4&ano=2026&formato=pdf
 *     ```
 *     - **CSV** — planilha compatível com Excel (UTF-8 BOM), todos os blocos de dados separados por linha em branco
 *     - **PDF** — documento A4 formatado com cabeçalho institucional, métricas destacadas e tabelas de dados, pronto para impressão
 *
 *     ---
 *
 *     ### Campos comuns na resposta JSON
 *     - `total_reservas` — reservas ativas + concluídas (exclui canceladas)
 *     - `canceladas` — reservas canceladas no período
 *     - `salas_utilizadas` — número de salas distintas com pelo menos uma reserva não-cancelada
 */

// Shared formato parameter for Swagger (reused in each endpoint)
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
 *       Retorna o resumo de ocupação de um dia e a lista completa de reservas.
 *
 *       **Resposta inclui:**
 *       - `resumo` — contagens por status (ativas, concluídas, canceladas) e salas utilizadas
 *       - `por_sala` — ranking das salas mais utilizadas no dia (inclui salas com zero reservas)
 *       - `reservas` — lista com sala, professor, turno, aula e horário
 *
 *       Adicione `&formato=csv` ou `&formato=pdf` para exportar.
 *     parameters:
 *       - in: query
 *         name: data
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: "Data do relatório (YYYY-MM-DD). Ex: 2026-04-16"
 *         example: "2026-04-16"
 *       - in: query
 *         name: formato
 *         schema:
 *           type: string
 *           enum: [csv, pdf]
 *         description: |
 *           Formato de exportação. Quando informado, retorna o arquivo para download em vez de JSON.
 *           `csv` — planilha compatível com Excel · `pdf` — documento A4 formatado
 *     responses:
 *       200:
 *         description: |
 *           Relatório diário gerado com sucesso.
 *           O tipo de conteúdo varia conforme o parâmetro `formato`:
 *           - **sem `formato`** → `application/json`
 *           - **`formato=pdf`** → `application/pdf` (download direto)
 *           - **`formato=csv`** → `text/csv` (download direto)
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
 *               por_sala:
 *                 - sala_id: "uuid-sala"
 *                   nome_numero: "B-101"
 *                   bloco: "Bloco B"
 *                   tipo_sala: "sala_aula"
 *                   total_reservas: 4
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
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *               description: "Documento PDF formatado (retornado quando ?formato=pdf)"
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *               description: "Planilha CSV compatível com Excel (retornada quando ?formato=csv)"
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
  const { data, formato } = req.query;
  if (!data) return res.status(400).json({ error: 'Parâmetro obrigatório: data' });

  try {
    const [resumoResult, porSalaResult, reservasResult] = await Promise.all([
      pool.query(
        `SELECT
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
           s.id AS sala_id, s.nome_numero, s.bloco, s.tipo_sala,
           COUNT(r.id) FILTER (WHERE r.status != 'cancelada') AS total_reservas
         FROM sala s
         LEFT JOIN reserva r ON r.sala_id = s.id AND r.data = $1
         GROUP BY s.id, s.nome_numero, s.bloco, s.tipo_sala
         ORDER BY total_reservas DESC, s.bloco, s.nome_numero`,
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
    const payload = {
      data,
      resumo: {
        total_reservas:   parseInt(r.total_reservas),
        ativas:           parseInt(r.ativas),
        concluidas:       parseInt(r.concluidas),
        canceladas:       parseInt(r.canceladas),
        salas_utilizadas: parseInt(r.salas_utilizadas),
      },
      por_sala: porSalaResult.rows.map(s => ({
        sala_id:        s.sala_id,
        nome_numero:    s.nome_numero,
        bloco:          s.bloco,
        tipo_sala:      s.tipo_sala,
        total_reservas: parseInt(s.total_reservas),
      })),
      reservas: reservasResult.rows,
    };

    if (formato === 'csv') {
      const conteudo = csvDiario(payload);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="relatorio-diario-${data}.csv"`);
      return res.send(conteudo);
    }

    if (formato === 'pdf') {
      const buffer = await pdfDiario(payload);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="relatorio-diario-${data}.pdf"`);
      return res.send(buffer);
    }

    res.json(payload);
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
 *       Retorna a ocupação dos espaços ao longo de 7 dias a partir de `data_inicio`.
 *       O backend calcula `data_fim` automaticamente como 6 dias após `data_inicio` (ambos inclusivos).
 *
 *       **Resposta inclui:**
 *       - `resumo` — totais do período completo
 *       - `por_sala` — ranking das salas mais utilizadas no período (inclui salas com zero reservas)
 *       - `por_dia` — contagem de reservas e salas utilizadas para cada dia
 *       - `reservas` — lista completa de reservas no período
 *
 *       Adicione `&formato=csv` ou `&formato=pdf` para exportar.
 *     parameters:
 *       - in: query
 *         name: data_inicio
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: "Primeiro dia da semana (YYYY-MM-DD). Ex: 2026-04-14 — o backend calcula os 7 dias automaticamente."
 *         example: "2026-04-14"
 *       - in: query
 *         name: formato
 *         schema:
 *           type: string
 *           enum: [csv, pdf]
 *         description: |
 *           Formato de exportação. Quando informado, retorna o arquivo para download em vez de JSON.
 *           `csv` — planilha compatível com Excel · `pdf` — documento A4 formatado
 *     responses:
 *       200:
 *         description: |
 *           Relatório semanal gerado com sucesso.
 *           O tipo de conteúdo varia conforme o parâmetro `formato`:
 *           - **sem `formato`** → `application/json`
 *           - **`formato=pdf`** → `application/pdf` (download direto)
 *           - **`formato=csv`** → `text/csv` (download direto)
 *         content:
 *           application/json:
 *             example:
 *               data_inicio: "2026-04-14"
 *               data_fim: "2026-04-20"
 *               resumo:
 *                 total_reservas: 45
 *                 ativas: 38
 *                 concluidas: 4
 *                 canceladas: 3
 *                 salas_utilizadas: 12
 *               por_sala:
 *                 - sala_id: "uuid-sala"
 *                   nome_numero: "B-101"
 *                   bloco: "Bloco B"
 *                   tipo_sala: "sala_aula"
 *                   total_reservas: 10
 *               por_dia:
 *                 - data: "2026-04-14"
 *                   total_reservas: 8
 *                   ativas: 7
 *                   concluidas: 1
 *                   canceladas: 0
 *                   salas_utilizadas: 5
 *                 - data: "2026-04-15"
 *                   total_reservas: 10
 *                   ativas: 8
 *                   concluidas: 1
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
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *               description: "Documento PDF formatado (retornado quando ?formato=pdf)"
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *               description: "Planilha CSV compatível com Excel (retornada quando ?formato=csv)"
 *       400:
 *         description: Parâmetro obrigatório ausente
 *         content:
 *           application/json:
 *             example:
 *               error: "Parâmetro obrigatório: data_inicio"
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/semanal', async (req, res) => {
  const { data_inicio, formato } = req.query;
  if (!data_inicio) {
    return res.status(400).json({ error: 'Parâmetro obrigatório: data_inicio' });
  }

  const inicio = new Date(data_inicio + 'T00:00:00Z');
  const fimDate = new Date(inicio);
  fimDate.setUTCDate(fimDate.getUTCDate() + 6);
  const data_fim = fimDate.toISOString().slice(0, 10);

  try {
    const [resumoResult, porSalaResult, porDiaResult, reservasResult] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status != 'cancelada') AS total_reservas,
           COUNT(*) FILTER (WHERE status = 'ativa')      AS ativas,
           COUNT(*) FILTER (WHERE status = 'concluida')  AS concluidas,
           COUNT(*) FILTER (WHERE status = 'cancelada')  AS canceladas,
           COUNT(DISTINCT sala_id) FILTER (WHERE status != 'cancelada') AS salas_utilizadas
         FROM reserva
         WHERE data BETWEEN $1 AND $2`,
        [data_inicio, data_fim]
      ),
      pool.query(
        `SELECT
           s.id AS sala_id, s.nome_numero, s.bloco, s.tipo_sala,
           COUNT(r.id) FILTER (WHERE r.status != 'cancelada') AS total_reservas
         FROM sala s
         LEFT JOIN reserva r ON r.sala_id = s.id AND r.data BETWEEN $1 AND $2
         GROUP BY s.id, s.nome_numero, s.bloco, s.tipo_sala
         ORDER BY total_reservas DESC, s.bloco, s.nome_numero`,
        [data_inicio, data_fim]
      ),
      pool.query(
        `SELECT
           data,
           COUNT(*) FILTER (WHERE status != 'cancelada') AS total_reservas,
           COUNT(*) FILTER (WHERE status = 'ativa')      AS ativas,
           COUNT(*) FILTER (WHERE status = 'concluida')  AS concluidas,
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
    const payload = {
      data_inicio,
      data_fim,
      resumo: {
        total_reservas:   parseInt(r.total_reservas),
        ativas:           parseInt(r.ativas),
        concluidas:       parseInt(r.concluidas),
        canceladas:       parseInt(r.canceladas),
        salas_utilizadas: parseInt(r.salas_utilizadas),
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
        ativas:           parseInt(d.ativas),
        concluidas:       parseInt(d.concluidas),
        canceladas:       parseInt(d.canceladas),
        salas_utilizadas: parseInt(d.salas_utilizadas),
      })),
      reservas: reservasResult.rows,
    };

    if (formato === 'csv') {
      const conteudo = csvSemanal(payload);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="relatorio-semanal-${data_inicio}-${data_fim}.csv"`);
      return res.send(conteudo);
    }

    if (formato === 'pdf') {
      const buffer = await pdfSemanal(payload);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="relatorio-semanal-${data_inicio}-${data_fim}.pdf"`);
      return res.send(buffer);
    }

    res.json(payload);
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
 *       Retorna totais do mês com ranking de salas e distribuição por dia.
 *
 *       **Resposta inclui:**
 *       - `resumo` — total de reservas, canceladas, salas utilizadas e professores ativos
 *       - `por_sala` — ranking das salas mais utilizadas (inclui salas com zero reservas)
 *       - `por_dia` — distribuição de reservas por dia do mês
 *
 *       Adicione `&formato=csv` ou `&formato=pdf` para exportar.
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
 *       - in: query
 *         name: formato
 *         schema:
 *           type: string
 *           enum: [csv, pdf]
 *         description: |
 *           Formato de exportação. Quando informado, retorna o arquivo para download em vez de JSON.
 *           `csv` — planilha compatível com Excel · `pdf` — documento A4 formatado
 *     responses:
 *       200:
 *         description: |
 *           Relatório mensal gerado com sucesso.
 *           O tipo de conteúdo varia conforme o parâmetro `formato`:
 *           - **sem `formato`** → `application/json`
 *           - **`formato=pdf`** → `application/pdf` (download direto)
 *           - **`formato=csv`** → `text/csv` (download direto)
 *         content:
 *           application/json:
 *             example:
 *               mes: 4
 *               nome_mes: "Abril"
 *               ano: 2026
 *               resumo:
 *                 total_reservas: 180
 *                 ativas: 150
 *                 concluidas: 18
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
 *                   ativas: 8
 *                   concluidas: 1
 *                   canceladas: 1
 *                   salas_utilizadas: 6
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *               description: "Documento PDF formatado (retornado quando ?formato=pdf)"
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *               description: "Planilha CSV compatível com Excel (retornada quando ?formato=csv)"
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
  const mes    = parseInt(req.query.mes);
  const ano    = parseInt(req.query.ano);
  const { formato } = req.query;

  if (!mes || !ano || mes < 1 || mes > 12) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios: mes (1-12), ano' });
  }

  try {
    const [resumoResult, porSalaResult, porDiaResult] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status != 'cancelada')        AS total_reservas,
           COUNT(*) FILTER (WHERE status = 'ativa')             AS ativas,
           COUNT(*) FILTER (WHERE status = 'concluida')         AS concluidas,
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
           COUNT(*) FILTER (WHERE status = 'ativa')      AS ativas,
           COUNT(*) FILTER (WHERE status = 'concluida')  AS concluidas,
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
    const payload = {
      mes,
      nome_mes: MESES[mes],
      ano,
      resumo: {
        total_reservas:     parseInt(r.total_reservas),
        ativas:             parseInt(r.ativas),
        concluidas:         parseInt(r.concluidas),
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
        ativas:           parseInt(d.ativas),
        concluidas:       parseInt(d.concluidas),
        canceladas:       parseInt(d.canceladas),
        salas_utilizadas: parseInt(d.salas_utilizadas),
      })),
    };

    if (formato === 'csv') {
      const conteudo = csvMensal(payload);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="relatorio-mensal-${String(mes).padStart(2, '0')}-${ano}.csv"`);
      return res.send(conteudo);
    }

    if (formato === 'pdf') {
      const buffer = await pdfMensal(payload);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="relatorio-mensal-${String(mes).padStart(2, '0')}-${ano}.pdf"`);
      return res.send(buffer);
    }

    res.json(payload);
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
 *       Retorna a utilização dos espaços ao longo de um semestre, agrupada por mês.
 *
 *       **Períodos:** `semestre=1` → Janeiro–Junho · `semestre=2` → Julho–Dezembro
 *
 *       **Resposta inclui:**
 *       - `resumo` — totais do semestre completo
 *       - `por_sala` — ranking das salas mais utilizadas no semestre (inclui salas com zero reservas)
 *       - `por_mes` — totais mensais com nome do mês, reservas e salas utilizadas
 *
 *       Adicione `&formato=csv` ou `&formato=pdf` para exportar.
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
 *       - in: query
 *         name: formato
 *         schema:
 *           type: string
 *           enum: [csv, pdf]
 *         description: |
 *           Formato de exportação. Quando informado, retorna o arquivo para download em vez de JSON.
 *           `csv` — planilha compatível com Excel · `pdf` — documento A4 formatado
 *     responses:
 *       200:
 *         description: |
 *           Relatório semestral gerado com sucesso.
 *           O tipo de conteúdo varia conforme o parâmetro `formato`:
 *           - **sem `formato`** → `application/json`
 *           - **`formato=pdf`** → `application/pdf` (download direto)
 *           - **`formato=csv`** → `text/csv` (download direto)
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
 *                 ativas: 680
 *                 concluidas: 92
 *                 canceladas: 48
 *                 salas_utilizadas: 18
 *               por_sala:
 *                 - sala_id: "uuid-sala"
 *                   nome_numero: "B-101"
 *                   bloco: "Bloco B"
 *                   tipo_sala: "sala_aula"
 *                   total_reservas: 95
 *               por_mes:
 *                 - mes: 1
 *                   nome_mes: "Janeiro"
 *                   total_reservas: 95
 *                   ativas: 82
 *                   concluidas: 8
 *                   canceladas: 5
 *                   salas_utilizadas: 12
 *                 - mes: 2
 *                   nome_mes: "Fevereiro"
 *                   total_reservas: 140
 *                   ativas: 118
 *                   concluidas: 14
 *                   canceladas: 8
 *                   salas_utilizadas: 15
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *               description: "Documento PDF formatado (retornado quando ?formato=pdf)"
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *               description: "Planilha CSV compatível com Excel (retornada quando ?formato=csv)"
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
  const { formato } = req.query;

  if (!semestre || !ano || ![1, 2].includes(semestre)) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios: semestre (1 ou 2), ano' });
  }

  const mesInicio  = semestre === 1 ? 1 : 7;
  const dataInicio = `${ano}-${String(mesInicio).padStart(2, '0')}-01`;
  const dataFim    = semestre === 1 ? `${ano}-06-30` : `${ano}-12-31`;

  try {
    const [resumoResult, porSalaResult, porMesResult] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status != 'cancelada')        AS total_reservas,
           COUNT(*) FILTER (WHERE status = 'ativa')             AS ativas,
           COUNT(*) FILTER (WHERE status = 'concluida')         AS concluidas,
           COUNT(*) FILTER (WHERE status = 'cancelada')         AS canceladas,
           COUNT(DISTINCT sala_id) FILTER (WHERE status != 'cancelada') AS salas_utilizadas
         FROM reserva
         WHERE data BETWEEN $1 AND $2`,
        [dataInicio, dataFim]
      ),
      pool.query(
        `SELECT
           s.id AS sala_id, s.nome_numero, s.bloco, s.tipo_sala,
           COUNT(r.id) FILTER (WHERE r.status != 'cancelada') AS total_reservas
         FROM sala s
         LEFT JOIN reserva r ON r.sala_id = s.id AND r.data BETWEEN $1 AND $2
         GROUP BY s.id, s.nome_numero, s.bloco, s.tipo_sala
         ORDER BY total_reservas DESC, s.bloco, s.nome_numero`,
        [dataInicio, dataFim]
      ),
      pool.query(
        `SELECT
           EXTRACT(MONTH FROM data)::int                        AS mes,
           COUNT(*) FILTER (WHERE status != 'cancelada')        AS total_reservas,
           COUNT(*) FILTER (WHERE status = 'ativa')             AS ativas,
           COUNT(*) FILTER (WHERE status = 'concluida')         AS concluidas,
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
    const payload = {
      semestre,
      ano,
      periodo: { inicio: dataInicio, fim: dataFim },
      resumo: {
        total_reservas:   parseInt(r.total_reservas),
        ativas:           parseInt(r.ativas),
        concluidas:       parseInt(r.concluidas),
        canceladas:       parseInt(r.canceladas),
        salas_utilizadas: parseInt(r.salas_utilizadas),
      },
      por_sala: porSalaResult.rows.map(s => ({
        sala_id:        s.sala_id,
        nome_numero:    s.nome_numero,
        bloco:          s.bloco,
        tipo_sala:      s.tipo_sala,
        total_reservas: parseInt(s.total_reservas),
      })),
      por_mes: porMesResult.rows.map(m => ({
        mes:              m.mes,
        nome_mes:         MESES[m.mes],
        total_reservas:   parseInt(m.total_reservas),
        ativas:           parseInt(m.ativas),
        concluidas:       parseInt(m.concluidas),
        canceladas:       parseInt(m.canceladas),
        salas_utilizadas: parseInt(m.salas_utilizadas),
      })),
    };

    if (formato === 'csv') {
      const conteudo = csvSemestral(payload);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="relatorio-semestral-${semestre}s-${ano}.csv"`);
      return res.send(conteudo);
    }

    if (formato === 'pdf') {
      const buffer = await pdfSemestral(payload);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="relatorio-semestral-${semestre}s-${ano}.pdf"`);
      return res.send(buffer);
    }

    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
