FROM node:14-slim@sha256:fcc83ea57abeb5ff0cccda9e00b27995c5f7b266a6d125dd1c4e1e7aa769e500

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
