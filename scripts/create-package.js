#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

function validatePackageName(name) {
    // Check if name is valid npm package name
    const validName = /^[a-z0-9-]+$/;
    return validName.test(name) && !name.startsWith('-') && !name.endsWith('-');
}

async function createPackage() {
    console.log('🚀 Creating a new package in your monorepo...\n');

    // Get package name from user
    let packageName;
    while (true) {
        packageName = await question('Enter package name (e.g., auth, database, utils): ');

        if (!packageName.trim()) {
            console.log('❌ Package name cannot be empty. Please try again.\n');
            continue;
        }

        if (!validatePackageName(packageName)) {
            console.log('❌ Invalid package name. Use lowercase letters, numbers, and hyphens only.\n');
            continue;
        }

        const packageDir = join(rootDir, 'packages', packageName);
        if (existsSync(packageDir)) {
            console.log(`❌ Package "${packageName}" already exists. Please choose a different name.\n`);
            continue;
        }

        break;
    }

    // Get package type
    console.log('\nSelect package type:');
    console.log('1. Library (default) - TypeScript library package');
    console.log('2. React components - React component library');
    console.log('3. Node.js utilities - Node.js utility functions');

    const typeChoice = await question('Choose type (1-3, default: 1): ') || '1';

    rl.close();

    // Create package directory
    const packageDir = join(rootDir, 'packages', packageName);
    mkdirSync(packageDir, { recursive: true });
    mkdirSync(join(packageDir, 'src'), { recursive: true });

    console.log(`\n📁 Created directory: packages/${packageName}`);

    // Create package.json
    const packageJson = createPackageJson(packageName, typeChoice);
    writeFileSync(
        join(packageDir, 'package.json'),
        JSON.stringify(packageJson, null, 2) + '\n'
    );
    console.log('📄 Created package.json');

    // Create tsconfig.json
    const tsConfig = createTsConfig(typeChoice);
    writeFileSync(
        join(packageDir, 'tsconfig.json'),
        JSON.stringify(tsConfig, null, 2) + '\n'
    );
    console.log('📄 Created tsconfig.json');

    // Create source files
    createSourceFiles(packageDir, packageName, typeChoice);
    console.log('📄 Created source files');

    // Create README
    const readme = createReadme(packageName, typeChoice);
    writeFileSync(join(packageDir, 'README.md'), readme);
    console.log('📄 Created README.md');

    // Create ESLint config if needed
    if (typeChoice === '2') {
        const eslintConfig = createEslintConfig();
        writeFileSync(join(packageDir, 'eslint.config.js'), eslintConfig);
        console.log('📄 Created eslint.config.js');
    }

    console.log(`\n✅ Package "${packageName}" created successfully!`);
    console.log('\nNext steps:');
    console.log('1. Run `bun install` to install dependencies');
    console.log(`2. Start developing in packages/${packageName}/src/`);
    console.log(`3. Use the package in your apps: import { ... } from "@workspace/${packageName}"`);
}

function createPackageJson(packageName, typeChoice) {
    const base = {
        name: `@workspace/${packageName}`,
        version: "0.0.0",
        private: true,
        main: "./dist/index.js",
        types: "./dist/index.d.ts",
        exports: {
            ".": {
                types: "./dist/index.d.ts",
                import: "./dist/index.js"
            }
        },
        scripts: {
            build: "tsc",
            dev: "tsc --watch",
            lint: "eslint .",
            typecheck: "tsc --noEmit"
        },
        devDependencies: {
            "@workspace/eslint-config": "workspace:*",
            "@workspace/typescript-config": "workspace:*",
            "typescript": "^5.7.3"
        }
    };

    // Add dependencies based on package type
    if (typeChoice === '2') {
        base.devDependencies["@types/react"] = "^18.0.0";
        base.devDependencies["@types/react-dom"] = "^18.0.0";
        base.peerDependencies = {
            "react": "^18.0.0",
            "react-dom": "^18.0.0"
        };
    }

    return base;
}

function createTsConfig(typeChoice) {
    const base = {
        extends: "@workspace/typescript-config/base.json",
        compilerOptions: {
            outDir: "./dist",
            rootDir: "./src"
        },
        include: ["src/**/*"],
        exclude: ["dist", "node_modules"]
    };

    if (typeChoice === '2') {
        base.extends = "@workspace/typescript-config/react-library.json";
    }

    return base;
}

function createSourceFiles(packageDir, packageName, typeChoice) {
    const srcDir = join(packageDir, 'src');

    if (typeChoice === '2') {
        // React components package
        const indexContent = `export * from './components';\n`;
        writeFileSync(join(srcDir, 'index.ts'), indexContent);

        mkdirSync(join(srcDir, 'components'), { recursive: true });
        const componentContent = `import React from 'react';

export interface ${capitalize(packageName)}Props {
  children?: React.ReactNode;
  className?: string;
}

export function ${capitalize(packageName)}({ children, className }: ${capitalize(packageName)}Props) {
  return (
    <div className={className}>
      {children || \`Hello from ${packageName} package!\`}
    </div>
  );
}
`;
        writeFileSync(join(srcDir, 'components', `${packageName}.tsx`), componentContent);

        const componentsIndexContent = `export * from './${packageName}';\n`;
        writeFileSync(join(srcDir, 'components', 'index.ts'), componentsIndexContent);

    } else {
        // Library or Node.js utilities
        const indexContent = `export * from './${packageName}';\n`;
        writeFileSync(join(srcDir, 'index.ts'), indexContent);

        const mainContent = typeChoice === '3'
            ? `/**
 * ${capitalize(packageName)} utilities
 */

export function ${camelCase(packageName)}Util(input: string): string {
  return \`Hello from ${packageName}: \${input}\`;
}

export class ${capitalize(packageName)} {
  private value: string;

  constructor(value: string) {
    this.value = value;
  }

  getValue(): string {
    return this.value;
  }

  setValue(value: string): void {
    this.value = value;
  }
}
`
            : `/**
 * ${capitalize(packageName)} library
 */

export interface ${capitalize(packageName)}Config {
  name: string;
  version?: string;
}

export function create${capitalize(packageName)}(config: ${capitalize(packageName)}Config) {
  return {
    ...config,
    version: config.version || '1.0.0',
    created: new Date().toISOString()
  };
}

export function ${camelCase(packageName)}Helper(input: string): string {
  return \`Processed by ${packageName}: \${input}\`;
}
`;

        writeFileSync(join(srcDir, `${packageName}.ts`), mainContent);
    }
}

function createReadme(packageName, typeChoice) {
    const packageType = typeChoice === '2' ? 'React Components' : typeChoice === '3' ? 'Node.js Utilities' : 'Library';

    return `# @workspace/${packageName}

${packageType} package for the monorepo.

## Installation

This package is part of the workspace and will be automatically available when you run \`bun install\` from the root.

## Usage

\`\`\`typescript
import { ${typeChoice === '2' ? capitalize(packageName) : camelCase(packageName) + 'Helper'} } from "@workspace/${packageName}";

${typeChoice === '2'
            ? `// Use the component
<${capitalize(packageName)}>
  Content goes here
</${capitalize(packageName)}>`
            : `// Use the function
const result = ${camelCase(packageName)}Helper("test");
console.log(result);`}
\`\`\`

## Development

\`\`\`bash
# Build the package
bun run build

# Watch for changes
bun run dev

# Type check
bun run typecheck

# Lint
bun run lint
\`\`\`
`;
}

function createEslintConfig() {
    return `import baseConfig from '@workspace/eslint-config/react-internal';

export default [
  ...baseConfig,
  {
    // Package-specific ESLint rules
  }
];
`;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function camelCase(str) {
    return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

// Run the script
createPackage().catch(console.error);
