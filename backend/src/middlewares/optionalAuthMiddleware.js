const jwt = require('jsonwebtoken');

/**
 * Lê o JWT do cookie ou header Authorization, mas NÃO bloqueia a requisição se ausente/inválido.
 * Se válido, popula req.usuario igual ao authMiddleware.
 * Usado para capturar "quem realizou a ação" em rotas que não exigem autenticação obrigatória.
 */
function optionalAuthMiddleware(req, res, next) {
  let token = req.cookies?.token;

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (token) {
    try {
      req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    } catch (_) {
      // Token inválido ou expirado — ignora silenciosamente
    }
  }

  next();
}

module.exports = optionalAuthMiddleware;
