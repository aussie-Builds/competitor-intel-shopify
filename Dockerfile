# Use Node with Puppeteer dependencies pre-installed
FROM ghcr.io/puppeteer/puppeteer:latest

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (skip Puppeteer's bundled Chrome - we use the container's)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

RUN npm ci --only=production

# Copy application code
COPY . .

# Create snapshots directory
RUN mkdir -p /app/snapshots

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Start the application
CMD ["npm", "start"]
