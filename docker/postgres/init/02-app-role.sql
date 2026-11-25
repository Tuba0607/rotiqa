-- Local development only. Runtime role used by the app: no superuser, no BYPASSRLS,
-- not a table owner, so Row Level Security always applies to it.
-- Table/function privileges are granted by the migrations.
CREATE ROLE rotiqa_app LOGIN PASSWORD 'rotiqa_app_dev' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT CONNECT ON DATABASE rotiqa, rotiqa_demo, rotiqa_test TO rotiqa_app;
