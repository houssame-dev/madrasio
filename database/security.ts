/** Read-only deployment gate for the application ACL boundary (Task 047). */
export const applicationSecurityAuditSql = `
WITH api_roles AS (
  SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')
), app_tables AS (
  SELECT c.* FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r'
), owner_role AS (SELECT oid FROM pg_roles WHERE rolname='postgres'),
defaults AS (
  SELECT x.* FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) x
  WHERE d.defaclrole=(SELECT oid FROM owner_role)
    AND d.defaclnamespace IN (0, 'public'::regnamespace)
    AND d.defaclobjtype IN ('r','S')
), app_functions AS (
  SELECT p.* FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
    AND p.proowner=(SELECT oid FROM owner_role)
    AND NOT (p.proname='rls_auto_enable' AND p.pronargs=0 AND p.prorettype='event_trigger'::regtype)
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
)
SELECT 'table_inventory' AS violation WHERE (SELECT count(*) FROM app_tables) <> 39
UNION ALL SELECT 'platform_roles' WHERE (SELECT count(*) FROM api_roles) <> 3
UNION ALL SELECT 'table_owner_or_rls' WHERE EXISTS (
  SELECT 1 FROM app_tables WHERE NOT relrowsecurity OR relowner<>(SELECT oid FROM owner_role))
UNION ALL SELECT 'application_policies' WHERE EXISTS (
  SELECT 1 FROM pg_policy WHERE polrelid IN (SELECT oid FROM app_tables))
UNION ALL SELECT 'table_grants' WHERE EXISTS (
  SELECT 1 FROM app_tables t CROSS JOIN LATERAL aclexplode(coalesce(t.relacl, acldefault('r',t.relowner))) x
  WHERE x.grantee=0 OR x.grantee IN (SELECT oid FROM api_roles))
UNION ALL SELECT 'effective_table_grants' WHERE EXISTS (
  SELECT 1 FROM app_tables t CROSS JOIN api_roles r
  WHERE has_table_privilege(r.oid,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
UNION ALL SELECT 'sequence_grants' WHERE EXISTS (
  SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('S',c.relowner))) x
  WHERE c.relnamespace='public'::regnamespace AND c.relkind='S'
    AND (x.grantee=0 OR x.grantee IN (SELECT oid FROM api_roles))
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e'))
UNION ALL SELECT 'function_grants' WHERE EXISTS (
  SELECT 1 FROM app_functions p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
  WHERE x.grantee=0 OR x.grantee IN (SELECT oid FROM api_roles))
UNION ALL SELECT 'effective_function_grants' WHERE EXISTS (
  SELECT 1 FROM app_functions p CROSS JOIN api_roles r WHERE has_function_privilege(r.oid,p.oid,'EXECUTE'))
UNION ALL SELECT 'default_grants' WHERE EXISTS (
  SELECT 1 FROM defaults WHERE grantee=0 OR grantee IN (SELECT oid FROM api_roles))
`;

export function assertApplicationSecurity(rows: Array<{ violation: string }>): void {
  if (rows.length) throw new Error('Application database security invariants failed.');
}
