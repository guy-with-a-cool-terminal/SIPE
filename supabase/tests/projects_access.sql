-- Projects access rules, role by role. Run with run-projects-access.sh.
-- The expected output is in projects_access.expected.
\set ON_ERROR_STOP off
\set VERBOSITY terse
set search_path = public, extensions;
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a','a@x.com'),
 ('00000000-0000-0000-0000-00000000000b','b@x.com'),
 ('00000000-0000-0000-0000-00000000000c','c@x.com'),
 ('00000000-0000-0000-0000-00000000000d','d@x.com'),
 ('00000000-0000-0000-0000-00000000000e','e@x.com');
-- B already uses SIPE for money (so B should NOT get the focused view)
insert into transactions (user_id,type,amount,description) values ('00000000-0000-0000-0000-00000000000b','income',50,'B own income');

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;

\echo '--- 1. A creates a project; owner row auto-created'
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a'); set role authenticated;
insert into projects (id, owner_id, name, stage) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','Salonly','launched') returning name;
select role, status, mode from project_members where project_id='10000000-0000-0000-0000-000000000001';
\echo '--- 1b. A cannot insert a member row directly (invites go through the function)'
insert into project_members (project_id,email,role) values ('10000000-0000-0000-0000-000000000001','z@x.com','cofounder');
reset role;

\echo '--- 2. service role invites B (cofounder), C (contributor), D (viewer)'
insert into project_members (project_id,email,role,invite_token,invited_by) values
 ('10000000-0000-0000-0000-000000000001','b@x.com','cofounder','20000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a'),
 ('10000000-0000-0000-0000-000000000001','c@x.com','contributor','20000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000a'),
 ('10000000-0000-0000-0000-000000000001','d@x.com','viewer','20000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-00000000000a');

\echo '--- 3. anon reads invite D'
select pg_temp.as_user(''); set role anon;
select get_project_invite('20000000-0000-0000-0000-00000000000d');
reset role;

\echo '--- 4. E (wrong email) tries to accept C invite: must fail'
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e'); set role authenticated;
select accept_project_invite('20000000-0000-0000-0000-00000000000c');
\echo '--- 4b. E sees no projects, no members, no money'
select count(*) as e_projects from projects;
select count(*) as e_members from project_members;
select project_money('10000000-0000-0000-0000-000000000001');
reset role;

\echo '--- 5. B, C, D accept'
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated; select accept_project_invite('20000000-0000-0000-0000-00000000000b') is not null as b_ok; reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c'); set role authenticated; select accept_project_invite('20000000-0000-0000-0000-00000000000c') is not null as c_ok; reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d'); set role authenticated; select accept_project_invite('20000000-0000-0000-0000-00000000000d') is not null as d_ok; reset role;
\echo '--- 5b. focused view: B (has money) stays full, C and D get projects only'
select email, signup_source, enabled_modules from profiles where email in ('b@x.com','c@x.com','d@x.com') order by email;
\echo '--- 5c. reusing an accepted token fails'
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e'); set role authenticated; select accept_project_invite('20000000-0000-0000-0000-00000000000b'); reset role;

\echo '--- 6. C (contributor) tries to make itself owner / change share / edit project'
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c'); set role authenticated;
update project_members set role='owner' where user_id='00000000-0000-0000-0000-00000000000c';
update project_members set share_pct=90 where user_id='00000000-0000-0000-0000-00000000000c';
update projects set name='hacked' where id='10000000-0000-0000-0000-000000000001';
select name from projects;
\echo '--- 6b. C changes another member''s mode: blocked'
update project_members set mode='parked' where user_id='00000000-0000-0000-0000-00000000000a';
\echo '--- 6c. C checks in (allowed) and sets own mode to focus (allowed)'
insert into project_checkins (project_id,user_id,week_start,hours) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','2026-11-16',9);
select set_project_mode('10000000-0000-0000-0000-000000000001','focus');
\echo '--- 6d. C cannot create a push key'
select create_project_key('10000000-0000-0000-0000-000000000001');
reset role;

\echo '--- 7. D (viewer) cannot check in, add numbers, or tag money'
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d'); set role authenticated;
insert into project_checkins (project_id,user_id,week_start) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000d','2026-11-16');
insert into project_metrics (project_id,metric,on_date,value) values ('10000000-0000-0000-0000-000000000001','signups','2026-11-18',3);
insert into transactions (user_id,type,amount,project_id) values ('00000000-0000-0000-0000-00000000000d','income',10,'10000000-0000-0000-0000-000000000001');
select count(*) as d_can_read_checkins from project_checkins;
reset role;

\echo '--- 8. A records project money; E cannot tag to it'
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a'); set role authenticated;
insert into transactions (user_id,type,amount,description,project_id) values ('00000000-0000-0000-0000-00000000000a','income',1000,'Salonly sub','10000000-0000-0000-0000-000000000001');
insert into transactions (user_id,type,bucket,amount,description,project_id) values ('00000000-0000-0000-0000-00000000000a','expense','E',200,'Hosting','10000000-0000-0000-0000-000000000001');
insert into transactions (user_id,type,amount,description) values ('00000000-0000-0000-0000-00000000000a','income',99999,'A private income');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e'); set role authenticated;
insert into transactions (user_id,type,amount,project_id) values ('00000000-0000-0000-0000-00000000000e','income',10,'10000000-0000-0000-0000-000000000001');
reset role;

\echo '--- 9. B before sharing: shared=false; B cannot switch sharing on'
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select project_money('10000000-0000-0000-0000-000000000001')->'shared' as shared;
update projects set money_shared=true where id='10000000-0000-0000-0000-000000000001';
reset role;
\echo '--- 9b. A shares; B sees totals only (1000 / 200, not the 99999), and cannot read A transactions'
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a'); set role authenticated;
update projects set money_shared=true where id='10000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select project_money('10000000-0000-0000-0000-000000000001') - 'months' - 'hours' as money;
select count(*) as b_sees_txns_of_others from transactions where user_id <> '00000000-0000-0000-0000-00000000000b';
\echo '--- 9c. B (cofounder) cannot kill the project'
update projects set killed_at=now() where id='10000000-0000-0000-0000-000000000001';
reset role;

\echo '--- 10. Focus cap (A, cap 2) and no Background for ideas'
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a'); set role authenticated;
insert into projects (id, owner_id, name, stage) values ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000a','P2','building'),('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000000a','P3','idea');
select set_project_mode('10000000-0000-0000-0000-000000000001','focus');
select set_project_mode('10000000-0000-0000-0000-000000000002','focus');
select set_project_mode('10000000-0000-0000-0000-000000000003','focus');
select set_project_mode('10000000-0000-0000-0000-000000000003','background');
select name, m.mode from projects p join project_members m on m.project_id=p.id and m.user_id='00000000-0000-0000-0000-00000000000a' order by name;
\echo '--- 10b. A makes a push key'
select left(create_project_key('10000000-0000-0000-0000-000000000001'), 3) as key_prefix;
\echo '--- 10c. A cannot remove own owner row; can remove D'
delete from project_members where user_id='00000000-0000-0000-0000-00000000000a';
delete from project_members where user_id='00000000-0000-0000-0000-00000000000d';
select count(*) as members_left from project_members where project_id='10000000-0000-0000-0000-000000000001';
reset role;
\echo '--- 11. team view with names (as C)'
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c'); set role authenticated;
select email, role, status from project_team('10000000-0000-0000-0000-000000000001');
\echo '--- 11b. C leaves the project'
delete from project_members where user_id='00000000-0000-0000-0000-00000000000c';
select count(*) as c_projects_after_leaving from projects;
reset role;
