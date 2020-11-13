FROM node:14-slim@sha256:45e5f0f657043491ce1b32557ab118ea00380f87499b91b86860850fb31b08ab

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      unzip \
    ; \
    rm -rf /var/lib/apt/lists/*

RUN mkdir /app
WORKDIR /app

COPY package*.json /app/
RUN npm ci

COPY tsconfig.json deploy.ts /app/

CMD ["npx", "ts-node", "deploy.ts"]
