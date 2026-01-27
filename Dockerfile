FROM node:20-slim

WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy Shopify Remix app
COPY competitor-intel-shopify-app/package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy application code
COPY competitor-intel-shopify-app/ .

# Generate Prisma client and build the Remix app
RUN npx prisma generate && npm run build

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Start the Remix server
CMD ["npm", "run", "docker-start"]
