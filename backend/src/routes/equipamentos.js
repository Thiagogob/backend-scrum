const { Router } = require('express');
const pool = require('../config/db');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Equipamentos
 *   description: Cadastro e gestão de equipamentos disponíveis nas salas
 */

/**
 * @swagger
 * /api/equipamentos:
 *   get:
 *     summary: Lista todos os equipamentos
 *     tags: [Equipamentos]
 *     responses:
 *       200:
 *         description: Lista de equipamentos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Equipamento'
 *       500:
 *         description: Erro interno
 */
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM equipamento ORDER BY nome');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/equipamentos/{id}:
 *   get:
 *     summary: Busca um equipamento pelo ID (inclui salas que o possuem)
 *     tags: [Equipamentos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Equipamento encontrado
 *       404:
 *         description: Equipamento não encontrado
 *       500:
 *         description: Erro interno
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const equipResult = await pool.query('SELECT * FROM equipamento WHERE id = $1', [id]);
    if (equipResult.rowCount === 0) return res.status(404).json({ error: 'Equipamento não encontrado' });

    const salasResult = await pool.query(
      `SELECT s.id, s.nome_numero, s.bloco, s.tipo_sala, se.quantidade
       FROM sala_equipamento se
       JOIN sala s ON s.id = se.sala_id
       WHERE se.equipamento_id = $1
       ORDER BY s.bloco, s.nome_numero`,
      [id]
    );

    res.json({ ...equipResult.rows[0], salas: salasResult.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/equipamentos:
 *   post:
 *     summary: Cadastra um novo equipamento
 *     tags: [Equipamentos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Equipamento'
 *           example:
 *             nome: "Lousa Digital"
 *             descricao: "Lousa interativa com caneta óptica"
 *     responses:
 *       201:
 *         description: Equipamento criado com sucesso
 *       400:
 *         description: Nome obrigatório ou já existente
 *       500:
 *         description: Erro interno
 */
router.post('/', async (req, res) => {
  const { nome, descricao } = req.body;

  if (!nome) return res.status(400).json({ error: 'Campo obrigatório: nome' });

  try {
    const { rows } = await pool.query(
      'INSERT INTO equipamento (nome, descricao) VALUES ($1, $2) RETURNING *',
      [nome, descricao || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Já existe um equipamento com esse nome' });
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/equipamentos/{id}:
 *   put:
 *     summary: Atualiza os dados de um equipamento
 *     tags: [Equipamentos]
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
 *             $ref: '#/components/schemas/Equipamento'
 *           example:
 *             nome: "Projetor Full HD"
 *             descricao: "Projetor multimídia HDMI/VGA 1080p"
 *     responses:
 *       200:
 *         description: Equipamento atualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Equipamento'
 *       400:
 *         description: Dados inválidos
 *       404:
 *         description: Equipamento não encontrado
 *       500:
 *         description: Erro interno
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, descricao } = req.body;

  const fields = [];
  const values = [];

  if (nome !== undefined) { values.push(nome); fields.push(`nome = $${values.length}`); }
  if (descricao !== undefined) { values.push(descricao); fields.push(`descricao = $${values.length}`); }

  if (fields.length === 0) return res.status(400).json({ error: 'Nenhum campo fornecido para atualização' });

  values.push(id);
  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE equipamento SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Equipamento não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Já existe um equipamento com esse nome' });
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/equipamentos/{id}:
 *   delete:
 *     summary: Remove um equipamento
 *     tags: [Equipamentos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Equipamento removido
 *       404:
 *         description: Equipamento não encontrado
 *       500:
 *         description: Erro interno
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { rowCount } = await pool.query('DELETE FROM equipamento WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Equipamento não encontrado' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
