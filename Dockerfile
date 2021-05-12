FROM node:14-slim@sha256:24f6102188449a6e30b7e779e9e9e6cb940c9b005938dc54ac6bbad5c5647ba7

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      unzip \
    ; \
    rm -rf /var/lib/apt/lists/*

RUN mkdir /app
WORKDIR /app

COPY package*.json /app/
RUN npm install --only=prod

COPY build/deploy.js /app/

CMD ["node", "--enable-source-maps", "deploy.js"]
