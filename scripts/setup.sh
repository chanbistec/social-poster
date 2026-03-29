#!/usr/bin/env bash
set -e
mkdir -p data media
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Edit .env with SERVER_SECRET before running."
fi
echo "Setup complete. Run: npm install && npm run dev"
