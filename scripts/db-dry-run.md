# Ensaio de migration no Supabase (sem alterar nada)

Nunca aplique uma migration sem ensaiar antes. O ensaio roda tudo dentro de
uma transação desfeita no final:

```sql
begin;
-- conteúdo da migration (supabase/migrations/<arquivo>.sql)
-- conteúdo dos testes  (supabase/tests/<arquivo>.test.sql) — termina em select 'ALL PASSED'
rollback;
```

Envie pelo MCP (`execute_sql`, projeto `tgtsfodmdoclscklhglz`). Depois confira
que nada ficou (ex.: `select to_regclass('public.<tabela_nova>')` → null).

Só então aplique com `apply_migration`. O Supabase registra a versão com o
horário da aplicação: rode `list_migrations` e renomeie o arquivo local para
`<versão>_<nome>.sql`.
