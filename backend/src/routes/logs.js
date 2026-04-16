const { Router } = require('express');
const pool = require('../config/db');

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Logs
 *   description: |
 *     Trilha de auditoria — registra quem fez o quê e quando no sistema.
 *
 *     ---
 *
 *     ## Guia rápido
 *
 *     ### Todas as ações (últimas 100)
 *     ```
 *     GET /api/logs
 *     ```
 *
 *     ### Filtrar por tipo de entidade
 *     ```
 *     GET /api/logs?entidade=usuario
 *     GET /api/logs?entidade=sala
 *     GET /api/logs?entidade=reserva
 *     ```
 *
 *     ### Filtrar por ação específica
 *     ```
 *     GET /api/logs?acao=usuario.troca_perfil
 *     GET /api/logs?acao=reserva.cancelamento_forcado
 *     GET /api/logs?acao=sala.indisponibilidade
 *     ```
 *
 *     ### Histórico de um registro específico
 *     ```
 *     GET /api/logs?entidade=usuario&entidade_id=<uuid>
 *     GET /api/logs?entidade=reserva&entidade_id=<uuid>
 *     ```
 *
 *     ### Tudo que um usuário/admin fez
 *     ```
 *     GET /api/logs?realizado_por=<uuid-do-admin>
 *     ```
 *
 *     ### Filtrar por período
 *     ```
 *     GET /api/logs?data_inicio=2026-04-01&data_fim=2026-04-30
 *     ```
 *
 *     ### Combinar filtros
 *     ```
 *     GET /api/logs?acao=reserva.cancelamento_forcado&realizado_por=<uuid>&data_inicio=2026-04-16&data_fim=2026-04-16
 *     ```
 *
 *     ---
 *
 *     ## Ações registradas
 *
 *     | Ação | Quando é gerada |
 *     |---|---|
 *     | `usuario.criacao` | Novo usuário cadastrado |
 *     | `usuario.edicao` | Dados alterados (nome, e-mail, ativo) |
 *     | `usuario.troca_perfil` | Tipo alterado (professor ↔ admin_cpd) |
 *     | `usuario.exclusao` | Usuário desativado (soft delete) |
 *     | `sala.criacao` | Nova sala cadastrada |
 *     | `sala.edicao` | Dados da sala alterados |
 *     | `sala.indisponibilidade` | Sala desativada |
 *     | `reserva.criacao` | Nova reserva criada |
 *     | `reserva.edicao` | Reserva alterada manualmente |
 *     | `reserva.cancelamento` | Cancelada pelo próprio titular |
 *     | `reserva.cancelamento_forcado` | Cancelada por um administrador |
 */

/**
 * @swagger
 * /api/logs:
 *   get:
 *     summary: Consulta o log de auditoria com filtros
 *     tags: [Logs]
 *     description: |
 *       Retorna as entradas do log de auditoria, ordenadas da mais recente para a mais antiga.
 *       Todos os filtros são opcionais e combináveis. Ver o guia de uso na seção **Logs** acima.
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
 *           enum:
 *             - usuario.criacao
 *             - usuario.edicao
 *             - usuario.troca_perfil
 *             - usuario.exclusao
 *             - sala.criacao
 *             - sala.edicao
 *             - sala.indisponibilidade
 *             - reserva.criacao
 *             - reserva.edicao
 *             - reserva.cancelamento
 *             - reserva.cancelamento_forcado
 *         description: Filtra pela ação específica
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
 *         description: Filtra pelas ações realizadas por um usuário específico
 *       - in: query
 *         name: data_inicio
 *         schema:
 *           type: string
 *           format: date
 *         description: "Data de início do filtro (YYYY-MM-DD). Ex: 2026-04-01"
 *       - in: query
 *         name: data_fim
 *         schema:
 *           type: string
 *           format: date
 *         description: "Data de fim do filtro (YYYY-MM-DD, inclusivo). Ex: 2026-04-30"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 500
 *           default: 100
 *         description: Máximo de registros retornados (padrão 100, máx 500)
 *     responses:
 *       200:
 *         description: Lista de logs retornada com sucesso, ordenada da ação mais recente para a mais antiga
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
 *                     description: Nome do usuário que realizou a ação (JOIN automático com a tabela usuario)
 *                   realizado_por_email:
 *                     type: string
 *                   detalhes:
 *                     type: object
 *                     description: Dados adicionais da ação (campos alterados, valores novos, etc.)
 *                   criado_em:
 *                     type: string
 *                     format: date-time
 *             examples:
 *               troca_perfil:
 *                 summary: Troca de perfil de professor para admin
 *                 value:
 *                   - id: "a1b2c3d4-0000-0000-0000-000000000002"
 *                     acao: "usuario.troca_perfil"
 *                     entidade: "usuario"
 *                     entidade_id: "c22e2050-b098-4a4d-8661-2229a2c02f2d"
 *                     realizado_por: "f3a1c4d0-1234-5678-abcd-000000000001"
 *                     realizado_por_nome: "Admin CPD"
 *                     realizado_por_email: "admin@uniuv.edu.br"
 *                     detalhes:
 *                       campos_alterados: ["tipo"]
 *                       tipo_novo: "admin_cpd"
 *                     criado_em: "2026-04-16T15:00:00.000Z"
 *               cancelamento_forcado:
 *                 summary: Cancelamento forçado de reserva por admin
 *                 value:
 *                   - id: "a1b2c3d4-0000-0000-0000-000000000003"
 *                     acao: "reserva.cancelamento_forcado"
 *                     entidade: "reserva"
 *                     entidade_id: "e9f0a1b2-0000-0000-0000-000000000099"
 *                     realizado_por: "f3a1c4d0-1234-5678-abcd-000000000001"
 *                     realizado_por_nome: "Admin CPD"
 *                     realizado_por_email: "admin@uniuv.edu.br"
 *                     detalhes:
 *                       cancelado_por: "f3a1c4d0-1234-5678-abcd-000000000001"
 *                       usuario_id_titular: "c22e2050-b098-4a4d-8661-2229a2c02f2d"
 *                       data_reserva: "2026-04-18"
 *                       turno: "matutino"
 *                       sala_id: "d7e8f900-0000-0000-0000-000000000010"
 *                     criado_em: "2026-04-16T16:45:00.000Z"
 *               sala_indisponivel:
 *                 summary: Sala marcada como indisponível
 *                 value:
 *                   - id: "a1b2c3d4-0000-0000-0000-000000000004"
 *                     acao: "sala.indisponibilidade"
 *                     entidade: "sala"
 *                     entidade_id: "d7e8f900-0000-0000-0000-000000000010"
 *                     realizado_por: "f3a1c4d0-1234-5678-abcd-000000000001"
 *                     realizado_por_nome: "Admin CPD"
 *                     realizado_por_email: "admin@uniuv.edu.br"
 *                     detalhes:
 *                       nome_numero: "B-102"
 *                       bloco: "Bloco B"
 *                     criado_em: "2026-04-16T09:00:00.000Z"
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
