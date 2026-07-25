# --- Build Stage ---
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies (including devDependencies)
RUN npm ci

# Copy source code and config files
COPY . .

# Build NestJS production bundle
RUN npm run build

# Remove development dependencies to keep the image slim
RUN npm prune --production

# --- Production Stage ---
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Copy built app and dependencies from builder
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist

# Use non-root node user for security
USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
