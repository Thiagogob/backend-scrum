const { Router } = require('express');
const pool = require('../config/db');

const router = Router();

// ─── Shared query helper ─────────────────────────────────────────────────────
// fixedFilters: { entidade?, acao? }  — hardcoded by the route
// req.query accepts: entidade_id, realizado_por, data_inicio, data_fim, limit
async function consultarLogs(fixedFilters, req) {
  const { entidade_id, realizado_por, data_inicio, data_fim } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);

  const conditions = [];
  const values = [];

  if (fixedFilters.entidade) {
    values.push(fixedFilters.entidade);
    conditions.push(`l.entidade = $${values.length}`);
  }
  if (fixedFilters.acao) {
    values.push(fixedFilters.acao);
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

  const { rows } = await pool.query(
    `SELECT
       l.id, l.acao, l.entidade, l.entidade_id, l.realizado_por,
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
  return rows;
}

// ─── Swagger shared parameter definitions ────────────────────────────────────
// (referenced via $ref in individual endpoints)

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
 *     ## Endpoints específicos por categoria
 *
 *     Além do endpoint geral, existem rotas dedicadas para cada tipo de ação.
 *     Todos aceitam os mesmos filtros opcionais: `entidade_id`, `realizado_por`, `data_inicio`, `data_fim`, `limit`.
 *
 *     ### Gestão de Usuários
 *     ```
 *     GET /api/logs/usuarios                  → todos os logs de usuários
 *     GET /api/logs/usuarios/criacao          → criação de usuário
 *     GET /api/logs/usuarios/edicao           → edição de dados e mudança de permissões
 *     GET /api/logs/usuarios/troca-perfil     → troca de perfil (professor ↔ admin_cpd)
 *     GET /api/logs/usuarios/exclusao         → desativação (soft delete)
 *     ```
 *
 *     ### Gestão de Salas
 *     ```
 *     GET /api/logs/salas                     → todos os logs de salas
 *     GET /api/logs/salas/criacao             → criação de sala
 *     GET /api/logs/salas/edicao              → edição (mudança de capacidade, etc.)
 *     GET /api/logs/salas/indisponibilidade   → sala marcada como indisponível / excluída
 *     ```
 *
 *     ### Reservas
 *     ```
 *     GET /api/logs/reservas                         → todos os logs de reservas
 *     GET /api/logs/reservas/cancelamento-forcado    → cancelamentos por administradores
 *     GET /api/logs/reservas/edicao                  → alterações manuais e correções
 *     GET /api/logs/reservas/cancelamento            → cancelamentos pelo próprio titular
 *     ```
 *
 *     ---
 *
 *     ## Ações registradas
 *
 *     | Ação | Quando é gerada |
 *     |---|---|
 *     | `usuario.criacao` | Novo usuário cadastrado |
 *     | `usuario.edicao` | Dados alterados (nome, e-mail, ativo, permissões) |
 *     | `usuario.troca_perfil` | Tipo alterado (professor ↔ admin_cpd) |
 *     | `usuario.exclusao` | Usuário desativado (soft delete) |
 *     | `sala.criacao` | Nova sala cadastrada |
 *     | `sala.edicao` | Dados da sala alterados (capacidade, etc.) |
 *     | `sala.indisponibilidade` | Sala desativada |
 *     | `reserva.criacao` | Nova reserva criada |
 *     | `reserva.edicao` | Reserva alterada manualmente |
 *     | `reserva.cancelamento` | Cancelada pelo próprio titular |
 *     | `reserva.cancelamento_forcado` | Cancelada por um administrador |
 */

// ─── Shared Swagger parameters (used by all log endpoints) ───────────────────
/**
 * @swagger
 * components:
 *   parameters:
 *     LogEntidadeId:
 *       in: query
 *       name: entidade_id
 *       schema:
 *         type: string
 *         format: uuid
 *       description: "Filtra pelo ID da entidade afetada"
 *     LogRealizadoPor:
 *       in: query
 *       name: realizado_por
 *       schema:
 *         type: string
 *         format: uuid
 *       description: "Filtra pelas ações realizadas por um usuário específico"
 *     LogDataInicio:
 *       in: query
 *       name: data_inicio
 *       schema:
 *         type: string
 *         format: date
 *       description: "Data de início do filtro (YYYY-MM-DD)"
 *     LogDataFim:
 *       in: query
 *       name: data_fim
 *       schema:
 *         type: string
 *         format: date
 *       description: "Data de fim do filtro (YYYY-MM-DD, inclusivo)"
 *     LogLimit:
 *       in: query
 *       name: limit
 *       schema:
 *         type: integer
 *         minimum: 1
 *         maximum: 500
 *         default: 100
 *       description: "Máximo de registros retornados (padrão 100, máx 500)"
 */

// ════════════════════════════════════════════════════════════════════════════
//  GET /api/logs  —  endpoint geral com todos os filtros
// ════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/logs:
 *   get:
 *     summary: Consulta o log de auditoria com filtros livres
 *     tags: [Logs]
 *     description: |
 *       Retorna as entradas do log de auditoria, ordenadas da mais recente para a mais antiga.
 *       Todos os filtros são opcionais e combináveis.
 *
 *       **Exemplos de uso:**
 *
 *       **1. Todas as ações (últimas 100)**
 *       ```
 *       GET /api/logs
 *       ```
 *
 *       **2. Apenas logs de usuários**
 *       ```
 *       GET /api/logs?entidade=usuario
 *       ```
 *
 *       **3. Apenas logs de salas**
 *       ```
 *       GET /api/logs?entidade=sala
 *       ```
 *
 *       **4. Apenas logs de reservas**
 *       ```
 *       GET /api/logs?entidade=reserva
 *       ```
 *
 *       **5. Ação específica — cancelamentos forçados por admins**
 *       ```
 *       GET /api/logs?acao=reserva.cancelamento_forcado
 *       ```
 *
 *       **6. Ação específica — trocas de perfil**
 *       ```
 *       GET /api/logs?acao=usuario.troca_perfil
 *       ```
 *
 *       **7. Histórico completo de um usuário específico (como entidade afetada)**
 *       ```
 *       GET /api/logs?entidade=usuario&entidade_id=<uuid-do-usuario>
 *       ```
 *
 *       **8. Tudo que um admin fez**
 *       ```
 *       GET /api/logs?realizado_por=<uuid-do-admin>
 *       ```
 *
 *       **9. Filtrar por período**
 *       ```
 *       GET /api/logs?data_inicio=2026-04-01&data_fim=2026-04-30
 *       ```
 *
 *       **10. Combinar filtros — cancelamentos forçados por um admin em um dia**
 *       ```
 *       GET /api/logs?acao=reserva.cancelamento_forcado&realizado_por=<uuid>&data_inicio=2026-04-16&data_fim=2026-04-16
 *       ```
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
 *       - $ref: '#/components/parameters/LogEntidadeId'
 *       - $ref: '#/components/parameters/LogRealizadoPor'
 *       - $ref: '#/components/parameters/LogDataInicio'
 *       - $ref: '#/components/parameters/LogDataFim'
 *       - $ref: '#/components/parameters/LogLimit'
 *     responses:
 *       200:
 *         description: Lista de logs retornada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LogEntry'
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
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/', async (req, res) => {
  // The general endpoint also supports free ?entidade and ?acao filters
  const { entidade, acao } = req.query;
  try {
    res.json(await consultarLogs({ entidade, acao }, req));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  GESTÃO DE USUÁRIOS
// ════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/logs/usuarios:
 *   get:
 *     summary: Todos os logs de gestão de usuários
 *     tags: [Logs]
 *     description: Retorna todas as ações realizadas sobre usuários (criação, edição, troca de perfil, exclusão).
 *     parameters:
 *       - $ref: '#/components/parameters/LogEntidadeId'
 *       - $ref: '#/components/parameters/LogRealizadoPor'
 *       - $ref: '#/components/parameters/LogDataInicio'
 *       - $ref: '#/components/parameters/LogDataFim'
 *       - $ref: '#/components/parameters/LogLimit'
 *     responses:
 *       200:
 *         description: Logs retornados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LogEntry'
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/usuarios', async (req, res) => {
  try {
    res.json(await consultarLogs({ entidade: 'usuario' }, req));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/logs/usuarios/criacao:
 *   get:
 *     summary: Logs de criação de usuário
 *     tags: [Logs]
 *     description: Retorna os logs da ação `usuario.criacao` — novos usuários cadastrados no sistema.
 *     parameters:
 *       - $ref: '#/components/parameters/LogEntidadeId'
 *       - $ref: '#/components/parameters/LogRealizadoPor'
 *       - $ref: '#/components/parameters/LogDataInicio'
 *       - $ref: '#/components/parameters/LogDataFim'
 *       - $ref: '#/components/parameters/LogLimit'
 *     responses:
 *       200:
 *         description: Logs retornados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LogEntry'
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/usuarios/criacao', async (req, res) => {
  try {
    res.json(await consultarLogs({ acao: 'usuario.criacao' }, req));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/logs/usuarios/edicao:
 *   get:
 *     summary: Logs de edição de usuário (inclui mudança de permissões)
 *     tags: [Logs]
 *     description: |
 *       Retorna os logs da ação `usuario.edicao` — alterações em nome, e-mail, status ativo
 *       e demais campos, incluindo mudanças de permissão que não envolvam troca do tipo.
 *     parameters:
 *       - $ref: '#/components/parameters/LogEntidadeId'
 *       - $ref: '#/components/parameters/LogRealizadoPor'
 *       - $ref: '#/components/parameters/LogDataInicio'
 *       - $ref: '#/components/parameters/LogDataFim'
 *       - $ref: '#/components/parameters/LogLimit'
 *     responses:
 *       200:
 *         description: Logs retornados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LogEntry'
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/usuarios/edicao', async (req, res) => {
  try {
    res.json(await consultarLogs({ acao: 'usuario.edicao' }, req));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/logs/usuarios/troca-perfil:
 *   get:
 *     summary: Logs de troca de perfil (professor ↔ admin_cpd)
 *     tags: [Logs]
 *     description: Retorna os logs da ação `usuario.troca_perfil` — alterações no campo `tipo` do usuário.
 *     parameters:
 *       - $ref: '#/components/parameters/LogEntidadeId'
 *       - $ref: '#/components/parameters/LogRealizadoPor'
 *       - $ref: '#/components/parameters/LogDataInicio'
 *       - $ref: '#/components/parameters/LogDataFim'
 *       - $ref: '#/components/parameters/LogLimit'
 *     responses:
 *       200:
 *         description: Logs retornados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LogEntry'
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/usuarios/troca-perfil', async (req, res) => {
  try {
    res.json(await consultarLogs({ acao: 'usuario.troca_perfil' }, req));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/logs/usuarios/exclusao:
 *   get:
 *     summary: Logs de exclusão de usuário
 *     tags: [Logs]
 *     description: Retorna os logs da ação `usuario.exclusao` — usuários desativados via soft delete (`ativo = false`).
 *     parameters:
 *       - $ref: '#/components/parameters/LogEntidadeId'
 *       - $ref: '#/components/parameters/LogRealizadoPor'
 *       - $ref: '#/components/parameters/LogDataInicio'
 *       - $ref: '#/components/parameters/LogDataFim'
 *       - $ref: '#/components/parameters/LogLimit'
 *     responses:
 *       200:
 *         description: Logs retornados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LogEntry'
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/usuarios/exclusao', async (req, res) => {
  try {
    res.json(await consultarLogs({ acao: 'usuario.exclusao' }, req));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  GESTÃO DE SALAS
// ════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/logs/salas:
 *   get:
 *     summary: Todos os logs de gestão de salas
 *     tags: [Logs]
 *     description: Retorna todas as ações realizadas sobre salas (criação, edição, indisponibilidade).
 *     parameters:
 *       - $ref: '#/components/parameters/LogEntidadeId'
 *       - $ref: '#/components/parameters/LogRealizadoPor'
 *       - $ref: '#/components/parameters/LogDataInicio'
 *       - $ref: '#/components/parameters/LogDataFim'
 *       - $ref: '#/components/parameters/LogLimit'
 *     responses:
 *       200:
 *         description: Logs retornados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LogEntry'
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/salas', async (req, res) => {
  try {
    res.json(await consultarLogs({ entidade: 'sala' }, req));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/logs/salas/criacao:
 *   get:
 *     summary: Logs de criação de sala
 *     tags: [Logs]
 *     description: Retorna os logs da ação `sala.criacao` — novas salas cadastradas no sistema.
 *     parameters:
 *       - $ref: '#/components/parameters/LogEntidadeId'
 *       - $ref: '#/components/parameters/LogRealizadoPor'
 *       - $ref: '#/components/parameters/LogDataInicio'
 *       - $ref: '#/components/parameters/LogDataFim'
 *       - $ref: '#/components/parameters/LogLimit'
 *     responses:
 *       200:
 *         description: Logs retornados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LogEntry'
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/salas/criacao', async (req, res) => {
  try {
    res.json(await consultarLogs({ acao: 'sala.criacao' }, req));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/logs/salas/edicao:
 *   get:
 *     summary: Logs de edição de sala (mudança de capacidade, etc.)
 *     tags: [Logs]
 *     description: Retorna os logs da ação `sala.edicao` — alterações nos dados da sala como capacidade, tipo e nome.
 *     parameters:
 *       - $ref: '#/components/parameters/LogEntidadeId'
 *       - $ref: '#/components/parameters/LogRealizadoPor'
 *       - $ref: '#/components/parameters/LogDataInicio'
 *       - $ref: '#/components/parameters/LogDataFim'
 *       - $ref: '#/components/parameters/LogLimit'
 *     responses:
 *       200:
 *         description: Logs retornados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LogEntry'
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/salas/edicao', async (req, res) => {
  try {
    res.json(await consultarLogs({ acao: 'sala.edicao' }, req));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/logs/salas/indisponibilidade:
 *   get:
 *     summary: Logs de indisponibilidade / exclusão de sala
 *     tags: [Logs]
 *     description: |
 *       Retorna os logs da ação `sala.indisponibilidade` — salas marcadas como indisponíveis
 *       ou excluídas via soft delete (`ativo = false`).
 *     parameters:
 *       - $ref: '#/components/parameters/LogEntidadeId'
 *       - $ref: '#/components/parameters/LogRealizadoPor'
 *       - $ref: '#/components/parameters/LogDataInicio'
 *       - $ref: '#/components/parameters/LogDataFim'
 *       - $ref: '#/components/parameters/LogLimit'
 *     responses:
 *       200:
 *         description: Logs retornados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LogEntry'
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/salas/indisponibilidade', async (req, res) => {
  try {
    res.json(await consultarLogs({ acao: 'sala.indisponibilidade' }, req));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  RESERVAS
// ════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/logs/reservas:
 *   get:
 *     summary: Todos os logs de reservas
 *     tags: [Logs]
 *     description: Retorna todas as ações realizadas sobre reservas (criação, edição, cancelamentos).
 *     parameters:
 *       - $ref: '#/components/parameters/LogEntidadeId'
 *       - $ref: '#/components/parameters/LogRealizadoPor'
 *       - $ref: '#/components/parameters/LogDataInicio'
 *       - $ref: '#/components/parameters/LogDataFim'
 *       - $ref: '#/components/parameters/LogLimit'
 *     responses:
 *       200:
 *         description: Logs retornados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LogEntry'
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/reservas', async (req, res) => {
  try {
    res.json(await consultarLogs({ entidade: 'reserva' }, req));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/logs/reservas/cancelamento-forcado:
 *   get:
 *     summary: Logs de cancelamento forçado por administrador
 *     tags: [Logs]
 *     description: |
 *       Retorna os logs da ação `reserva.cancelamento_forcado` — reservas canceladas por um
 *       admin_cpd em nome do titular. O campo `detalhes` contém `cancelado_por`, `usuario_id_titular`,
 *       `data_reserva`, `turno` e `sala_id`.
 *     parameters:
 *       - $ref: '#/components/parameters/LogEntidadeId'
 *       - $ref: '#/components/parameters/LogRealizadoPor'
 *       - $ref: '#/components/parameters/LogDataInicio'
 *       - $ref: '#/components/parameters/LogDataFim'
 *       - $ref: '#/components/parameters/LogLimit'
 *     responses:
 *       200:
 *         description: Logs retornados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LogEntry'
 *             example:
 *               - id: "a1b2c3d4-0000-0000-0000-000000000003"
 *                 acao: "reserva.cancelamento_forcado"
 *                 entidade: "reserva"
 *                 entidade_id: "e9f0a1b2-0000-0000-0000-000000000099"
 *                 realizado_por: "f3a1c4d0-1234-5678-abcd-000000000001"
 *                 realizado_por_nome: "Admin CPD"
 *                 realizado_por_email: "admin@uniuv.edu.br"
 *                 detalhes:
 *                   cancelado_por: "f3a1c4d0-1234-5678-abcd-000000000001"
 *                   usuario_id_titular: "c22e2050-b098-4a4d-8661-2229a2c02f2d"
 *                   data_reserva: "2026-04-18"
 *                   turno: "matutino"
 *                   sala_id: "d7e8f900-0000-0000-0000-000000000010"
 *                 criado_em: "2026-04-16T16:45:00.000Z"
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/reservas/cancelamento-forcado', async (req, res) => {
  try {
    res.json(await consultarLogs({ acao: 'reserva.cancelamento_forcado' }, req));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/logs/reservas/edicao:
 *   get:
 *     summary: Logs de alteração manual e correção de conflito de reservas
 *     tags: [Logs]
 *     description: |
 *       Retorna os logs da ação `reserva.edicao` — cobre tanto **alterações manuais** (mudança
 *       de turno, aula, sala) quanto **correções de conflito** realizadas por administradores.
 *     parameters:
 *       - $ref: '#/components/parameters/LogEntidadeId'
 *       - $ref: '#/components/parameters/LogRealizadoPor'
 *       - $ref: '#/components/parameters/LogDataInicio'
 *       - $ref: '#/components/parameters/LogDataFim'
 *       - $ref: '#/components/parameters/LogLimit'
 *     responses:
 *       200:
 *         description: Logs retornados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LogEntry'
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/reservas/edicao', async (req, res) => {
  try {
    res.json(await consultarLogs({ acao: 'reserva.edicao' }, req));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/logs/reservas/cancelamento:
 *   get:
 *     summary: Logs de cancelamento pelo próprio titular
 *     tags: [Logs]
 *     description: Retorna os logs da ação `reserva.cancelamento` — reservas canceladas pelo professor titular.
 *     parameters:
 *       - $ref: '#/components/parameters/LogEntidadeId'
 *       - $ref: '#/components/parameters/LogRealizadoPor'
 *       - $ref: '#/components/parameters/LogDataInicio'
 *       - $ref: '#/components/parameters/LogDataFim'
 *       - $ref: '#/components/parameters/LogLimit'
 *     responses:
 *       200:
 *         description: Logs retornados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LogEntry'
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/reservas/cancelamento', async (req, res) => {
  try {
    res.json(await consultarLogs({ acao: 'reserva.cancelamento' }, req));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
