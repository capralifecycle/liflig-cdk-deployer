FROM node:14-slim@sha256:56f3e3f1d9e55b404d2805f2884d5169e8171d5552b1e01490a74e519060f42c

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
