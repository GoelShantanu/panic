$env:DATABASE_URL = "postgres://postgres:stockpanic_dev_only@127.0.0.1:5432/stockpanic"
Start-Process -FilePath "node" -ArgumentList "src/apps/worker/src/cli/pipeline.ts" -WorkingDirectory "C:\backup_15th June 2026\StockPanic" -RedirectStandardOutput "C:\backup_15th June 2026\StockPanic\pipeline-out.log" -RedirectStandardError "C:\backup_15th June 2026\StockPanic\pipeline-err.log"
