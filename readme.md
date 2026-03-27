# 🏫 Sistema de Gerenciamento de Salas e Laboratórios

> Sistema Web para reserva de salas e laboratórios da Universidade — Grupo 1

---

## 📋 Sobre o Projeto

Sistema web responsivo que permite o cadastro, visualização e reserva de espaços acadêmicos (salas de aula e laboratórios), com controle de disponibilidade em tempo real e gestão de agendamentos por professores e administradores.

| | |
|---|---|
| **Responsável (PO)** | Luan Alexandre Zahn |
| **Versão** | 1.0 |
| **Data** | 26 de Março de 2026 |
| **Entrega 1ª Sprint** | 01 de Abril de 2026 |

---

## ✅ Funcionalidades Básicas

- Cadastro de salas e laboratórios
- Listagem de salas disponíveis
- Reserva de sala (data e horário)
- Visualização das reservas
- Cancelamento de reserva

---

## 📦 Backlog Inicial

### 🏢 Cadastro de Espaços
Interface para administradores cadastrarem salas com os seguintes atributos:
- Nome / Número
- Bloco
- Capacidade de alunos
- Recursos (Ar-condicionado, Projetor, Computadores)

### 🔍 Consulta de Disponibilidade
Visualização em tempo real dos espaços livres em um período, com os seguintes filtros:
- Data
- Turno (Matutino / Vespertino / Noturno)
- Tipo de Sala

### 📅 Sistema de Reservas
Processo de seleção e ocupação de um espaço por usuário autenticado, seguindo as regras:
- Não permitir reservas em horários retroativos
- Impedir que uma sala receba duas reservas no mesmo intervalo de tempo
- Cada professor pode reservar salas apenas para o mês corrente, sem avançar para o mês seguinte *(ex.: em qualquer dia de maio, as reservas são permitidas somente até 31 de maio)*
- Em cada período (turno), há 4 aulas, sendo permitido reservar salas diferentes para cada uma delas
- O administrador do CPD pode criar reservas em nome de um professor

### 📊 Gestão de Reservas Ativas
Painel com agendamentos confirmados do usuário, contendo:
- Localização (bloco)
- Data
- Horário de início e término

### 📈 Geração de Relatórios
Funcionalidade para administradores consultarem e exportarem dados sobre a utilização dos espaços:
- **Diário** — salas utilizadas e reservadas no dia
- **Semanal** — ocupação dos espaços ao longo da semana
- **Mensal** — total de reservas e salas ocupadas no mês
- **Semestral** — visão ampla da utilização ao longo do semestre

### ❌ Cancelamento de Reserva
Funcionalidade para liberar um espaço previamente agendado:
- A sala retorna ao estado **"Disponível"** imediatamente após o cancelamento
- O administrador do CPD pode cancelar reservas feitas por professores

---

## ⚙️ Requisitos Técnicos e Usabilidade

- **Plataforma:** Sistema Web Responsivo (acessível via Desktop e Mobile)
- **Autenticação:** Integração com o login institucional da universidade
- **Interface:** Design limpo e intuitivo, priorizando a facilidade de navegação

---

## 🗺️ Roadmap

```
MVP 01 ──► Cadastros de Salas e Funcionários
MVP 02 ──► Motor de Reservas e Validação de Conflitos
MVP 03 ──► Painel do Usuário e Cancelamentos
 V1.1 ──► Notificações por E-mail e Relatório de Uso
```

---

## 🚀 Sprint Atual — Entrega: 01/04/2026

Entregar a base de cadastros e a visualização principal do sistema.

### Backend & Frontend — Cadastros
- [ ] Telas e banco de dados prontos para cadastrar **Salas e Laboratórios**
- [ ] Telas e banco de dados prontos para cadastrar **Usuários (ADM / Professores)**
- [ ] Telas e banco de dados prontos para cadastrar **Equipamentos** (Projetor, Ar-condicionado, etc.)

### Interface & Design
- [ ] **Página Inicial** — design limpo focado na busca de salas
- [ ] **Mapa de Ocupação** — visualização clara de quais salas estão **LIVRES** e quais estão **RESERVADAS**
- [ ] **Formulários** — telas de cadastro simples e fáceis de preencher

---

## 🗄️ Modelo do Banco de Dados

```
USUARIO
  id          uuid        PK
  nome        string
  email       string
  senha_hash  string
  tipo        enum        (professor | admin_cpd)
  ativo       boolean
  criado_em   timestamp

SALA
  id           uuid       PK
  nome_numero  string
  bloco        string
  capacidade   int
  tipo_sala    enum
  ativo        boolean
  criado_em    timestamp

EQUIPAMENTO
  id        uuid    PK
  nome      string
  descricao string

SALA_EQUIPAMENTO  (pivot)
  sala_id        uuid    FK → SALA
  equipamento_id uuid    FK → EQUIPAMENTO
  quantidade     int

RESERVA
  id           uuid       PK
  sala_id      uuid       FK → SALA
  usuario_id   uuid       FK → USUARIO  (quem reservou)
  criado_por   uuid       FK → USUARIO  (quem registrou — pode ser ADM)
  data         date
  turno        enum       (matutino | vespertino | noturno)
  aula_numero  int        (1–4)
  hora_inicio  time
  hora_fim     time
  status       enum       (ativa | cancelada | concluida)
  motivo       string
  criado_em    timestamp
  cancelado_em timestamp
  cancelado_por uuid      FK → USUARIO
```

**Relacionamentos:**
- `USUARIO` 1—N `RESERVA` (realiza)
- `USUARIO` 1—N `RESERVA` (cria em nome de — campo `criado_por`)
- `SALA` 1—N `RESERVA`
- `SALA` N—N `EQUIPAMENTO` via `SALA_EQUIPAMENTO`

> As regras de negócio (ex.: não permitir reservas retroativas, limitar ao mês corrente) são aplicadas na camada de aplicação (backend), não no banco de dados.

---

## 👥 Grupo 1

| Papel | Nome |
|---|---|
| Product Owner | Luan Alexandre Zahn |