#!/bin/bash
pkill -f "node bot.js" 2>/dev/null
sleep 1
termux-wake-lock
cd ~/hermez-bot && nohup node bot.js > bot.log 2>&1 &
disown
echo "Hermez bot started."
