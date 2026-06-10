# ORMI - Open Robotic Management Interface

A modern, modular web platform for monitoring and controlling heterogeneous robotics and autonomous systems in real-time. ORMI offers a unified interface for managing multiple robotic platforms, leveraging a scalable architecture constructed with modern web technologies.

## Overview

The Robotics and Autonomous Systems Laboratory develops ORMI at the Royal Military Academy of Belgium. The platform addresses the need for flexible, responsive human-machine interfaces that can adapt to diverse robotic systems while maintaining high performance and reliability.

The architecture supports multiple data sources, including ROS2 systems through ROSBridge Suite and Foxglove WebSocket protocol, direct drone control via Tello drones, and custom data providers. Widgets and dashboards are fully customizable through a plugin-based system.

## Screenshots

Lidars and maps
<img width="2557" height="2007" alt="Screenshot from 2026-02-12 10-45-49" src="https://github.com/user-attachments/assets/e4f28a3a-e6ad-41de-88d6-1a948e4a9002" />
Map with path and video feedback
<img width="2557" height="2007" alt="Screenshot from 2026-02-12 10-36-53" src="https://github.com/user-attachments/assets/74aab6f6-54d7-40f0-8df4-59b21e196aa0" />
Different workspaces
<img width="2542" height="1253" alt="Screenshot from 2026-02-12 10-34-05" src="https://github.com/user-attachments/assets/e2696fe5-744d-429d-a3f4-0dc463045d5e" />
New workspaces and layouts
<img width="2557" height="2007" alt="Screenshot from 2026-02-12 10-34-57" src="https://github.com/user-attachments/assets/5ff083b2-0b7c-4210-8c1e-4ae442c63d0a" />
Widgets
<img width="2557" height="2007" alt="Screenshot from 2026-02-12 10-40-15" src="https://github.com/user-attachments/assets/e49a6faf-4eb8-4625-a598-b9362d3aba4e" />

## Key Features

- **Multi-Platform Support**: Integrate with ROS2, Tello drones, REST APIs, and other robotics platforms
- **Real-Time Communication**: WebSocket and WebRTC for low-latency data streaming
- **Modular Plugin System**: Extend functionality with custom datasources and widgets
- **Responsive Design**: Works across desktop and mobile devices with theme customization
- **3D Visualization**: Native Three.js integration for spatial data representation
- **Dashboard Customization**: Drag-and-drop interface to create tailored monitoring layouts
- **Workspace Management**: A single Edit dialog (from each workspace's actions menu) to rename, recategorize, and migrate a workspace's layout type; switching type keeps widgets and datasources while resetting the arrangement to the new engine's default
- **Database Integration**: Prisma ORM with PostgreSQL for persistent data storage

## Project Structure

The project is organized as a monorepo using Turbo and Bun workspaces:

```
apps/web                  - Next.js web application
packages/
  ormi-core              - Core library for widgets, datasources, and transformations
  ormi-jsonforms         - JSON Forms integration
  ormi-plugins           - Plugin system framework
  ui                     - Shared UI component library
  utils                  - Utility functions and CLI tools
  eslint-config          - Shared ESLint configuration
  typescript-config      - Shared TypeScript configuration
plugins/                 - Feature plugins
  ormi-rosbridge-suite   - ROS2 ROSBridge integration
  ormi-foxglove          - Foxglove WebSocket protocol support
  ormi-tello             - Tello drone control
  ormi-std-widgets       - Standard widget collection
  ormi-flight-indicator  - Flight dynamics visualization
  ormi-randoms-datasources - Test data generation
  ormi-rest-bags         - REST API data sources
  ormi-emi-bag-analyzer  - EMI bag analysis
  teodor-emi-extension   - Military-specific extensions
postgres/                - Database initialization
```

## Technology Stack

- **Frontend**: Next.js, React, TypeScript, TailwindCSS
- **Backend**: Node.js, Prisma ORM, PostgreSQL
- **Build Tools**: Turbo, Bun package manager
- **UI Components**: Radix UI, Shadcn/ui
- **3D Graphics**: Three.js
- **Real-Time Communication**: WebSocket, WebRTC
- **Robotics Integration**: ROS libraries, Foxglove protocol

## Getting Started

### Prerequisites

- **To deploy:** Docker and Docker Compose.
- **To develop locally:** [Bun](https://bun.sh) `1.2.17`+, Node.js `>= 20`, Git, and a
  reachable PostgreSQL instance (or just use the `postgres` service from
  `docker-compose.yml`).

### Cloning (note: the docs are a submodule)

The in-app documentation under `apps/web/content/docs` is a **git submodule** (the
project wiki). Clone with `--recursive`, or initialize it after cloning — otherwise
the `/docs` route renders nothing and a source build ships an empty docs site:

```bash
git clone --recursive <repository-url>
cd ORMI
# already cloned without --recursive?
git submodule update --init
```

### Deployment with Docker

`docker-compose.yml` runs a **published release image** plus PostgreSQL and an
auto-updater:

```bash
docker compose up -d      # start
docker compose down       # stop
```

What this actually does (so there are no surprises in production):

- **`core`** pulls the prebuilt image
  `ghcr.io/rma-robotics-autonomous-systems/ormi:latest` — it does **not** build from
  your clone (the `build:` block is commented out). It uses `network_mode: host`, so
  the app is at `http://localhost:3000` and PostgreSQL at `localhost:5432` **on the
  Docker host**. On startup the container runs `prisma migrate deploy` automatically,
  so the database schema is applied for you.
- **`watchtower`** polls every 30 s and **auto-updates** the running container
  whenever a new `:latest` image is published. Disable or remove this service if you
  do not want unattended updates.
- **`postgres`** (v17) persists data to `./postgres` and uses
  `POSTGRES_HOST_AUTH_METHOD: trust` — acceptable behind host-only networking, but do
  not expose port 5432 publicly with this setting.

> **Important:** the default `NEXTAUTH_SECRET` is `change-me-in-production`. Set a
> strong value in `docker-compose.yml` before any real deployment.

#### Build the image from source instead

To run your local checkout rather than the published image, uncomment the `build:`
block (and remove/override the `image:` line) for the `core` service in
`docker-compose.yml` — it builds `Dockerfile.ormi_core` — then:

```bash
git submodule update --init    # COPY . . bakes in the host tree, including the docs submodule
docker compose up -d --build
```

(Consider disabling `watchtower` for a source build, since it watches the `:latest`
tag and would replace your locally built image.)

## Development Setup

ORMI is a **Turbo + Bun workspaces** monorepo (`apps/*`, `packages/*`, `plugins/*`).

```bash
bun install

# Build first: the web dev/build/typecheck scripts run the COMPILED utils CLI at
# packages/utils/dist/cli/index.js, so packages/utils must be built at least once.
bun run build

# Database — set DATABASE_URL (and NEXTAUTH_URL, NEXTAUTH_SECRET, APP_URL) in apps/web,
# then generate the Prisma client and apply migrations:
cd apps/web
bun run db-generate          # prisma generate
bun run db-migrate           # prisma migrate dev  (first-time local schema)
cd ../..

# Start the dev server (Next.js on http://localhost:3000)
bun run dev                  # = turbo dev --filter=web
```

Required environment variables (server-side, validated at runtime): `DATABASE_URL`,
`NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `APP_URL`. There is no committed `.env`; create one
in `apps/web`.

Validate changes before committing (these mirror the git hooks and CI):

```bash
bun run typecheck
bun run lint
bun run test
bun run format:check
```

## Creating Custom Plugins

The plugin system allows extension of datasources and widgets. A plugin provides:

- a datasource provider for connecting to external systems,
- widget definitions for UI components, and
- an `export.ts` + plugin class for registration.

Plugins under `plugins/` are discovered and loaded into the plugin manager at runtime.
See the **plugin guides in `/docs`** (`Creating-a-Plugin`, `Creating-a-Datasource`,
`Creating-a-Widget`) for the full walkthrough.

> **Note:** the `bun run create` scaffolding command is currently non-functional — it
> points at `scripts/create-package.js`, which is not present in the repo. Scaffold a
> plugin by copying an existing one under `plugins/` until the script is restored.

## Configuration

### Environment Variables

All required environment variables are pre-configured in `docker-compose.yml`. For production deployments, set a strong value for `NEXTAUTH_SECRET`.

### Theme and Site Configuration

Customize the application appearance in [apps/web/config/site.ts](apps/web/config/site.ts). This includes site name, description, branding, and contact information.

## Documentation

Comprehensive documentation is available in the application at `/docs` route and source files in [apps/web/content/docs](apps/web/content/docs).

API documentation for creating custom widgets and datasources is maintained in the docs section.

## Support and Contact

Robotics and Autonomous Systems Laboratory
Royal Military Academy of Belgium
Avenue De La Renaissance 30
1000 Brussels, Belgium

Website: https://mecatron.rma.ac.be

## License

This project is maintained by the Royal Military Academy of Belgium and is licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.

If you use this software in academic work, please cite it. See [CITATION.cff](CITATION.cff).

## Contributing

Contributions are welcome. Please ensure code follows project standards and passes all linting and type checks before submitting pull requests.
