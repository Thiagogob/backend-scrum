-- ============================================================
-- Sistema de Gerenciamento de Salas e Laboratórios
-- Supabase / PostgreSQL — Schema completo com Auth
-- ============================================================


-- ============================================================
-- EXTENSÕES
-- ============================================================

create extension if not exists "pgcrypto";


-- ============================================================
-- ENUMS
-- ============================================================

create type tipo_usuario  as enum ('professor', 'admin_cpd');
create type tipo_sala     as enum ('sala_aula', 'laboratorio');
create type turno         as enum ('matutino', 'vespertino', 'noturno');
create type status_reserva as enum ('ativa', 'cancelada', 'concluida');


-- ============================================================
-- USUARIO
-- ============================================================

create table public.usuario (
  id          uuid          primary key default gen_random_uuid(),
  auth_id     uuid          unique references auth.users(id) on delete cascade,
  nome        text          not null,
  email       text          not null unique,
  tipo        tipo_usuario  not null default 'professor',
  ativo       boolean       not null default true,
  criado_em   timestamptz   not null default now()
);

comment on table  public.usuario          is 'Professores e administradores do CPD.';
comment on column public.usuario.auth_id  is 'Vínculo com o usuário autenticado no Supabase Auth.';
comment on column public.usuario.tipo     is 'professor = docente | admin_cpd = administrador do CPD.';


-- ============================================================
-- SALA
-- ============================================================

create table public.sala (
  id           uuid       primary key default gen_random_uuid(),
  nome_numero  text       not null,
  bloco        text       not null,
  capacidade   int        not null check (capacidade > 0),
  tipo_sala    tipo_sala  not null default 'sala_aula',
  ativo        boolean    not null default true,
  criado_em    timestamptz not null default now()
);

comment on table public.sala is 'Salas de aula e laboratórios disponíveis para reserva.';


-- ============================================================
-- EQUIPAMENTO
-- ============================================================

create table public.equipamento (
  id        uuid  primary key default gen_random_uuid(),
  nome      text  not null unique,
  descricao text
);

comment on table public.equipamento is 'Recursos disponíveis nas salas (projetor, ar-condicionado, etc.).';


-- ============================================================
-- SALA_EQUIPAMENTO  (pivot N:N)
-- ============================================================

create table public.sala_equipamento (
  sala_id        uuid  not null references public.sala(id)        on delete cascade,
  equipamento_id uuid  not null references public.equipamento(id) on delete cascade,
  quantidade     int   not null default 1 check (quantidade > 0),
  primary key (sala_id, equipamento_id)
);

comment on table public.sala_equipamento is 'Equipamentos presentes em cada sala e suas quantidades.';


-- ============================================================
-- RESERVA
-- ============================================================

create table public.reserva (
  id            uuid           primary key default gen_random_uuid(),

  sala_id       uuid           not null references public.sala(id)    on delete restrict,
  usuario_id    uuid           not null references public.usuario(id) on delete restrict,
  criado_por    uuid           not null references public.usuario(id) on delete restrict,

  data          date           not null,
  turno         turno          not null,
  aula_numero   smallint       not null check (aula_numero between 1 and 4),
  hora_inicio   time           not null,
  hora_fim      time           not null check (hora_fim > hora_inicio),

  status        status_reserva not null default 'ativa',
  motivo        text,

  criado_em     timestamptz    not null default now(),
  cancelado_em  timestamptz,
  cancelado_por uuid           references public.usuario(id) on delete restrict,

  -- impede duas reservas para a mesma sala no mesmo turno/aula
  unique (sala_id, data, turno, aula_numero)
);

comment on table  public.reserva              is 'Agendamentos de salas e laboratórios.';
comment on column public.reserva.usuario_id   is 'Professor titular da reserva.';
comment on column public.reserva.criado_por   is 'Usuário que registrou — pode ser admin_cpd agindo em nome do professor.';
comment on column public.reserva.aula_numero  is 'Número da aula dentro do turno (1 a 4).';
comment on column public.reserva.cancelado_por is 'Quem realizou o cancelamento.';


-- ============================================================
-- LOG DE AUDITORIA
-- ============================================================

create table public.log_auditoria (
  id             uuid        primary key default gen_random_uuid(),
  acao           text        not null,
  entidade       text        not null,
  entidade_id    uuid,
  realizado_por  uuid        references public.usuario(id) on delete set null,
  detalhes       jsonb,
  criado_em      timestamptz not null default now()
);

comment on table  public.log_auditoria              is 'Trilha de auditoria de ações realizadas no sistema.';
comment on column public.log_auditoria.acao         is 'Ação realizada. Ex: usuario.bloqueio, sala.criacao, reserva.cancelamento_forcado.';
comment on column public.log_auditoria.entidade     is 'Tipo da entidade afetada: usuario | sala | reserva.';
comment on column public.log_auditoria.entidade_id  is 'UUID da entidade afetada.';
comment on column public.log_auditoria.realizado_por is 'Usuário que realizou a ação (nulo se não autenticado).';
comment on column public.log_auditoria.detalhes     is 'Dados adicionais da ação em formato JSON (campos alterados, valores, etc.).';


-- ============================================================
-- ÍNDICES
-- ============================================================

create index idx_reserva_sala_data  on public.reserva      (sala_id, data, turno);
create index idx_reserva_usuario    on public.reserva      (usuario_id, data);
create index idx_sala_bloco_ativo   on public.sala         (bloco, ativo);
create index idx_usuario_auth_id    on public.usuario      (auth_id);
create index idx_usuario_email      on public.usuario      (email);
create index idx_log_entidade       on public.log_auditoria (entidade, entidade_id);
create index idx_log_acao           on public.log_auditoria (acao);
create index idx_log_realizado_por  on public.log_auditoria (realizado_por);
create index idx_log_criado_em      on public.log_auditoria (criado_em desc);


-- ============================================================
-- TRIGGER — cria registro em usuario ao cadastrar no Auth
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.usuario (auth_id, nome, email, tipo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', new.email),
    new.email,
    coalesce(
      (new.raw_user_meta_data->>'tipo')::tipo_usuario,
      'professor'   -- padrão: todo novo cadastro é professor
    )
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table public.usuario         enable row level security;
alter table public.sala             enable row level security;
alter table public.equipamento      enable row level security;
alter table public.sala_equipamento enable row level security;
alter table public.reserva          enable row level security;


-- Helper: retorna o registro do usuário logado
create or replace function public.usuario_atual()
returns public.usuario
language sql
security definer set search_path = public
stable
as $$
  select * from public.usuario where auth_id = auth.uid() limit 1;
$$;

-- Helper: retorna true se o usuário logado é admin_cpd
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.usuario
    where auth_id = auth.uid() and tipo = 'admin_cpd'
  );
$$;


-- ------------------------------------------------------------
-- USUARIO
-- ------------------------------------------------------------

-- Cada um vê apenas o próprio perfil; admin vê todos
create policy "usuario: select proprio ou admin"
  on public.usuario for select
  using (
    auth_id = auth.uid() or public.is_admin()
  );

-- Cada um edita apenas o próprio perfil
create policy "usuario: update proprio"
  on public.usuario for update
  using (auth_id = auth.uid());

-- Apenas admin pode inserir usuários manualmente
-- (cadastro normal é feito pelo trigger handle_new_user)
create policy "usuario: insert apenas admin"
  on public.usuario for insert
  with check (public.is_admin());

-- Apenas admin pode desativar/excluir usuários
create policy "usuario: delete apenas admin"
  on public.usuario for delete
  using (public.is_admin());


-- ------------------------------------------------------------
-- SALA
-- ------------------------------------------------------------

-- Qualquer autenticado pode consultar salas ativas
create policy "sala: select autenticado"
  on public.sala for select
  using (auth.uid() is not null);

-- Apenas admin pode cadastrar, editar e desativar salas
create policy "sala: insert apenas admin"
  on public.sala for insert
  with check (public.is_admin());

create policy "sala: update apenas admin"
  on public.sala for update
  using (public.is_admin());

create policy "sala: delete apenas admin"
  on public.sala for delete
  using (public.is_admin());


-- ------------------------------------------------------------
-- EQUIPAMENTO
-- ------------------------------------------------------------

-- Qualquer autenticado pode consultar equipamentos
create policy "equipamento: select autenticado"
  on public.equipamento for select
  using (auth.uid() is not null);

-- Apenas admin gerencia equipamentos
create policy "equipamento: escrita apenas admin"
  on public.equipamento for all
  using (public.is_admin());


-- ------------------------------------------------------------
-- SALA_EQUIPAMENTO
-- ------------------------------------------------------------

create policy "sala_equipamento: select autenticado"
  on public.sala_equipamento for select
  using (auth.uid() is not null);

create policy "sala_equipamento: escrita apenas admin"
  on public.sala_equipamento for all
  using (public.is_admin());


-- ------------------------------------------------------------
-- RESERVA
-- ------------------------------------------------------------

-- Professor vê as próprias reservas; admin vê todas
create policy "reserva: select proprio ou admin"
  on public.reserva for select
  using (
    exists (
      select 1 from public.usuario u
      where u.auth_id = auth.uid()
        and (u.id = reserva.usuario_id or u.tipo = 'admin_cpd')
    )
  );

-- Qualquer autenticado pode criar uma reserva
create policy "reserva: insert autenticado"
  on public.reserva for insert
  with check (auth.uid() is not null);

-- Professor cancela apenas a própria reserva; admin cancela qualquer uma
create policy "reserva: update proprio ou admin"
  on public.reserva for update
  using (
    exists (
      select 1 from public.usuario u
      where u.auth_id = auth.uid()
        and (u.id = reserva.usuario_id or u.tipo = 'admin_cpd')
    )
  );

-- Apenas admin pode deletar fisicamente um registro
create policy "reserva: delete apenas admin"
  on public.reserva for delete
  using (public.is_admin());


-- ============================================================
-- SEED — dados iniciais
-- ============================================================

insert into public.equipamento (nome, descricao) values
  ('Projetor',        'Projetor multimídia HDMI/VGA'),
  ('Ar-condicionado', 'Ar-condicionado split'),
  ('Computadores',    'Computadores para uso dos alunos'),
  ('Quadro branco',   'Quadro branco com marcadores'),
  ('Televisão',       'TV 55" para apresentações');