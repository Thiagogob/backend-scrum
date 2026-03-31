const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Sistema de Reserva de Salas e Laboratórios',
      version: '1.0.0',
      description:
        'API REST para gerenciamento de salas, laboratórios, usuários e equipamentos universitários.',
    },
    servers: [
      {
        url: 'https://backend-scrum-production.up.railway.app',
        description: 'Servidor de produção (Railway)',
      },
      {
        url: `http://localhost:${process.env.PORT || 3003}`,
        description: 'Servidor local',
      },
    ],
    components: {
      schemas: {
        Sala: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            nome_numero: { type: 'string', example: 'A-101' },
            bloco: { type: 'string', example: 'Bloco A' },
            capacidade: { type: 'integer', minimum: 1, example: 40 },
            tipo_sala: {
              type: 'string',
              enum: ['sala_aula', 'laboratorio'],
              example: 'sala_aula',
            },
            ativo: { type: 'boolean', example: true },
            criado_em: { type: 'string', format: 'date-time', readOnly: true },
          },
          required: ['nome_numero', 'bloco', 'capacidade', 'tipo_sala'],
        },
        Usuario: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            auth_id: { type: 'string', format: 'uuid', nullable: true },
            nome: { type: 'string', example: 'Prof. João Silva' },
            email: {
              type: 'string',
              format: 'email',
              example: 'joao.silva@universidade.edu.br',
            },
            tipo: {
              type: 'string',
              enum: ['professor', 'admin_cpd'],
              example: 'professor',
            },
            ativo: { type: 'boolean', example: true },
            criado_em: { type: 'string', format: 'date-time', readOnly: true },
          },
          required: ['nome', 'email', 'tipo'],
        },
        Equipamento: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            nome: { type: 'string', example: 'Projetor' },
            descricao: {
              type: 'string',
              nullable: true,
              example: 'Projetor multimídia HDMI/VGA',
            },
          },
          required: ['nome'],
        },
        SalaEquipamento: {
          type: 'object',
          properties: {
            equipamento_id: { type: 'string', format: 'uuid' },
            quantidade: { type: 'integer', minimum: 1, example: 2 },
          },
          required: ['equipamento_id', 'quantidade'],
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
