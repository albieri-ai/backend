# Use Node.js 18 LTS as base image
FROM node:22-alpine AS base

# Install pnpm globally
RUN npm install -g pnpm@10.4.1

# Set working directory
WORKDIR /app

# Copy package manager files first for better layer caching
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code and configuration files
COPY . .

# Build the TypeScript application
# The updated tsconfig.json now includes both src/ and auth.ts
RUN pnpm run build

# Production stage
FROM node:22-alpine AS production

# Install pnpm globally
RUN npm install -g pnpm@10.4.1

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built application from base stage
COPY --from=base /app/dist ./dist

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose the port (matching the default in your app)
EXPOSE 8080

# Health check (optional, adjust endpoint as needed)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["pnpm", "start"]
