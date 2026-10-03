FROM node:20-alpine

# Install udev, util-linux, and mergerfs for hardware storage inspection
RUN apk add --no-cache \
    udev \
    util-linux \
    e2fsprogs \
    curl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

RUN npx prisma generate
RUN npm run build

EXPOSE 4000

CMD ["node", "dist/server.js"]
