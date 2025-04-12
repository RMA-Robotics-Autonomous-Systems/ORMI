#!/bin/sh
# filepath: /home/florian/Repos/ORMI-CORE/entrypoint.sh

# Exit immediately if a command exits with a non-zero status.
set -e

# WORKDIR is already /ORMI-CORE/ormi-app from Dockerfile

# Run database commands
echo "Running Prisma generate..."
bun run db-generate

echo "Running Prisma migrate..."
bun run db-migrate-deploy

# Echo the secret for final verification right before start
echo "NEXTAUTH_SECRET before start: ${NEXTAUTH_SECRET}"

# Execute the main process (replace the current shell process)
echo "Starting Next.js app..."
exec bun run start