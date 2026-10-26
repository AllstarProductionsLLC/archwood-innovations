-- Run once in the Supabase SQL editor. Access is server-only, never via an anon key.
begin;
create table if not exists public.security_scans (
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
 website_url text not null, client_key text not null, bearer_hash text,
 mode text not null check (mode in ('quick','expanded')), parent_id uuid references public.security_scans(id) on delete set null,
 status text not null default 'started' check (status in ('started','completed','failed','cancelled')),
 summary jsonb, report jsonb, error_code text
);
create index if not exists security_scans_client_time on public.security_scans(client_key,created_at);
create index if not exists security_scans_time on public.security_scans(created_at);
create table if not exists public.security_leads (
 id uuid primary key default gen_random_uuid(), email text not null unique, created_at timestamptz not null default now()
);
create table if not exists public.security_report_access (
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days', token_hash text not null unique,
 scan_id uuid not null references public.security_scans(id) on delete cascade,
 lead_id uuid not null references public.security_leads(id) on delete cascade,
 client_key text not null, wants_help boolean not null default false, verified_at timestamptz,
 email_status text not null default 'pending', provider_id text,
 notification_status text not null default 'pending', notification_updated timestamptz,
 expansion_status text not null default 'none', expansion_attempts int not null default 0,
 expansion_updated timestamptz, expanded_scan_id uuid references public.security_scans(id) on delete set null
);
create index if not exists security_access_lead_time on public.security_report_access(lead_id,created_at);
alter table public.security_scans enable row level security;
alter table public.security_leads enable row level security;
alter table public.security_report_access enable row level security;
revoke all on public.security_scans,public.security_leads,public.security_report_access from anon,authenticated;
grant all on public.security_scans,public.security_leads,public.security_report_access to service_role;

create or replace function public.security_start_scan(p_url text,p_client text,p_bearer text,p_mode text,p_parent uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result public.security_scans;
begin
 perform pg_advisory_xact_lock(4101,hashtext(p_client));
 perform pg_advisory_xact_lock(4102,hashtext(p_url));
 if (select count(*) from security_scans where client_key=p_client and created_at>now()-interval '10 minutes')>=5
 or (select count(*) from security_scans where website_url=p_url and created_at>now()-interval '1 hour')>=20 then
  raise exception 'RATE_LIMIT' using errcode='P0001';
 end if;
 insert into security_scans(website_url,client_key,bearer_hash,mode,parent_id) values(p_url,p_client,p_bearer,p_mode,p_parent) returning * into result;
 return to_jsonb(result);
end $$;

create or replace function public.security_request_report(p_scan uuid,p_bearer text,p_email text,p_token text,p_client text,p_help boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare lead public.security_leads; result public.security_report_access;
begin
 perform pg_advisory_xact_lock(4103,hashtext(p_email));
 perform pg_advisory_xact_lock(4104,hashtext(p_client));
 if not exists(select 1 from security_scans where id=p_scan and bearer_hash=p_bearer and status='completed' and report is not null and created_at>now()-interval '24 hours') then raise exception 'REPORT_EXPIRED'; end if;
 insert into security_leads(email) values(p_email) on conflict(email) do nothing;
 select * into lead from security_leads where email=p_email;
 if (select count(*) from security_report_access where lead_id=lead.id and created_at>now()-interval '30 minutes')>=3
 or (select count(*) from security_report_access where client_key=p_client and created_at>now()-interval '1 hour')>=5 then raise exception 'RATE_LIMIT'; end if;
 insert into security_report_access(scan_id,lead_id,token_hash,client_key,wants_help) values(p_scan,lead.id,p_token,p_client,p_help) returning * into result;
 return to_jsonb(result);
end $$;

create or replace function public.security_verify_report(p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result public.security_report_access;
begin
 update security_report_access set verified_at=coalesce(verified_at,now()) where token_hash=p_token and expires_at>now() and email_status in ('accepted','unknown') returning * into result;
 if result.id is null then raise exception 'REPORT_EXPIRED'; end if;
 return to_jsonb(result);
end $$;

create or replace function public.security_claim_expansion(p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result public.security_report_access;
begin
 select * into result from security_report_access where token_hash=p_token and verified_at is not null and expires_at>now() for update;
 if result.id is null then raise exception 'REPORT_EXPIRED'; end if;
 if result.expansion_status='completed' then return to_jsonb(result); end if;
 if result.expansion_status='running' and result.expansion_updated>now()-interval '2 minutes' then raise exception 'ALREADY_RUNNING'; end if;
 if result.expansion_attempts>=2 then raise exception 'EXPANSION_LIMIT'; end if;
 update security_report_access set expansion_status='running',expansion_attempts=expansion_attempts+1,expansion_updated=now() where id=result.id returning * into result;
 return to_jsonb(result);
end $$;

create or replace function public.security_claim_notification(p_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 update security_report_access set notification_status='sending',notification_updated=now() where id=p_id and verified_at is not null and notification_status<>'accepted' and (notification_status<>'sending' or notification_updated<now()-interval '5 minutes');
 return found;
end $$;

create or replace function public.security_cleanup()
returns boolean language plpgsql security definer set search_path=public as $$
begin
 delete from security_report_access where expires_at<now()-interval '83 days';
 update security_scans set report=null,bearer_hash=null where created_at<now()-interval '14 days' and (report is not null or bearer_hash is not null);
 update security_scans set status='cancelled',error_code='INTERRUPTED' where status='started' and created_at<now()-interval '10 minutes';
 delete from security_scans where created_at<now()-interval '90 days';
 delete from security_leads where created_at<now()-interval '90 days' and not exists(select 1 from security_report_access where lead_id=security_leads.id);
 return true;
end $$;
-- Views provide an owner lead list and an all-submission log in Supabase's table editor/CSV export.
create or replace view public.security_lead_list with (security_invoker=true) as
 select a.id,a.created_at,l.email,s.website_url,a.wants_help,a.verified_at,a.email_status,a.notification_status,a.expansion_status,s.summary
 from security_report_access a join security_leads l on l.id=a.lead_id join security_scans s on s.id=a.scan_id;
create or replace view public.security_scan_log with (security_invoker=true) as
 select id,created_at,website_url,mode,status,error_code,summary from security_scans;
revoke all on public.security_lead_list,public.security_scan_log from anon,authenticated;
grant select on public.security_lead_list,public.security_scan_log to service_role;
revoke all on function public.security_start_scan(text,text,text,text,uuid),public.security_request_report(uuid,text,text,text,text,boolean),public.security_verify_report(text),public.security_claim_expansion(text),public.security_claim_notification(uuid),public.security_cleanup() from public,anon,authenticated;
grant execute on function public.security_start_scan(text,text,text,text,uuid),public.security_request_report(uuid,text,text,text,text,boolean),public.security_verify_report(text),public.security_claim_expansion(text),public.security_claim_notification(uuid),public.security_cleanup() to service_role;
commit;
