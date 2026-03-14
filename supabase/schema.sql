-- =============================================================================
-- SplitEase — Full Schema  (v2, multi-group ready)
-- Supabase / PostgreSQL  —  run in Supabase SQL Editor on a FRESH database.
--
-- For upgrading an EXISTING v1 database see:
--   supabase/migration_v2_groups.sql
-- =============================================================================

-- Enable the pgcrypto extension so gen_random_uuid() is available
-- (Supabase enables it by default; safe to run again)
create extension if not exists "pgcrypto";


-- =============================================================================
-- TABLE: groups
-- Each group represents one hostel room, apartment, or friend circle.
-- Members and expenses always belong to exactly one group.
-- =============================================================================
create table if not exists groups (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null check (char_length(name) between 1 and 100),
  description text        check (description is null or char_length(description) <= 300),
  invite_code text        unique,   -- reserved for future invite-link feature
  created_at  timestamptz not null default now()
);

comment on table  groups             is 'Each group is one hostel room / friend circle.';
comment on column groups.name        is 'Human-readable group name shown in the UI.';
comment on column groups.description is 'Optional longer description of the group.';
comment on column groups.invite_code is 'Future: unique token for invite links.';


-- =============================================================================
-- TABLE: members
-- One row per person in a group. A person in two groups = two rows.
-- =============================================================================
create table if not exists members (
  id         uuid        primary key default gen_random_uuid(),
  group_id   uuid        not null references groups (id)
                           on update cascade
                           on delete restrict,  -- cannot delete a group while members exist
  name       text        not null check (char_length(name) between 1 and 100),
  nickname   text        check (nickname is null or char_length(nickname) between 1 and 50),
  email      text,                -- nullable; uniqueness enforced per-group (see below)
  created_at timestamptz not null default now(),

  -- Email must be unique within a group (two different groups may share an email)
  unique (group_id, email)
);

comment on table  members          is 'Members who share expenses inside one group.';
comment on column members.group_id is 'The group this member belongs to.';
comment on column members.name     is 'Full display name of the member.';
comment on column members.nickname is 'Optional short name shown in lists and avatars.';
comment on column members.email    is 'Optional contact email, unique within the group.';

create index if not exists idx_members_group_id on members (group_id);

-- ── v1 compatibility note ────────────────────────────────────────────────────
-- If you ran the v1 schema, members had a global UNIQUE constraint on email.
-- The v2 unique constraint above is per-group.  Run the migration script to
-- safely transition — it will not break existing data.
-- ─────────────────────────────────────────────────────────────────────────────


-- =============================================================================
-- TABLE: expenses
-- One row per purchase or bill inside a group.
-- =============================================================================
create table if not exists expenses (
  id         uuid           primary key default gen_random_uuid(),
  group_id   uuid           not null references groups (id)
                              on update cascade
                              on delete restrict,  -- cannot delete group with expenses
  title      text           not null check (char_length(title) between 1 and 200),
  amount     numeric(10, 2) not null check (amount > 0),
  paid_by    uuid           not null references members (id)
                              on update cascade
                              on delete restrict,  -- block member deletion if they have expenses
  date       date           not null default current_date,
  note       text           check (note is null or char_length(note) <= 500),
  created_at timestamptz    not null default now()
);

comment on table  expenses          is 'Each shared purchase or bill paid by one member of a group.';
comment on column expenses.group_id is 'The group this expense belongs to.';
comment on column expenses.title    is 'Short description of what was bought/paid.';
comment on column expenses.amount   is 'Total amount paid, always positive.';
comment on column expenses.paid_by  is 'The member who physically paid for this expense.';
comment on column expenses.date     is 'The date the purchase was made (not the entry date).';
comment on column expenses.note     is 'Optional free-text note about the expense.';

create index if not exists idx_expenses_group_id on expenses (group_id);
create index if not exists idx_expenses_paid_by  on expenses (paid_by);
create index if not exists idx_expenses_date     on expenses (date desc);


-- =============================================================================
-- TABLE: expense_participants
-- Maps which members share each expense and stores their pre-computed share.
-- Splitting is always equal: share_amount = expense.amount / participant count.
-- No group_id needed here — it is implied via the expense FK.
-- =============================================================================
create table if not exists expense_participants (
  id            uuid           primary key default gen_random_uuid(),
  expense_id    uuid           not null references expenses (id)
                                 on update cascade
                                 on delete cascade,  -- remove splits when expense is deleted
  member_id     uuid           not null references members (id)
                                 on update cascade
                                 on delete restrict, -- block member deletion if they have splits
  share_amount  numeric(10, 2) not null check (share_amount > 0),
  created_at    timestamptz    not null default now(),

  unique (expense_id, member_id) -- a member can only appear once per expense
);

comment on table  expense_participants              is 'Which members share each expense and how much each owes.';
comment on column expense_participants.share_amount is 'Equal share = expense.amount / count of participants, stored at insert time.';

create index if not exists idx_expense_participants_expense on expense_participants (expense_id);
create index if not exists idx_expense_participants_member  on expense_participants (member_id);


-- =============================================================================
-- TABLE: settlements
-- Records a cash payment from one member to another to pay off balance debt.
-- This is NOT an expense — nobody bought anything.
-- It simply reduces what the payer owes and what the receiver is owed.
--
-- Effect on balance formula:
--   balance = (total_paid_expenses + total_settlements_received)
--           - (total_owed_expenses  + total_settlements_made)
--
-- Example: Rafi has +500, Sabbir has -500. Rafi (giver) gives Sabbir (receiver) 500 cash:
--   Rafi:   settlements_made=500     → DEBIT side  → balance goes from +500 → 0  ✓
--   Sabbir: settlements_received=500 → CREDIT side → balance goes from -500 → 0  ✓
--   Net across all members: still 0 (settlements are zero-sum)
-- =============================================================================
create table if not exists settlements (
  id          uuid           primary key default gen_random_uuid(),
  group_id    uuid           references groups (id)
                               on update cascade
                               on delete restrict,  -- nullable during v1→v2 migration
  paid_by     uuid           not null references members (id)
                               on update cascade
                               on delete restrict,  -- keep settlement history
  paid_to     uuid           not null references members (id)
                               on update cascade
                               on delete restrict,
  amount      numeric(10, 2) not null check (amount > 0),
  date        date           not null default current_date,
  note        text           check (note is null or char_length(note) <= 300),
  created_at  timestamptz    not null default now(),

  -- A member cannot settle with themselves
  constraint settlements_no_self_payment check (paid_by <> paid_to)
);

comment on table  settlements        is 'Cash payments between members to settle balance debt. Not an expense.';
comment on column settlements.paid_by is 'Member who handed over the cash.';
comment on column settlements.paid_to is 'Member who received the cash.';
comment on column settlements.amount  is 'Amount transferred, always positive.';
comment on column settlements.note    is 'Optional note, e.g. "via bKash" or "March settlement".';

create index if not exists idx_settlements_paid_by on settlements (paid_by);
create index if not exists idx_settlements_paid_to on settlements (paid_to);
create index if not exists idx_settlements_date    on settlements (date desc);


-- =============================================================================
-- TABLE: cover_bills
-- A balance transfer where a positive-balance member absorbs part of a
-- negative-balance member's debt. No cash changes hands.
--
-- This is DIFFERENT from a settlement:
--   Settlement  = debtor hands physical cash to creditor
--   Cover bill  = creditor transfers their credit balance to the debtor
--
-- Effect:
--   helper balance      -= amount   (credit consumed)
--   beneficiary balance += amount   (debt reduced)
-- =============================================================================
create table if not exists cover_bills (
  id             uuid           primary key default gen_random_uuid(),
  group_id       uuid           references groups (id)
                                  on update cascade
                                  on delete restrict,
  helper_id      uuid           not null references members (id)
                                  on update cascade
                                  on delete restrict,
  beneficiary_id uuid           not null references members (id)
                                  on update cascade
                                  on delete restrict,
  amount         numeric(10, 2) not null check (amount > 0),
  date           date           not null default current_date,
  note           text           check (note is null or char_length(note) <= 300),
  created_at     timestamptz    not null default now(),

  constraint cover_bills_no_self_cover check (helper_id <> beneficiary_id)
);

comment on table  cover_bills                is 'Balance transfers: helper absorbs beneficiary debt using positive balance. No cash moves.';
comment on column cover_bills.helper_id      is 'Member with positive balance who is covering the debt.';
comment on column cover_bills.beneficiary_id is 'Member with negative balance whose debt is being reduced.';
comment on column cover_bills.amount         is 'Amount of balance transferred, always positive.';

create index if not exists idx_cover_bills_helper_id      on cover_bills (helper_id);
create index if not exists idx_cover_bills_beneficiary_id on cover_bills (beneficiary_id);
create index if not exists idx_cover_bills_date           on cover_bills (date desc);


-- =============================================================================
-- VIEW: member_balances
-- Convenience view for per-member balance within their group context.
-- balance > 0  → others owe this member
-- balance < 0  → this member owes the group
--
-- Filtering to a specific group happens in the application layer by adding:
--   WHERE group_id = $1
-- (or via supabase .eq('group_id', groupId) on the query)
-- =============================================================================
create or replace view member_balances as
select
  m.id                                                                          as member_id,
  m.name                                                                        as member_name,
  m.email,
  m.group_id,
  coalesce(sum(e.amount)        filter (where e.paid_by           = m.id), 0)  as total_paid,
  coalesce(sum(ep.share_amount), 0)                                             as total_owed,
  coalesce(sum(s_out.amount)    filter (where s_out.paid_by       = m.id), 0)  as total_settlements_made,
  coalesce(sum(s_in.amount)     filter (where s_in.paid_to        = m.id), 0)  as total_settlements_received,
  coalesce(sum(cb_out.amount)   filter (where cb_out.helper_id    = m.id), 0)  as total_cover_bills_given,
  coalesce(sum(cb_in.amount)    filter (where cb_in.beneficiary_id = m.id), 0) as total_cover_bills_received,
  (
    coalesce(sum(e.amount)       filter (where e.paid_by             = m.id), 0)
    + coalesce(sum(s_in.amount)  filter (where s_in.paid_to          = m.id), 0)
    + coalesce(sum(cb_in.amount) filter (where cb_in.beneficiary_id  = m.id), 0)
  ) - (
    coalesce(sum(ep.share_amount), 0)
    + coalesce(sum(s_out.amount)  filter (where s_out.paid_by        = m.id), 0)
    + coalesce(sum(cb_out.amount) filter (where cb_out.helper_id     = m.id), 0)
  )                                                                             as balance
from
  members m
  left join expenses             e      on e.paid_by            = m.id
  left join expense_participants ep     on ep.member_id          = m.id
  left join settlements          s_out  on s_out.paid_by         = m.id
  left join settlements          s_in   on s_in.paid_to          = m.id
  left join cover_bills          cb_out on cb_out.helper_id      = m.id
  left join cover_bills          cb_in  on cb_in.beneficiary_id  = m.id
group by
  m.id, m.name, m.email, m.group_id;

comment on view member_balances is
  'Full balance per member: (paid + settlements_received + cover_bills_received) - (owed + settlements_made + cover_bills_given).';
