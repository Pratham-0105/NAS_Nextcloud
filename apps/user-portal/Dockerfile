FROM node:20-alpine
WORKDIR /app

ENV PORT=3000

# Install all build dependencies
COPY package*.json ./
RUN npm install --include=dev

# Copy application source
COPY . .

# Build Next.js application
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# Start Next.js using dynamic PORT assigned by host/Render
CMD ["sh", "-c", "npm run start"]
