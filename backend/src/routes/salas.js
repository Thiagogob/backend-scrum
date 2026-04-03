const { Router } = require('express');
const pool = require('../config/db');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Salas
 *   description: Cadastro e gestão de salas e laboratórios
 */

/**
 * @swagger
 * /api/salas:
 *   get:
 *     summary: Lista todas as salas
 *     tags: [Salas]
 *     parameters:
 *       - in: query
 *         name: tipo_sala
 *         schema:
 *           type: string
 *           enum: [sala_aula, laboratorio]
 *         description: Filtrar por tipo
 *       - in: query
 *         name: bloco
 *         schema:
 *           type: string
 *         description: Filtrar por bloco. Exemplo - Bloco A
 *       - in: query
 *         name: ativo
 *         schema:
 *           type: boolean
 *         description: Filtrar por status ativo (padrão true)
 *     responses:
 *       200:
 *         description: Lista de salas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Sala'
 *       500:
 *         description: Erro interno
 */
router.get('/', async (req, res) => {
  const { tipo_sala, bloco, ativo } = req.query;

  const conditions = [];
  const values = [];

  if (tipo_sala) {
    values.push(tipo_sala);
    conditions.push(`tipo_sala = $${values.length}`);
  }
  if (bloco) {
    values.push(`%${bloco}%`);
    conditions.push(`bloco ILIKE $${values.length}`);
  }
  if (ativo !== undefined) {
    values.push(ativo === 'true');
    conditions.push(`ativo = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM sala ${where} ORDER BY bloco, nome_numero`;

  try {
    const { rows } = await pool.query(sql, values);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/salas/{id}:
 *   get:
 *     summary: Busca uma sala pelo ID (inclui equipamentos)
 *     tags: [Salas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Sala encontrada com lista de equipamentos
 *       404:
 *         description: Sala não encontrada
 *       500:
 *         description: Erro interno
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const salaResult = await pool.query('SELECT * FROM sala WHERE id = $1', [id]);
    if (salaResult.rowCount === 0) return res.status(404).json({ error: 'Sala não encontrada' });

    const equipResult = await pool.query(
      `SELECT e.id, e.nome, e.descricao, se.quantidade
       FROM sala_equipamento se
       JOIN equipamento e ON e.id = se.equipamento_id
       WHERE se.sala_id = $1
       ORDER BY e.nome`,
      [id]
    );

    res.json({ ...salaResult.rows[0], equipamentos: equipResult.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/salas:
 *   post:
 *     summary: Cadastra uma nova sala ou laboratório
 *     tags: [Salas]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Sala'
 *           example:
 *             nome_numero: "C-301"
 *             bloco: "Bloco C"
 *             capacidade: 35
 *             tipo_sala: "laboratorio"
 *     responses:
 *       201:
 *         description: Sala criada com sucesso
 *       400:
 *         description: Dados inválidos
 *       500:
 *         description: Erro interno
 */
router.post('/', async (req, res) => {
  const { nome_numero, bloco, capacidade, tipo_sala } = req.body;

  if (!nome_numero || !bloco || !capacidade || !tipo_sala) {
    return res.status(400).json({ error: 'Campos obrigatórios: nome_numero, bloco, capacidade, tipo_sala' });
  }
  if (!['sala_aula', 'laboratorio'].includes(tipo_sala)) {
    return res.status(400).json({ error: 'tipo_sala deve ser "sala_aula" ou "laboratorio"' });
  }
  if (!Number.isInteger(Number(capacidade)) || Number(capacidade) < 1) {
    return res.status(400).json({ error: 'capacidade deve ser um inteiro maior que 0' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO sala (nome_numero, bloco, capacidade, tipo_sala)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [nome_numero, bloco, Number(capacidade), tipo_sala]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/salas/{id}/equipamentos:
 *   post:
 *     summary: Associa (ou atualiza) um equipamento em uma sala
 *     tags: [Salas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID da sala
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SalaEquipamento'
 *     responses:
 *       201:
 *         description: Equipamento associado com sucesso
 *       400:
 *         description: Dados inválidos
 *       500:
 *         description: Erro interno
 */
router.post('/:id/equipamentos', async (req, res) => {
  const { id: sala_id } = req.params;
  const { equipamento_id, quantidade } = req.body;

  if (!equipamento_id || !quantidade) {
    return res.status(400).json({ error: 'Campos obrigatórios: equipamento_id, quantidade' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO sala_equipamento (sala_id, equipamento_id, quantidade)
       VALUES ($1, $2, $3)
       ON CONFLICT (sala_id, equipamento_id) DO UPDATE SET quantidade = EXCLUDED.quantidade
       RETURNING *`,
      [sala_id, equipamento_id, Number(quantidade)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/salas/{id}/equipamentos/{equipamento_id}:
 *   delete:
 *     summary: Remove um equipamento de uma sala
 *     tags: [Salas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID da sala
 *       - in: path
 *         name: equipamento_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do equipamento
 *     responses:
 *       204:
 *         description: Equipamento removido da sala
 *       404:
 *         description: Associação não encontrada
 *       500:
 *         description: Erro interno
 */
router.delete('/:id/equipamentos/:equipamento_id', async (req, res) => {
  const { id: sala_id, equipamento_id } = req.params;

  try {
    const { rowCount } = await pool.query(
      'DELETE FROM sala_equipamento WHERE sala_id = $1 AND equipamento_id = $2',
      [sala_id, equipamento_id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Associação não encontrada' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/salas/{id}:
 *   put:
 *     summary: Atualiza os dados de uma sala
 *     tags: [Salas]
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
 *             $ref: '#/components/schemas/Sala'
 *           example:
 *             nome_numero: "C-301"
 *             bloco: "Bloco C"
 *             capacidade: 40
 *             tipo_sala: "laboratorio"
 *             ativo: true
 *     responses:
 *       200:
 *         description: Sala atualizada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Sala'
 *       400:
 *         description: Dados inválidos
 *       404:
 *         description: Sala não encontrada
 *       500:
 *         description: Erro interno
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nome_numero, bloco, capacidade, tipo_sala, ativo } = req.body;

  if (tipo_sala !== undefined && !['sala_aula', 'laboratorio'].includes(tipo_sala)) {
    return res.status(400).json({ error: 'tipo_sala deve ser "sala_aula" ou "laboratorio"' });
  }
  if (capacidade !== undefined && (!Number.isInteger(Number(capacidade)) || Number(capacidade) < 1)) {
    return res.status(400).json({ error: 'capacidade deve ser um inteiro maior que 0' });
  }

  const fields = [];
  const values = [];

  if (nome_numero !== undefined) { values.push(nome_numero); fields.push(`nome_numero = $${values.length}`); }
  if (bloco !== undefined) { values.push(bloco); fields.push(`bloco = $${values.length}`); }
  if (capacidade !== undefined) { values.push(Number(capacidade)); fields.push(`capacidade = $${values.length}`); }
  if (tipo_sala !== undefined) { values.push(tipo_sala); fields.push(`tipo_sala = $${values.length}`); }
  if (ativo !== undefined) { values.push(ativo); fields.push(`ativo = $${values.length}`); }

  if (fields.length === 0) return res.status(400).json({ error: 'Nenhum campo fornecido para atualização' });

  values.push(id);
  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE sala SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Sala não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/salas/{id}:
 *   delete:
 *     summary: Desativa uma sala (soft delete)
 *     tags: [Salas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Sala desativada
 *       404:
 *         description: Sala não encontrada
 *       500:
 *         description: Erro interno
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows, rowCount } = await pool.query(
      'UPDATE sala SET ativo = false WHERE id = $1 RETURNING *',
      [id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Sala não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
