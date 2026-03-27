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

module.exports = router;
