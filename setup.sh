#!/bin/bash
set -e

# Update system packages
sudo apt-get update

# Install Node.js 24.x (required by package.json engines field)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify Node.js version
node --version
npm --version

# Update npm to latest version to avoid potential issues
sudo npm install -g npm@latest

# Install lerna globally first
sudo npm install -g lerna@9.0.7

# Clear npm cache to avoid potential issues
npm cache clean --force

# Remove package-lock.json to fix the missing target issue
rm -f package-lock.json

# Install dependencies using npm (respecting workspaces and lerna configuration)
npm install

# Run type compiler installation (required for runtime type metadata)
npm run deepkit-install

# Disable coverage collection in Jest configs to avoid conflicts with type compiler
find packages -name "jest.config.js" -exec sed -i 's/collectCoverage: true/collectCoverage: false/g' {} \;

# Set NODE_ENV to test to ensure proper test environment
export NODE_ENV=test

# Add npm global bin to PATH in user profile
echo 'export PATH="$PATH:/usr/local/bin"' >> $HOME/.profile
echo 'export NODE_ENV=test' >> $HOME/.profile

# Source the profile to make PATH changes available immediately
source $HOME/.profile