-- =============================================================================
-- Migration v5 — Fix Settlement Direction in member_balances view
--
-- PROBLEM (old formula):
--   settlements_made     was on the CREDIT side → giver's balance INCREASED
--   settlements_received was on the DEBIT  side → receiver's balance DECREASED
--   This is the opposite of the intended business rule.
--
-- CORRECT BUSINESS RULE:
--   Giver   = member with positive balance who hands cash to another member
--   Receiver = member with negative balance who receives that cash
--
--   After settlement:
--     giver.balance    decreases (they gave away credit)
--     receiver.balance increases (their debt is reduced)
--
-- FIX (new formula):
--   balance = (paid + settlements_RECEIVED + cover_bills_received)
--           - (owed + settlements_MADE     + cover_bills_given)
--
-- NOTE: No data migration needed — the settlements table columns (paid_by,
-- paid_to) remain unchanged. Only the VIEW formula changes.
-- =============================================================================

create or replace view member_balances as
select
  m.id                                                                          as member_id,
  m.name                                                                        as member_name,
  m.email,
  m.group_id,
  coalesce(sum(e.amount)        filter (where e.paid_by            = m.id), 0)  as total_paid,
  coalesce(sum(ep.share_amount), 0)                                             as total_owed,
  coalesce(sum(s_out.amount)    filter (where s_out.paid_by        = m.id), 0)  as total_settlements_made,
  coalesce(sum(s_in.amount)     filter (where s_in.paid_to         = m.id), 0)  as total_settlements_received,
  coalesce(sum(cb_out.amount)   filter (where cb_out.helper_id     = m.id), 0)  as total_cover_bills_given,
  coalesce(sum(cb_in.amount)    filter (where cb_in.beneficiary_id = m.id), 0)  as total_cover_bills_received,
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

-- =============================================================================
-- VERIFICATION
-- Run the queries below after applying to confirm results look correct.
--
-- SELECT member_name, total_settlements_made, total_settlements_received, balance
-- FROM member_balances
-- ORDER BY balance DESC;
-- =============================================================================
