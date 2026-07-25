#!/bin/bash
cd "$(dirname "$0")"
python3 -m pip install -r requirements.txt
python3 app.py &
sleep 2
open "http://127.0.0.1:8200"
wait
