const { Router } = require('express');
const pool = require('../config/db');
const supabase = require('../config/supabase');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Usuários
 *   description: Cadastro e gestão de professores e administradores do CPD
 */

/**
 * @swagger
 * /api/usuarios:
 *   get:
 *     summary: Lista todos os usuários
 *     tags: [Usuários]
 *     parameters:
 *       - in: query
 *         name: tipo
 *         schema:
 *           type: string
 *           enum: [professor, admin_cpd]
 *         description: Filtrar por tipo de usuário
 *       - in: query
 *         name: ativo
 *         schema:
 *           type: boolean
 *         description: Filtrar por status ativo
 *     responses:
 *       200:
 *         description: Lista de usuários
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Usuario'
 *       500:
 *         description: Erro interno
 */
router.get('/', async (req, res) => {
  const { tipo, ativo } = req.query;

  const conditions = [];
  const values = [];

  if (tipo) {
    values.push(tipo);
    conditions.push(`tipo = $${values.length}`);
  }
  if (ativo !== undefined) {
    values.push(ativo === 'true');
    conditions.push(`ativo = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT id, nome, email, tipo, ativo, criado_em FROM usuario ${where} ORDER BY nome`;

  try {
    const { rows } = await pool.query(sql, values);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/usuarios/{id}:
 *   get:
 *     summary: Busca um usuário pelo ID
 *     tags: [Usuários]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Usuário encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Usuario'
 *       404:
 *         description: Usuário não encontrado
 *       500:
 *         description: Erro interno
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows, rowCount } = await pool.query(
      'SELECT id, nome, email, tipo, ativo, criado_em FROM usuario WHERE id = $1',
      [id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/usuarios:
 *   post:
 *     summary: Cadastra um novo usuário (professor ou admin_cpd)
 *     tags: [Usuários]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Usuario'
 *           example:
 *             nome: "Prof. Teste Silva"
 *             email: "teste.silva@universidade.edu.br"
 *             senha: "senha123"
 *             tipo: "professor"
 *     responses:
 *       201:
 *         description: Usuário criado com sucesso
 *       400:
 *         description: Dados inválidos ou e-mail já cadastrado
 *       500:
 *         description: Erro interno
 */
router.post('/', async (req, res) => {
  const { nome, email, senha, tipo } = req.body;

  if (!nome || !email || !senha || !tipo) {
    return res.status(400).json({ error: 'Campos obrigatórios: nome, email, senha, tipo' });
  }
  if (!['professor', 'admin_cpd'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo deve ser "professor" ou "admin_cpd"' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'E-mail inválido' });
  }
  if (senha.length < 6) {
    return res.status(400).json({ error: 'senha deve ter no mínimo 6 caracteres' });
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome, tipo },
  });

  if (error) {
    if (error.message.toLowerCase().includes('already registered')) {
      return res.status(400).json({ error: 'E-mail já cadastrado' });
    }
    return res.status(500).json({ error: error.message });
  }

  // Upsert into public.usuario — trigger may have already done this, ON CONFLICT handles the duplicate
  const { rows } = await pool.query(
    `INSERT INTO usuario (auth_id, nome, email, tipo)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (auth_id) DO NOTHING
     RETURNING id, nome, email, tipo, ativo, criado_em`,
    [data.user.id, nome, email, tipo]
  );

  if (rows.length > 0) return res.status(201).json(rows[0]);

  // Trigger already inserted it — just fetch
  const { rows: existing } = await pool.query(
    'SELECT id, nome, email, tipo, ativo, criado_em FROM usuario WHERE auth_id = $1',
    [data.user.id]
  );
  res.status(201).json(existing[0]);
});

/**
 * @swagger
 * /api/usuarios/{id}:
 *   put:
 *     summary: Atualiza os dados de um usuário
 *     tags: [Usuários]
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
 *               nome:
 *                 type: string
 *               tipo:
 *                 type: string
 *                 enum: [professor, admin_cpd]
 *               ativo:
 *                 type: boolean
 *           example:
 *             nome: "Prof. João Silva"
 *             tipo: "professor"
 *             ativo: true
 *     responses:
 *       200:
 *         description: Usuário atualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Usuario'
 *       400:
 *         description: Dados inválidos
 *       404:
 *         description: Usuário não encontrado
 *       500:
 *         description: Erro interno
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, tipo, ativo } = req.body;

  if (tipo !== undefined && !['professor', 'admin_cpd'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo deve ser "professor" ou "admin_cpd"' });
  }

  const fields = [];
  const values = [];

  if (nome !== undefined) { values.push(nome); fields.push(`nome = $${values.length}`); }
  if (tipo !== undefined) { values.push(tipo); fields.push(`tipo = $${values.length}`); }
  if (ativo !== undefined) { values.push(ativo); fields.push(`ativo = $${values.length}`); }

  if (fields.length === 0) return res.status(400).json({ error: 'Nenhum campo fornecido para atualização' });

  values.push(id);
  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE usuario SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING id, nome, email, tipo, ativo, criado_em`,
      values
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/usuarios/{id}:
 *   delete:
 *     summary: Desativa um usuário (soft delete)
 *     tags: [Usuários]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Usuário desativado
 *       404:
 *         description: Usuário não encontrado
 *       500:
 *         description: Erro interno
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows, rowCount } = await pool.query(
      'UPDATE usuario SET ativo = false WHERE id = $1 RETURNING id, nome, email, tipo, ativo, criado_em',
      [id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
