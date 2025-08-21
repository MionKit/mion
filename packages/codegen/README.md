# @mionkit/codegen

Ahead-of-time code generation for mion run-types and router caches.

## Overview

The `@mionkit/codegen` package provides tools for generating optimized cache files ahead of time, improving runtime performance by pre-computing run-types validation and router dispatch logic.

## Features

- **Run-types Cache Generation**: Pre-compile type validation logic
- **Router Cache Generation**: Pre-compile route dispatch logic
- **Watch Mode**: Automatically regenerate caches when source files change
- **Configurable**: Flexible options for include/exclude patterns and output directories

## Installation

```bash
npm install @mionkit/codegen
```

## Usage

Documentation and examples will be added as the implementation progresses.

## Configuration

### CodegenOptions

- `outputDir`: Directory for generated cache files (default: `.mion-cache`)
- `generateRunTypes`: Whether to generate run-types cache (default: `true`)
- `generateRouter`: Whether to generate router cache (default: `true`)
- `include`: File patterns to include (default: `['**/*.ts', '**/*.js']`)
- `exclude`: File patterns to exclude (default: `['node_modules/**', '**/*.spec.ts']`)
- `watch`: Enable watch mode (default: `false`)

## Architecture

This package is designed to work with:

- `@mionkit/run-types` for type validation caching
- `@mionkit/router` for route dispatch caching
- `@mionkit/core` for shared utilities

## Development Status

🚧 **Work in Progress** - This package is currently under development. Core functionality is being implemented.

## License

MIT
