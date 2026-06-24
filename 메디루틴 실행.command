#!/bin/zsh
cd "$(dirname "$0")"
echo "메디루틴을 실행합니다."
echo "브라우저가 열리지 않으면 아래 주소를 직접 열어주세요."
echo "http://localhost:4173"
open "http://localhost:4173"
python3 -m http.server 4173
