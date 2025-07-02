# @workspace/utils

Library package for the monorepo.

## Installation

This package is part of the workspace and will be automatically available when you run `bun install` from the root.

## Usage

```typescript
import { utilsHelper } from "@workspace/utils";

// Use the function
const result = utilsHelper("test");
console.log(result);
```

## Development

```bash
# Build the package
bun run build

# Watch for changes
bun run dev

# Type check
bun run typecheck

# Lint
bun run lint
```
