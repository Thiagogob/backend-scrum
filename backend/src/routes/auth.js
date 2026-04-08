const { Router } = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const supabase = require('../config/supabase');
const authMiddleware = require('../middlewares/authMiddleware');

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 8 * 60 * 60 * 1000, // 8 horas em ms
};

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
 *     summary: Autentica um usuário e define o cookie de sessão
 *     tags: [Auth]
 *     description: |
 *       Realiza o login com email e senha. Em caso de sucesso:
 *       - Define um cookie **httpOnly** chamado `token` com o JWT (válido por 8 horas)
 *       - Retorna os dados do usuário no corpo da resposta
 *
 *       O cookie é enviado automaticamente pelo browser em todas as requisições seguintes ao backend.
 *       O frontend **não precisa** ler ou armazenar o token manualmente.
 *
 *       **Para testar no Swagger UI:** após o login, copie o campo `token` da resposta,
 *       clique em Authorize (cadeado) e cole o token para autenticar as rotas protegidas.
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
 *         description: Login realizado com sucesso. Cookie "token" definido automaticamente.
 *         headers:
 *           Set-Cookie:
 *             description: Cookie httpOnly com o JWT. Gerenciado automaticamente pelo browser.
 *             schema:
 *               type: string
 *               example: token=eyJhbGci...; Path=/; HttpOnly; SameSite=Lax
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT também retornado no corpo para uso no Swagger UI
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

  res.cookie('token', token, COOKIE_OPTIONS);
  res.json({ token, usuario });
});

/**
 * @swagger
 * /api/auth/user:
 *   get:
 *     summary: Retorna os dados do usuário autenticado
 *     tags: [Auth]
 *     description: |
 *       Retorna os dados do usuário da sessão atual com base no cookie ou token JWT.
 *
 *       Use esta rota ao carregar a aplicação para verificar se o usuário já está logado
 *       e obter seus dados sem precisar fazer login novamente.
 *
 *       **Fluxo típico no frontend:**
 *       1. Ao iniciar a aplicação, chame este endpoint
 *       2. Se retornar 200, o usuário está logado — use os dados retornados
 *       3. Se retornar 401, o cookie expirou ou não existe — redirecione para o login
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Usuário autenticado. Retorna os dados completos do usuário.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Usuario'
 *       401:
 *         description: Não autenticado. Cookie ausente, expirado ou token inválido.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Token de autenticação não fornecido"
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/user', authMiddleware, async (req, res) => {
  try {
    const { rows, rowCount } = await pool.query(
      'SELECT id, nome, email, tipo, ativo, criado_em FROM usuario WHERE id = $1',
      [req.usuario.id]
    );
    if (rowCount === 0) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Encerra a sessão do usuário limpando o cookie
 *     tags: [Auth]
 *     description: |
 *       Remove o cookie de autenticação do browser, encerrando a sessão.
 *       Após o logout, requisições a rotas protegidas retornarão 401.
 *     responses:
 *       200:
 *         description: Logout realizado com sucesso. Cookie removido.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Logout realizado com sucesso"
 */
router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
  res.json({ message: 'Logout realizado com sucesso' });
});

module.exports = router;
