@echo off
rem AppSeal scheduled pipeline: full cycle + auto-deploy, logs to pipeline.log
cd /d D:\BIR\appmot\appmot
echo --- run %DATE% %TIME% --- >> scripts\pipeline.log
"C:\Python314\python.exe" -I scripts\appseal_pipeline.py >> scripts\pipeline.log 2>&1
