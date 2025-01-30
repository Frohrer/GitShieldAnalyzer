FROM node:20-slim

# Install git and unzip
RUN apt-get update && apt-get install -y git unzip && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Ensure proper permissions for init.sql
RUN chmod 644 init.sql

# Build the application
RUN npm run build

EXPOSE 5000

CMD ["npm", "run", "start"]