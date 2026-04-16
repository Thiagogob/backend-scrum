const { Router } = require('express');
const pool = require('../config/db');
const supabase = require('../config/supabase');
const registrarLog = require('../utils/logHelper');

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
 *     summary: Lista todos os usuários cadastrados
 *     tags: [Usuários]
 *     description: |
 *       Retorna a lista de usuários do sistema. Por padrão, retorna todos os usuários (ativos e inativos).
 *       Use os filtros para refinar a busca.
 *
 *       **Tipos de usuário:**
 *       - `professor`: pode criar reservas apenas dentro do mês corrente
 *       - `admin_cpd`: sem restrição de mês, pode criar reservas em nome de professores
 *     parameters:
 *       - in: query
 *         name: tipo
 *         schema:
 *           type: string
 *           enum: [professor, admin_cpd]
 *         description: Filtra pelo tipo de usuário
 *       - in: query
 *         name: ativo
 *         schema:
 *           type: boolean
 *         description: 'Filtra por status. Use `true` para listar apenas usuários ativos, `false` para desativados'
 *     responses:
 *       200:
 *         description: Lista de usuários retornada com sucesso. A senha nunca é incluída na resposta.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Usuario'
 *       500:
 *         description: Erro interno do servidor
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
 *     description: Retorna os dados de um usuário específico. A senha nunca é retornada.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID único do usuário (UUID)
 *     responses:
 *       200:
 *         description: Usuário encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Usuario'
 *       404:
 *         description: Nenhum usuário encontrado com o ID informado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Usuário não encontrado"
 *       500:
 *         description: Erro interno do servidor
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
 *     description: |
 *       Cria um novo usuário no sistema. O usuário é registrado tanto no sistema de autenticação quanto na base de dados.
 *
 *       **Regras:**
 *       - O email deve ser institucional: apenas `@uniuv.edu.br` ou `@unespar.edu.br` são aceitos
 *       - O email deve ser único — não é possível cadastrar dois usuários com o mesmo email
 *       - A senha deve ter no mínimo 6 caracteres
 *       - O `tipo` define as permissões do usuário no sistema de reservas
 *
 *       **Tipos disponíveis:**
 *       - `professor`: acesso padrão, reservas apenas no mês corrente
 *       - `admin_cpd`: acesso total, pode reservar qualquer data e criar reservas em nome de professores
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Usuario'
 *           example:
 *             nome: "Prof. Teste Silva"
 *             email: "teste.silva@uniuv.edu.br"
 *             senha: "senha123"
 *             tipo: "professor"
 *     responses:
 *       201:
 *         description: Usuário criado com sucesso. A senha não é retornada.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Usuario'
 *       400:
 *         description: Dados inválidos ou e-mail já cadastrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               campos_faltando:
 *                 summary: Campos obrigatórios ausentes
 *                 value:
 *                   error: "Campos obrigatórios: nome, email, senha, tipo"
 *               email_dominio_invalido:
 *                 summary: E-mail fora do domínio institucional
 *                 value:
 *                   error: "E-mail deve ser institucional (@uniuv.edu.br ou @unespar.edu.br)"
 *               email_duplicado:
 *                 summary: E-mail já em uso
 *                 value:
 *                   error: "E-mail já cadastrado"
 *               senha_curta:
 *                 summary: Senha muito curta
 *                 value:
 *                   error: "senha deve ter no mínimo 6 caracteres"
 *               tipo_invalido:
 *                 summary: Tipo inválido
 *                 value:
 *                   error: "tipo deve ser \"professor\" ou \"admin_cpd\""
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/', async (req, res) => {
  const { nome, email, senha, tipo } = req.body;

  if (!nome || !email || !senha || !tipo) {
    return res.status(400).json({ error: 'Campos obrigatórios: nome, email, senha, tipo' });
  }
  if (!['professor', 'admin_cpd'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo deve ser "professor" ou "admin_cpd"' });
  }
  const dominiosPermitidos = ['@uniuv.edu.br', '@unespar.edu.br'];
  if (!dominiosPermitidos.some(d => email.endsWith(d))) {
    return res.status(400).json({ error: 'E-mail deve ser institucional (@uniuv.edu.br ou @unespar.edu.br)' });
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

  if (rows.length > 0) {
    await registrarLog(pool, {
      acao: 'usuario.criacao',
      entidade: 'usuario',
      entidade_id: rows[0].id,
      realizado_por: req.usuario?.id || null,
      detalhes: { nome, email, tipo },
    });
    return res.status(201).json(rows[0]);
  }

  // Trigger already inserted it — just fetch
  const { rows: existing } = await pool.query(
    'SELECT id, nome, email, tipo, ativo, criado_em FROM usuario WHERE auth_id = $1',
    [data.user.id]
  );
  await registrarLog(pool, {
    acao: 'usuario.criacao',
    entidade: 'usuario',
    entidade_id: existing[0]?.id || null,
    realizado_por: req.usuario?.id || null,
    detalhes: { nome, email, tipo },
  });
  res.status(201).json(existing[0]);
});

/**
 * @swagger
 * /api/usuarios/{id}:
 *   put:
 *     summary: Atualiza os dados de um usuário
 *     tags: [Usuários]
 *     description: |
 *       Atualiza parcialmente os dados de um usuário. Envie apenas os campos que deseja alterar — campos não enviados permanecem inalterados.
 *
 *       **Campos atualizáveis:** `nome`, `email`, `tipo`, `ativo`
 *
 *       Ao alterar o `email`, o novo endereço deve ser institucional (`@uniuv.edu.br` ou `@unespar.edu.br`) e único no sistema. A alteração é sincronizada automaticamente com o sistema de autenticação.
 *
 *       **Não é possível alterar** a senha por esta rota.
 *
 *       **Identificação do usuário:** o `id` pode ser fornecido na URL (`PUT /api/usuarios/{id}`) **ou** no corpo da requisição (`{ "id": "uuid", ... }`). O parâmetro da URL tem prioridade sobre o corpo.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID único do usuário. Pode ser omitido se o `id` for enviado no corpo da requisição.
 *         example: "c22e2050-b098-4a4d-8661-2229a2c02f2d"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 format: uuid
 *                 description: ID do usuário. Obrigatório se não for informado na URL.
 *               nome:
 *                 type: string
 *                 description: Novo nome do usuário
 *               email:
 *                 type: string
 *                 format: email
 *                 description: 'Novo e-mail institucional (@uniuv.edu.br ou @unespar.edu.br). Sincronizado com o sistema de autenticação.'
 *               tipo:
 *                 type: string
 *                 enum: [professor, admin_cpd]
 *                 description: Novo tipo/perfil do usuário
 *               ativo:
 *                 type: boolean
 *                 description: Use `false` para desativar o usuário ou `true` para reativá-lo
 *           example:
 *             id: "c22e2050-b098-4a4d-8661-2229a2c02f2d"
 *             nome: "Prof. João Silva"
 *             email: "joao.silva@uniuv.edu.br"
 *             tipo: "professor"
 *             ativo: true
 *     responses:
 *       200:
 *         description: Usuário atualizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Usuario'
 *       400:
 *         description: ID ausente, nenhum campo válido enviado, tipo inválido, e-mail fora do domínio institucional ou usuário sem conta de autenticação vinculada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               id_ausente:
 *                 summary: ID não fornecido
 *                 value:
 *                   error: "ID do usuário é obrigatório"
 *               nenhum_campo:
 *                 summary: Nenhum campo enviado
 *                 value:
 *                   error: "Nenhum campo fornecido para atualização"
 *               email_dominio_invalido:
 *                 summary: E-mail fora do domínio institucional
 *                 value:
 *                   error: "E-mail deve ser institucional (@uniuv.edu.br ou @unespar.edu.br)"
 *               email_duplicado:
 *                 summary: E-mail já em uso
 *                 value:
 *                   error: "E-mail já cadastrado"
 *               tipo_invalido:
 *                 summary: Tipo inválido
 *                 value:
 *                   error: "tipo deve ser \"professor\" ou \"admin_cpd\""
 *               sem_auth_vinculado:
 *                 summary: Usuário sem conta de autenticação vinculada
 *                 value:
 *                   error: "Usuário não possui conta de autenticação vinculada"
 *       404:
 *         description: Usuário não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Usuário não encontrado"
 *       500:
 *         description: Erro interno do servidor
 */
router.put('/:id?', async (req, res) => {
  const id = req.params.id || req.body.id;
  if (!id) return res.status(400).json({ error: 'ID do usuário é obrigatório' });

  const { nome, email, tipo, ativo } = req.body;

  if (tipo !== undefined && !['professor', 'admin_cpd'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo deve ser "professor" ou "admin_cpd"' });
  }
  if (email !== undefined) {
    const dominiosPermitidos = ['@uniuv.edu.br', '@unespar.edu.br'];
    if (!dominiosPermitidos.some(d => email.endsWith(d))) {
      return res.status(400).json({ error: 'E-mail deve ser institucional (@uniuv.edu.br ou @unespar.edu.br)' });
    }
  }

  const fields = [];
  const values = [];

  if (nome !== undefined) { values.push(nome); fields.push(`nome = $${values.length}`); }
  if (email !== undefined) { values.push(email); fields.push(`email = $${values.length}`); }
  if (tipo !== undefined) { values.push(tipo); fields.push(`tipo = $${values.length}`); }
  if (ativo !== undefined) { values.push(ativo); fields.push(`ativo = $${values.length}`); }

  if (fields.length === 0) return res.status(400).json({ error: 'Nenhum campo fornecido para atualização' });

  try {
    // Se o email está sendo alterado, precisamos buscar o auth_id e atualizar no Supabase
    if (email !== undefined) {
      const authIdResult = await pool.query('SELECT auth_id FROM usuario WHERE id = $1', [id]);
      if (authIdResult.rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado' });

      const authId = authIdResult.rows[0].auth_id;
      if (!authId) return res.status(400).json({ error: 'Usuário não possui conta de autenticação vinculada' });

      const { error: supabaseError } = await supabase.auth.admin.updateUserById(
        authId,
        { email }
      );
      if (supabaseError) {
        if (supabaseError.message.toLowerCase().includes('already registered') ||
            supabaseError.message.toLowerCase().includes('already been registered')) {
          return res.status(400).json({ error: 'E-mail já cadastrado' });
        }
        return res.status(500).json({ error: supabaseError.message });
      }
    }

    values.push(id);
    const { rows, rowCount } = await pool.query(
      `UPDATE usuario SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING id, nome, email, tipo, ativo, criado_em`,
      values
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado' });

    // Determina a ação mais específica para o log
    let acaoLog;
    if (ativo !== undefined) {
      acaoLog = ativo ? 'usuario.desbloqueio' : 'usuario.bloqueio';
    } else if (tipo !== undefined) {
      acaoLog = 'usuario.troca_perfil';
    } else {
      acaoLog = 'usuario.edicao';
    }

    const camposAlterados = [];
    if (nome !== undefined) camposAlterados.push('nome');
    if (email !== undefined) camposAlterados.push('email');
    if (tipo !== undefined) camposAlterados.push('tipo');
    if (ativo !== undefined) camposAlterados.push('ativo');

    await registrarLog(pool, {
      acao: acaoLog,
      entidade: 'usuario',
      entidade_id: id,
      realizado_por: req.usuario?.id || null,
      detalhes: { campos_alterados: camposAlterados, ...(tipo !== undefined && { tipo_novo: tipo }), ...(ativo !== undefined && { ativo_novo: ativo }) },
    });

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
 *     description: |
 *       Desativa o usuário definindo `ativo = false`. **O registro não é removido do banco de dados.**
 *
 *       Para reativar um usuário desativado, use `PUT /api/usuarios/{id}` com `{ "ativo": true }`.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID único do usuário a ser desativado
 *     responses:
 *       200:
 *         description: Usuário desativado com sucesso. Retorna o registro atualizado com `ativo = false`.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Usuario'
 *       404:
 *         description: Usuário não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Usuário não encontrado"
 *       500:
 *         description: Erro interno do servidor
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows, rowCount } = await pool.query(
      'UPDATE usuario SET ativo = false WHERE id = $1 RETURNING id, nome, email, tipo, ativo, criado_em',
      [id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    await registrarLog(pool, {
      acao: 'usuario.exclusao',
      entidade: 'usuario',
      entidade_id: id,
      realizado_por: req.usuario?.id || null,
      detalhes: { nome: rows[0].nome, email: rows[0].email },
    });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
