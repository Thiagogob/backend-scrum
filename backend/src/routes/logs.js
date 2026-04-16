const { Router } = require('express');
const pool = require('../config/db');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Logs
 *   description: Auditoria de ações realizadas no sistema
 */

/**
 * @swagger
 * /api/logs:
 *   get:
 *     summary: Lista o histórico de ações do sistema
 *     tags: [Logs]
 *     description: |
 *       Retorna o log de auditoria com todas as ações relevantes realizadas no sistema,
 *       ordenadas da mais recente para a mais antiga.
 *
 *       **Ações registradas:**
 *
 *       | Ação | Descrição |
 *       |---|---|
 *       | `usuario.criacao` | Novo usuário cadastrado |
 *       | `usuario.edicao` | Dados do usuário alterados (nome, e-mail) |
 *       | `usuario.bloqueio` | Usuário desativado (`ativo = false`) |
 *       | `usuario.desbloqueio` | Usuário reativado (`ativo = true`) |
 *       | `usuario.troca_perfil` | Tipo/perfil do usuário alterado |
 *       | `usuario.exclusao` | Usuário desativado via soft delete |
 *       | `sala.criacao` | Nova sala cadastrada |
 *       | `sala.edicao` | Dados da sala alterados |
 *       | `sala.indisponibilidade` | Sala desativada |
 *       | `reserva.criacao` | Nova reserva criada |
 *       | `reserva.edicao` | Reserva alterada manualmente |
 *       | `reserva.cancelamento` | Reserva cancelada pelo próprio usuário |
 *       | `reserva.cancelamento_forcado` | Reserva cancelada por um administrador |
 *
 *     parameters:
 *       - in: query
 *         name: entidade
 *         schema:
 *           type: string
 *           enum: [usuario, sala, reserva]
 *         description: Filtra pelo tipo de entidade afetada
 *       - in: query
 *         name: acao
 *         schema:
 *           type: string
 *         description: 'Filtra pela ação específica. Ex: "usuario.bloqueio"'
 *       - in: query
 *         name: entidade_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: "Filtra pelo ID da entidade afetada (ex: todos os logs de um usuário específico)"
 *       - in: query
 *         name: realizado_por
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filtra pelas ações de um usuário específico
 *       - in: query
 *         name: data_inicio
 *         schema:
 *           type: string
 *           format: date
 *         description: 'Data de início do filtro (YYYY-MM-DD)'
 *       - in: query
 *         name: data_fim
 *         schema:
 *           type: string
 *           format: date
 *         description: 'Data de fim do filtro (YYYY-MM-DD, inclusivo)'
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 500
 *           default: 100
 *         description: Máximo de registros retornados
 *     responses:
 *       200:
 *         description: Lista de logs retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                   acao:
 *                     type: string
 *                   entidade:
 *                     type: string
 *                   entidade_id:
 *                     type: string
 *                     format: uuid
 *                   realizado_por:
 *                     type: string
 *                     format: uuid
 *                   realizado_por_nome:
 *                     type: string
 *                     description: Nome do usuário que realizou a ação (JOIN automático)
 *                   realizado_por_email:
 *                     type: string
 *                   detalhes:
 *                     type: object
 *                     description: Dados adicionais da ação (campos alterados, valores, etc.)
 *                   criado_em:
 *                     type: string
 *                     format: date-time
 *             example:
 *               - id: "uuid-do-log"
 *                 acao: "usuario.bloqueio"
 *                 entidade: "usuario"
 *                 entidade_id: "uuid-do-usuario"
 *                 realizado_por: "uuid-do-admin"
 *                 realizado_por_nome: "Admin CPD"
 *                 realizado_por_email: "admin@uniuv.edu.br"
 *                 detalhes: { campos_alterados: ["ativo"], ativo_novo: false }
 *                 criado_em: "2026-04-16T14:30:00.000Z"
 *       400:
 *         description: Parâmetros inválidos
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/', async (req, res) => {
  const { entidade, acao, entidade_id, realizado_por, data_inicio, data_fim } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);

  const conditions = [];
  const values = [];

  if (entidade) {
    values.push(entidade);
    conditions.push(`l.entidade = $${values.length}`);
  }
  if (acao) {
    values.push(acao);
    conditions.push(`l.acao = $${values.length}`);
  }
  if (entidade_id) {
    values.push(entidade_id);
    conditions.push(`l.entidade_id = $${values.length}`);
  }
  if (realizado_por) {
    values.push(realizado_por);
    conditions.push(`l.realizado_por = $${values.length}`);
  }
  if (data_inicio) {
    values.push(data_inicio);
    conditions.push(`l.criado_em >= $${values.length}::date`);
  }
  if (data_fim) {
    values.push(data_fim);
    conditions.push(`l.criado_em < ($${values.length}::date + interval '1 day')`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit);

  try {
    const { rows } = await pool.query(
      `SELECT
         l.id,
         l.acao,
         l.entidade,
         l.entidade_id,
         l.realizado_por,
         u.nome  AS realizado_por_nome,
         u.email AS realizado_por_email,
         l.detalhes,
         l.criado_em
       FROM log_auditoria l
       LEFT JOIN usuario u ON u.id = l.realizado_por
       ${where}
       ORDER BY l.criado_em DESC
       LIMIT $${values.length}`,
      values
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
