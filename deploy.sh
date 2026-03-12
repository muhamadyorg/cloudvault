#!/bin/bash
set -e

PROJECT_DIR="/www/cloudvault/cloudvault"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}==============================${NC}"
echo -e "${GREEN}  CloudVault Deploy Script    ${NC}"
echo -e "${GREEN}==============================${NC}"

cd "$PROJECT_DIR"

echo -e "\n${YELLOW}📥 So'nggi kodni yuklab olish...${NC}"
git checkout -- entrypoint.sh 2>/dev/null || true
git pull

echo -e "\n${YELLOW}🔨 Docker image yaratish...${NC}"
docker compose build --no-cache

echo -e "\n${YELLOW}🔄 Konteynerlarni qayta ishga tushirish...${NC}"
echo -e "${YELLOW}   (Ma'lumotlar saqlanadi - volumes o'chirilmaydi)${NC}"
docker compose down
docker compose up -d

echo -e "\n${YELLOW}⏳ App tayyor bo'lishini kutish (max 2 daqiqa)...${NC}"
MAX_WAIT=120
WAITED=0
APP_READY=false

while [ $WAITED -lt $MAX_WAIT ]; do
  STATUS=$(docker compose ps app --format json 2>/dev/null | python3 -c "import sys,json; data=sys.stdin.read().strip(); rows=data.split('\n'); print(json.loads(rows[-1]).get('Health','') if rows else '')" 2>/dev/null || echo "")
  
  if [ "$STATUS" = "healthy" ]; then
    APP_READY=true
    break
  fi
  
  if docker compose exec -T app wget -qO- http://localhost:5000/ > /dev/null 2>&1; then
    APP_READY=true
    break
  fi
  
  printf "  ...${WAITED}s - hali tayyor emas\r"
  sleep 5
  WAITED=$((WAITED + 5))
done

echo ""

if [ "$APP_READY" = true ]; then
  echo -e "${GREEN}✅ CloudVault muvaffaqiyatli deploy qilindi!${NC}"
  echo -e "${GREEN}🌐 Sayt: http://$(curl -s --max-time 3 ifconfig.me 2>/dev/null || echo 'SERVER_IP'):5055${NC}"
  echo -e "\n${YELLOW}📊 Konteyner holati:${NC}"
  docker compose ps
else
  echo -e "${RED}⚠️  App 2 daqiqada tayyor bo'lmadi. Loglarni tekshiring:${NC}"
  docker compose logs app --tail=30
  exit 1
fi
