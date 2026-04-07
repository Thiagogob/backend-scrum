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
 *     summary: Autentica um usuário e retorna o token JWT
 *     tags: [Auth]
 *     description: |
 *       Realiza o login do usuário com email e senha. Em caso de sucesso, retorna um **token JWT** válido por 8 horas e os dados básicos do usuário autenticado.
 *
 *       **Como usar o token recebido:**
 *       - Armazene o token no frontend (ex.: `localStorage.setItem('token', data.token)`)
 *       - Envie-o em todas as requisições protegidas via header HTTP:
 *         ```
 *         Authorization: Bearer <token>
 *         ```
 *       - No Swagger UI: clique em **Authorize** (🔓) no topo da página, cole o token e confirme.
 *
 *       **O token expira em 8 horas.** Após isso, o usuário precisa fazer login novamente.
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
 *                 description: E-mail cadastrado do usuário
 *                 example: "teste.silva@universidade.edu.br"
 *               senha:
 *                 type: string
 *                 description: Senha do usuário (mínimo 6 caracteres)
 *                 example: "senha123"
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
 *                   description: Token JWT para ser usado nas requisições protegidas
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 usuario:
 *                   $ref: '#/components/schemas/Usuario'
 *       400:
 *         description: Email ou senha não informados
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Campos obrigatórios: email, senha"
 *       401:
 *         description: Email ou senha incorretos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Credenciais inválidas"
 *       500:
 *         description: Erro interno do servidor
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
