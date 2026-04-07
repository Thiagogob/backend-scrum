const { Router } = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const supabase = require('../config/supabase');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Autenticação de usuários
 */

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Autentica um usuário e retorna o token de acesso
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, senha]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "maria.santos@universidade.edu.br"
 *               senha:
 *                 type: string
 *                 example: "minhasenha123"
 *     responses:
 *       200:
 *         description: Login realizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 usuario:
 *                   $ref: '#/components/schemas/Usuario'
 *       400:
 *         description: Campos obrigatórios ausentes
 *       401:
 *         description: Credenciais inválidas
 *       500:
 *         description: Erro interno
 */
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ error: 'Campos obrigatórios: email, senha' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });

  if (error) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const { rows } = await pool.query(
    'SELECT id, nome, email, tipo, ativo, criado_em FROM usuario WHERE auth_id = $1',
    [data.user.id]
  );

  if (rows.length === 0) {
    return res.status(401).json({ error: 'Usuário não encontrado na base de dados' });
  }

  const usuario = rows[0];

  const token = jwt.sign(
    { id: usuario.id, email: usuario.email, tipo: usuario.tipo },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({ token, usuario });
});

module.exports = router;
