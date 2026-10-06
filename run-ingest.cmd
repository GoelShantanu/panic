@echo off
set DATABASE_URL=postgres://postgres:stockpanic_dev_only@127.0.0.1:5432/stockpanic
node src/apps/worker/src/cli/ingest.ts
