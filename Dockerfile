FROM node:14-slim@sha256:b2c2aefbd6598f024ea14ce8af1ef6d41e3255a167f3068d1d88bc252a18a951

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
