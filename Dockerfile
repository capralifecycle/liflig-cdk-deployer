FROM node:14-slim@sha256:1c5d05dcbc44ed631a668b72dcc05d4213dc5e842f8c1ba2334af73b249d1b0e

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
