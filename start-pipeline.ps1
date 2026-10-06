$db = "postgres://postgres:stockpanic_dev_only@127.0.0.1:5432/stockpanic"
Start-Process -FilePath "cmd.exe" -ArgumentList "/c set DATABASE_URL=$db && node src/apps/worker/src/cli/pipeline.ts > pipeline-out.log 2> pipeline-err.log" -WorkingDirectory "C:\backup_15th June 2026\StockPanic" -WindowStyle Hidden
