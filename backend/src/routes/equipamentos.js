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
 *     summary: Lista todos os equipamentos cadastrados
 *     tags: [Equipamentos]
 *     description: |
 *       Retorna todos os equipamentos disponíveis no sistema, ordenados por nome.
 *       Equipamentos são itens que podem ser associados a salas (ex.: Projetor, Ar-condicionado, Lousa Digital).
 *
 *       Para ver em quais salas um equipamento específico está instalado, use **GET /api/equipamentos/{id}**.
 *     responses:
 *       200:
 *         description: Lista de equipamentos retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Equipamento'
 *       500:
 *         description: Erro interno do servidor
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
 *     summary: Busca um equipamento pelo ID (inclui salas onde está instalado)
 *     tags: [Equipamentos]
 *     description: |
 *       Retorna os dados de um equipamento específico, incluindo a lista de salas em que ele está instalado e a quantidade disponível em cada uma.
 *
 *       **Resposta inclui:**
 *       - Dados do equipamento (`id`, `nome`, `descricao`)
 *       - `salas`: array com as salas que possuem este equipamento, contendo `id`, `nome_numero`, `bloco`, `tipo_sala` e `quantidade`
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID único do equipamento (UUID)
 *     responses:
 *       200:
 *         description: Equipamento encontrado com lista de salas onde está instalado
 *       404:
 *         description: Nenhum equipamento encontrado com o ID informado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Equipamento não encontrado"
 *       500:
 *         description: Erro interno do servidor
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
 *     description: |
 *       Cria um novo tipo de equipamento no sistema. Após criar, associe-o às salas que o possuem usando **POST /api/salas/{id}/equipamentos**.
 *
 *       **Regra:** o `nome` do equipamento deve ser único — não é possível ter dois equipamentos com o mesmo nome.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Equipamento'
 *           example:
 *             nome: "Computador"
 *             descricao: "Computador Dell i5 16GB RAM"
 *             sistema_operacional: "Linux"
 *     responses:
 *       201:
 *         description: Equipamento criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Equipamento'
 * *       400:
 *         description: Nome não informado, já existe um equipamento com esse nome, ou sistema_operacional inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               nome_ausente:
 *                 summary: Campo nome não enviado
 *                 value:
 *                   error: "Campo obrigatório: nome"
 *               nome_duplicado:
 *                 summary: Nome já cadastrado
 *                 value:
 *                   error: "Já existe um equipamento com esse nome"
 *               so_invalido:
 *                 summary: Sistema operacional inválido
 *                 value:
 *                   error: "sistema_operacional deve ser \"Linux\", \"macOS\" ou \"Windows\""
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/', async (req, res) => {
  const { nome, descricao, sistema_operacional } = req.body;

  if (!nome) return res.status(400).json({ error: 'Campo obrigatório: nome' });

  if (sistema_operacional !== undefined && sistema_operacional !== null &&
      !['Linux', 'macOS', 'Windows'].includes(sistema_operacional)) {
    return res.status(400).json({ error: 'sistema_operacional deve ser "Linux", "macOS" ou "Windows"' });
  }

  try {
    const { rows } = await pool.query(
      'INSERT INTO equipamento (nome, descricao, sistema_operacional) VALUES ($1, $2, $3) RETURNING *',
      [nome, descricao || null, sistema_operacional || null]
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
 *     description: |
 *       Atualiza parcialmente os dados de um equipamento. Envie apenas os campos que deseja alterar.
 *
 *       **Campos atualizáveis:** `nome`, `descricao`
 *
 *       **Atenção:** se alterar o `nome`, certifique-se de que não existe outro equipamento com o mesmo nome.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID único do equipamento
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Equipamento'
 *           example:
 *             nome: "Projetor Full HD"
 *             descricao: "Projetor multimídia HDMI/VGA 1080p"
 *             sistema_operacional: null
 *     responses:
 *       200:
 *         description: Equipamento atualizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Equipamento'
 *       400:
 *         description: Nenhum campo enviado ou nome duplicado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Nenhum campo fornecido para atualização"
 *       404:
 *         description: Equipamento não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Equipamento não encontrado"
 *       500:
 *         description: Erro interno do servidor
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, descricao, sistema_operacional } = req.body;

  if (sistema_operacional !== undefined && sistema_operacional !== null &&
      !['Linux', 'macOS', 'Windows'].includes(sistema_operacional)) {
    return res.status(400).json({ error: 'sistema_operacional deve ser "Linux", "macOS" ou "Windows"' });
  }

  const fields = [];
  const values = [];

  if (nome !== undefined) { values.push(nome); fields.push(`nome = $${values.length}`); }
  if (descricao !== undefined) { values.push(descricao); fields.push(`descricao = $${values.length}`); }
  if (sistema_operacional !== undefined) { values.push(sistema_operacional); fields.push(`sistema_operacional = $${values.length}`); }

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
 *     summary: Remove um equipamento permanentemente
 *     tags: [Equipamentos]
 *     description: |
 *       Remove o equipamento do sistema. **Esta operação é permanente** — diferente de salas e usuários, equipamentos são excluídos fisicamente do banco.
 *
 *       **Atenção:** ao remover um equipamento, ele também é desvinculado de todas as salas às quais estava associado.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID único do equipamento a ser removido
 *     responses:
 *       204:
 *         description: Equipamento removido com sucesso. Nenhum conteúdo retornado.
 *       404:
 *         description: Equipamento não encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Equipamento não encontrado"
 *       500:
 *         description: Erro interno do servidor
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
