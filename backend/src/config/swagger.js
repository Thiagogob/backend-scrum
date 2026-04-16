const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Sistema de Reserva de Salas e Laboratórios',
      version: '1.0.0',
      description: `
## Sobre esta API

API REST do Sistema de Gerenciamento de Salas e Laboratórios Universitários.
Permite cadastrar salas, equipamentos e usuários, além de criar e gerenciar reservas de espaços.

---

## Como se autenticar

### No frontend (cookie automático)

O sistema usa **cookies httpOnly** para autenticação. O fluxo é simples:

1. Faça uma requisição **POST /api/auth/login** com email e senha
2. O backend define automaticamente um cookie chamado \`token\` no browser
3. A partir daí, o browser envia o cookie em todas as requisições ao backend automaticamente — **nenhum código extra é necessário**
4. Para encerrar a sessão, chame **POST /api/auth/logout** — o cookie é removido

O cookie é **httpOnly** (não acessível via JavaScript) e **SameSite=Lax** (proteção contra CSRF).
Expira em **8 horas**, igual ao JWT.

> **Atenção para o CORS:** o frontend precisa fazer as requisições com \`credentials: true\` (ou \`withCredentials: true\` no Axios/fetch), caso contrário o browser não enviará o cookie.
>
> Exemplo com fetch:
> \`{ method: 'POST', credentials: 'include', body: ... }\`
>
> Exemplo com Axios:
> \`axios.defaults.withCredentials = true\`

---

### No Swagger UI (Bearer token manual)

O Swagger UI não gerencia cookies automaticamente, então para testar rotas protegidas aqui:

1. Execute **POST /api/auth/login** — o campo \`token\` virá na resposta
2. Clique no botão **Authorize** (🔓) no topo desta página
3. Cole o token no campo **Value** e clique em **Authorize**

O token expira em **8 horas**.

---

## Turnos e Horários

As reservas são organizadas em **turnos** com **4 aulas** cada. Os horários são:

| Turno | Aula 1 | Aula 2 | Aula 3 | Aula 4 |
|---|---|---|---|---|
| **Matutino** | 08:00–08:50 | 08:55–09:45 | 09:55–10:45 | 10:50–11:40 |
| **Vespertino** | 13:00–13:50 | 13:55–14:45 | 14:55–15:45 | 15:50–16:40 |
| **Noturno** | 19:00–19:50 | 19:55–20:45 | 20:55–21:45 | 21:50–22:40 |

Use **GET /api/reservas/horarios** para buscar essa tabela dinamicamente no frontend.

---

## Regras de Negócio

- Não é permitido fazer reservas em **datas passadas**
- **Professores** só podem reservar salas dentro do **mês corrente**
- Uma sala **não pode ter duas reservas ativas** no mesmo turno e número de aula
- O **admin_cpd** pode criar reservas em nome de um professor usando o campo \`criado_por\`
- Salas e usuários usam **soft delete** — ao deletar, o registro é apenas desativado (\`ativo = false\`), não removido do banco
      `,
    },
    tags: [
      { name: 'Auth' },
      { name: 'Usuários' },
      { name: 'Salas' },
      { name: 'Equipamentos' },
      { name: 'Reservas' },
      { name: 'Relatórios' },
      { name: 'Logs' },
    ],
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
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT obtido em POST /api/auth/login. Válido por 8 horas.',
        },
      },
      schemas: {
        Sala: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              readOnly: true,
              description: 'Identificador único da sala, gerado automaticamente pelo banco.',
            },
            nome_numero: {
              type: 'string',
              example: 'A-101',
              description: 'Nome ou número identificador da sala. Ex: "A-101", "Lab-02", "Auditório Principal".',
            },
            bloco: {
              type: 'string',
              example: 'Bloco A',
              description: 'Bloco físico onde a sala se encontra. Ex: "Bloco A", "Bloco C", "Prédio Central".',
            },
            capacidade: {
              type: 'integer',
              minimum: 1,
              example: 40,
              description: 'Número máximo de alunos que a sala comporta. Deve ser um inteiro maior que zero.',
            },
            tipo_sala: {
              type: 'string',
              enum: ['sala_aula', 'laboratorio'],
              example: 'sala_aula',
              description: 'Tipo do espaço: "sala_aula" para salas convencionais, "laboratorio" para laboratórios de informática ou ciências.',
            },
            ativo: {
              type: 'boolean',
              example: true,
              description: 'Indica se a sala está disponível para reservas. Salas inativas não aparecem na consulta de disponibilidade. Ao deletar uma sala, este campo é definido como false (soft delete).',
            },
            criado_em: {
              type: 'string',
              format: 'date-time',
              readOnly: true,
              description: 'Data e hora em que a sala foi cadastrada. Gerado automaticamente.',
            },
          },
          required: ['nome_numero', 'bloco', 'capacidade', 'tipo_sala'],
        },
        Usuario: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              readOnly: true,
              description: 'Identificador único do usuário, gerado automaticamente.',
            },
            nome: {
              type: 'string',
              example: 'Prof. João Silva',
              description: 'Nome completo do usuário.',
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'joao.silva@uniuv.edu.br',
              description: 'E-mail institucional do usuário. Apenas @uniuv.edu.br e @unespar.edu.br são aceitos. Deve ser único no sistema.',
            },
            senha: {
              type: 'string',
              format: 'password',
              writeOnly: true,
              minLength: 6,
              example: 'senha123',
              description: 'Senha de acesso. Mínimo 6 caracteres. Nunca é retornada nas respostas da API.',
            },
            tipo: {
              type: 'string',
              enum: ['professor', 'admin_cpd'],
              example: 'professor',
              description: '"professor": pode criar reservas apenas no mês corrente. "admin_cpd": sem restrição de mês e pode criar reservas em nome de professores.',
            },
            ativo: {
              type: 'boolean',
              example: true,
              description: 'Indica se o usuário está ativo no sistema. Ao deletar um usuário, este campo é definido como false (soft delete).',
            },
            criado_em: {
              type: 'string',
              format: 'date-time',
              readOnly: true,
              description: 'Data e hora do cadastro do usuário. Gerado automaticamente.',
            },
          },
          required: ['nome', 'email', 'senha', 'tipo'],
        },
        Equipamento: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              readOnly: true,
              description: 'Identificador único do equipamento, gerado automaticamente.',
            },
            nome: {
              type: 'string',
              example: 'Projetor',
              description: 'Nome do equipamento. Deve ser único no sistema. Ex: "Projetor", "Ar-condicionado", "Lousa Digital".',
            },
            descricao: {
              type: 'string',
              nullable: true,
              example: 'Projetor multimídia HDMI/VGA',
              description: 'Descrição opcional com mais detalhes sobre o equipamento.',
            },
            sistema_operacional: {
              type: 'string',
              nullable: true,
              enum: ['Linux', 'macOS', 'Windows'],
              description: 'Sistema operacional instalado. Preencher apenas quando o equipamento for um computador. Para outros tipos de equipamento, omitir ou enviar null.',
            },
          },
          required: ['nome'],
        },
        SalaEquipamento: {
          type: 'object',
          description: 'Associação entre uma sala e um equipamento, com a quantidade disponível.',
          properties: {
            equipamento_id: {
              type: 'string',
              format: 'uuid',
              description: 'ID do equipamento a ser associado à sala.',
            },
            quantidade: {
              type: 'integer',
              minimum: 1,
              example: 2,
              description: 'Quantidade desse equipamento disponível na sala. Se a associação já existir, a quantidade é atualizada.',
            },
          },
          required: ['equipamento_id', 'quantidade'],
        },
        Reserva: {
          type: 'object',
          description: 'Representa uma reserva de sala ou laboratório. Os campos hora_inicio e hora_fim são calculados automaticamente com base no turno e aula_numero.',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              readOnly: true,
              description: 'Identificador único da reserva.',
            },
            sala_id: {
              type: 'string',
              format: 'uuid',
              description: 'ID da sala reservada.',
            },
            usuario_id: {
              type: 'string',
              format: 'uuid',
              description: 'ID do professor/usuário para quem a reserva foi feita.',
            },
            criado_por: {
              type: 'string',
              format: 'uuid',
              description: 'ID de quem criou a reserva. Quando um admin_cpd cria em nome de um professor, este campo contém o ID do admin. Se o próprio professor criou, é igual ao usuario_id.',
            },
            data: {
              type: 'string',
              format: 'date',
              example: '2026-04-10',
              description: 'Data da reserva no formato YYYY-MM-DD. Não pode ser uma data passada.',
            },
            turno: {
              type: 'string',
              enum: ['matutino', 'vespertino', 'noturno'],
              description: 'Turno da reserva. Determina o intervalo de horários disponíveis.',
            },
            aula_numero: {
              type: 'integer',
              minimum: 1,
              maximum: 4,
              example: 1,
              description: 'Número da aula dentro do turno (1 a 4). Combinado com o turno, determina o horário exato.',
            },
            hora_inicio: {
              type: 'string',
              example: '08:00',
              readOnly: true,
              description: 'Horário de início da aula. Calculado automaticamente pelo backend com base no turno e aula_numero.',
            },
            hora_fim: {
              type: 'string',
              example: '08:50',
              readOnly: true,
              description: 'Horário de término da aula. Calculado automaticamente pelo backend com base no turno e aula_numero.',
            },
            status: {
              type: 'string',
              enum: ['ativa', 'cancelada', 'concluida'],
              example: 'ativa',
              description: '"ativa": reserva confirmada e em vigor. "cancelada": reserva cancelada manualmente. "concluida": aula já ocorreu.',
            },
            disciplina: {
              type: 'string',
              nullable: true,
              example: 'Banco de Dados',
              description: 'Nome da disciplina ou motivo da reserva. Campo opcional.',
            },
            criado_em: {
              type: 'string',
              format: 'date-time',
              readOnly: true,
              description: 'Data e hora em que a reserva foi criada.',
            },
            cancelado_em: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              readOnly: true,
              description: 'Data e hora do cancelamento. Null enquanto a reserva estiver ativa.',
            },
            cancelado_por: {
              type: 'string',
              format: 'uuid',
              nullable: true,
              description: 'ID do usuário que cancelou a reserva. Null enquanto a reserva estiver ativa.',
            },
          },
        },
        ReservaInput: {
          type: 'object',
          required: ['sala_id', 'usuario_id', 'data', 'turno', 'aula_numero'],
          properties: {
            sala_id: {
              type: 'string',
              format: 'uuid',
              description: 'ID da sala a ser reservada. Deve estar ativa (ativo = true).',
            },
            usuario_id: {
              type: 'string',
              format: 'uuid',
              description: 'ID do professor para quem a reserva está sendo feita.',
            },
            criado_por: {
              type: 'string',
              format: 'uuid',
              description: 'Opcional. ID do admin_cpd que está criando a reserva em nome do professor. Se omitido, assume o valor de usuario_id.',
            },
            data: {
              type: 'string',
              format: 'date',
              example: '2026-04-10',
              description: 'Data da reserva (YYYY-MM-DD). Não pode ser no passado. Professores só podem reservar dentro do mês corrente.',
            },
            turno: {
              type: 'string',
              enum: ['matutino', 'vespertino', 'noturno'],
              description: 'Turno da reserva. Consulte GET /api/reservas/horarios para ver os horários de cada turno.',
            },
            aula_numero: {
              type: 'integer',
              minimum: 1,
              maximum: 4,
              example: 1,
              description: 'Número da aula (1 a 4). Junto com o turno, define o horário exato. Os campos hora_inicio e hora_fim são calculados automaticamente.',
            },
            disciplina: {
              type: 'string',
              nullable: true,
              example: 'Banco de Dados',
              description: 'Nome da disciplina ou motivo da reserva. Campo opcional.',
            },
          },
        },
        LogEntry: {
          type: 'object',
          properties: {
            id:                   { type: 'string', format: 'uuid' },
            acao:                 { type: 'string', example: 'usuario.troca_perfil' },
            entidade:             { type: 'string', enum: ['usuario', 'sala', 'reserva'] },
            entidade_id:          { type: 'string', format: 'uuid' },
            realizado_por:        { type: 'string', format: 'uuid' },
            realizado_por_nome:   { type: 'string', example: 'Admin CPD' },
            realizado_por_email:  { type: 'string', format: 'email' },
            detalhes:             { type: 'object', description: 'Dados adicionais da ação (campos alterados, valores, etc.)' },
            criado_em:            { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          description: 'Estrutura padrão de erro retornada pela API.',
          properties: {
            error: {
              type: 'string',
              description: 'Mensagem descrevendo o que deu errado.',
              example: 'Sala já reservada nesse horário',
            },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
