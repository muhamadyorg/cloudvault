FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache bash

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

RUN cp node_modules/connect-pg-simple/table.sql dist/table.sql

RUN mkdir -p uploads/temp

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["/entrypoint.sh"]
