# Build stage - use full Node.js Alpine image for building
FROM node:22-alpine AS builder

# Install pnpm globally
RUN npm install -g pnpm@10.4.1

# Set working directory
WORKDIR /app

# Copy package manager files first for better layer caching
COPY package.json pnpm-lock.yaml ./

# Install all dependencies
RUN --mount=type=cache,target=/root/.local/share/pnpm \
    pnpm install --frozen-lockfile

# Copy source code and configuration files
COPY . .

# Build the TypeScript application
RUN pnpm run build

# Install only production dependencies in a clean directory
RUN mkdir -p /app/prod && \
    cp package.json pnpm-lock.yaml /app/prod/ && \
    cd /app/prod && \
    pnpm install --frozen-lockfile --prod

# Production stage - use Google's distroless Node.js image
FROM gcr.io/distroless/nodejs22-debian12:nonroot

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=nonroot:nonroot /app/dist ./dist

# Copy production node_modules and package.json
COPY --from=builder --chown=nonroot:nonroot /app/prod/node_modules ./node_modules
COPY --from=builder --chown=nonroot:nonroot /app/prod/package.json ./package.json

# Expose the port
EXPOSE 8080

# Start the application directly with node
# Note: distroless images don't have shell, so we use the full path
CMD ["dist/src/index.js"]
