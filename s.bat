@echo off
chcp 65001>nul
echo GitHub Sync Tool
echo git pull

git pull

echo git add

git add .

echo git commit

git commit -m "%date:~-10% %time% by Lemon Yellow"

echo git push

git push

echo git status

git status

pause
