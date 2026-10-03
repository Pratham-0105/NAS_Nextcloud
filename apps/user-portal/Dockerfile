FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy application source
COPY . .

# Build Next.js application
RUN npm run build

EXPOSE 3000

# Start Next.js using dynamic PORT assigned by host/Render
CMD ["sh", "-c", "npm run start"]
