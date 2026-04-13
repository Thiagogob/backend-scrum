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
 *     summary: Lista todas as salas e laboratórios
 *     tags: [Salas]
 *     description: |
 *       Retorna a lista de salas cadastradas no sistema, ordenadas por bloco e nome/número.
 *       Use os filtros para refinar a busca por tipo ou localização.
 *
 *       **Dica:** para montar a tela de disponibilidade, combine esta rota com **GET /api/reservas/disponibilidade**.
 *     parameters:
 *       - in: query
 *         name: tipo_sala
 *         schema:
 *           type: string
 *           enum: [sala_aula, laboratorio]
 *         description: 'Filtra pelo tipo: "sala_aula" para salas convencionais, "laboratorio" para laboratórios'
 *       - in: query
 *         name: bloco
 *         schema:
 *           type: string
 *         description: 'Filtra por bloco (busca parcial, sem distinção de maiúsculas). Ex: "Bloco A" retorna todas as salas que contenham "Bloco A" no nome'
 *       - in: query
 *         name: ativo
 *         schema:
 *           type: boolean
 *         description: 'Filtra por status. Use `true` para listar apenas salas disponíveis para reserva'
 *     responses:
 *       200:
 *         description: Lista de salas retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Sala'
 *       500:
 *         description: Erro interno do servidor
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
 *     summary: Busca uma sala pelo ID (inclui equipamentos instalados)
 *     tags: [Salas]
 *     description: |
 *       Retorna os dados completos de uma sala, incluindo a lista de equipamentos instalados nela com as respectivas quantidades.
 *
 *       **Resposta inclui:**
 *       - Todos os campos da sala (`id`, `nome_numero`, `bloco`, `capacidade`, `tipo_sala`, `ativo`, `criado_em`)
 *       - `equipamentos`: array com os equipamentos da sala, contendo `id`, `nome`, `descricao` e `quantidade`
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID único da sala (UUID)
 *     responses:
 *       200:
 *         description: Sala encontrada com lista de equipamentos
 *       404:
 *         description: Nenhuma sala encontrada com o ID informado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Sala não encontrada"
 *       500:
 *         description: Erro interno do servidor
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
 *     description: |
 *       Cria uma nova sala no sistema. Após criar, você pode associar equipamentos a ela usando **POST /api/salas/{id}/equipamentos**.
 *
 *       **Campos obrigatórios:** `nome_numero`, `bloco`, `capacidade`, `tipo_sala`
 *
 *       **Valores aceitos para `tipo_sala`:**
 *       - `sala_aula`: sala de aula convencional
 *       - `laboratorio`: laboratório de informática ou ciências
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Sala'
 *       400:
 *         description: Dados inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               campos_faltando:
 *                 summary: Campos obrigatórios ausentes
 *                 value:
 *                   error: "Campos obrigatórios: nome_numero, bloco, capacidade, tipo_sala"
 *               tipo_invalido:
 *                 summary: Tipo de sala inválido
 *                 value:
 *                   error: "tipo_sala deve ser \"sala_aula\" ou \"laboratorio\""
 *               capacidade_invalida:
 *                 summary: Capacidade inválida
 *                 value:
 *                   error: "capacidade deve ser um inteiro maior que 0"
 *       500:
 *         description: Erro interno do servidor
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
    const duplicada = await pool.query(
      'SELECT id FROM sala WHERE nome_numero = $1 AND bloco = $2',
      [nome_numero, bloco]
    );
    if (duplicada.rowCount > 0) {
      return res.status(409).json({ error: 'Já existe uma sala com esse nome/número neste bloco' });
    }

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
 *     summary: Associa um equipamento a uma sala (ou atualiza a quantidade)
 *     tags: [Salas]
 *     description: |
 *       Vincula um equipamento a uma sala informando a quantidade disponível.
 *
 *       **Comportamento:**
 *       - Se o equipamento **ainda não está** associado à sala: cria a associação
 *       - Se o equipamento **já está** associado à sala: **atualiza a quantidade** (não duplica)
 *
 *       Para listar os equipamentos disponíveis para associar, use **GET /api/equipamentos**.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID da sala onde o equipamento será instalado
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SalaEquipamento'
 *           example:
 *             equipamento_id: "uuid-do-equipamento"
 *             quantidade: 2
 *     responses:
 *       201:
 *         description: Equipamento associado (ou quantidade atualizada) com sucesso
 *       400:
 *         description: Campos obrigatórios ausentes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Campos obrigatórios: equipamento_id, quantidade"
 *       500:
 *         description: Erro interno do servidor
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
 *     summary: Remove a associação de um equipamento com uma sala
 *     tags: [Salas]
 *     description: |
 *       Remove o vínculo entre o equipamento e a sala. **O equipamento em si não é excluído** — apenas a associação com esta sala é removida.
 *
 *       Para remover o equipamento do sistema completamente, use **DELETE /api/equipamentos/{id}**.
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
 *         description: ID do equipamento a ser desvinculado da sala
 *     responses:
 *       204:
 *         description: Associação removida com sucesso. Nenhum conteúdo retornado.
 *       404:
 *         description: Associação não encontrada (o equipamento não estava vinculado a esta sala)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Associação não encontrada"
 *       500:
 *         description: Erro interno do servidor
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
 *     description: |
 *       Atualiza parcialmente os dados de uma sala. Envie apenas os campos que deseja alterar — campos não enviados permanecem inalterados.
 *
 *       **Campos atualizáveis:** `nome_numero`, `bloco`, `capacidade`, `tipo_sala`, `ativo`
 *
 *       **Dica:** para reativar uma sala desativada, envie `{ "ativo": true }`.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID único da sala
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
 *         description: Sala atualizada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Sala'
 *       400:
 *         description: Nenhum campo válido enviado ou valores inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Nenhum campo fornecido para atualização"
 *       404:
 *         description: Sala não encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Sala não encontrada"
 *       500:
 *         description: Erro interno do servidor
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
 *     description: |
 *       Desativa a sala definindo `ativo = false`. **O registro não é removido do banco de dados.**
 *
 *       Salas desativadas não aparecem na consulta de disponibilidade e não aceitam novas reservas.
 *
 *       Para reativar uma sala desativada, use `PUT /api/salas/{id}` com `{ "ativo": true }`.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID único da sala a ser desativada
 *     responses:
 *       200:
 *         description: Sala desativada com sucesso. Retorna o registro atualizado com `ativo = false`.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Sala'
 *       404:
 *         description: Sala não encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: "Sala não encontrada"
 *       500:
 *         description: Erro interno do servidor
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
