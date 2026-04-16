/**
 * Registra uma entrada no log de auditoria.
 * Erros de log nunca propagam — a requisição principal nunca é afetada.
 *
 * @param {object} pool     - Instância do pool PostgreSQL
 * @param {object} entrada
 * @param {string} entrada.acao          - Ex: 'usuario.edicao', 'reserva.cancelamento_forcado'
 * @param {string} entrada.entidade      - 'usuario' | 'sala' | 'reserva'
 * @param {string} [entrada.entidade_id] - UUID da entidade afetada
 * @param {string} [entrada.realizado_por] - UUID do usuário que realizou a ação
 * @param {object} [entrada.detalhes]    - Dados adicionais (campos alterados, valores, etc.)
 */
async function registrarLog(pool, { acao, entidade, entidade_id, realizado_por, detalhes }) {
  try {
    await pool.query(
      `INSERT INTO log_auditoria (acao, entidade, entidade_id, realizado_por, detalhes)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        acao,
        entidade,
        entidade_id || null,
        realizado_por || null,
        detalhes ? JSON.stringify(detalhes) : null,
      ]
    );
  } catch (err) {
    console.error('[log_auditoria] Erro ao registrar log:', err.message);
  }
}

module.exports = registrarLog;
