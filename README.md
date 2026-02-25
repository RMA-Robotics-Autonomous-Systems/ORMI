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

- Docker and Docker Compose
- Git

### Installation with Docker

The easiest way to get ORMI running is using Docker Compose, which handles all dependencies including the database.

1. Clone the repository and navigate to the project directory:

```bash
git clone <repository-url>
cd ORMI-CORE
```

2. Set up environment variables by creating a `.env` file in `apps/web`:

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=__YOUR__SUPER__MAGNIFICIENT__SECRET__
DATABASE_URL=postgresql://ormi_user:ormi_password@postgres:5432/ormi_db
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

3. Start the application with Docker Compose:

```bash
docker-compose up -d
```

The application will be available at `http://localhost:3000` and PostgreSQL will be running on `localhost:5432`.

5. Stop the application:

```bash
docker-compose down
```

### Local Development (Without Docker)

For development without Docker, you need Bun and PostgreSQL installed locally.

1. Install dependencies:

```bash
bun install
```

2. Set up environment variables in `apps/web/.env`:

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=__YOUR__SUPER__MAGNIFICIENT__SECRET__
DATABASE_URL=postgresql://USER_DB:USER_PSW@localhost:5432/ORMI_DATABASE_NAME
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

3. Initialize the database:

```bash
cd apps/web
bun run db-generate
bun run db-migrate
```

### Development

Start the development server with Turbo:

```bash
bun run dev
```

The application will be available at `http://localhost:3000`.

#### Linux file watch limits (Turbopack)

If you hit an error like "OS file watch limit reached", increase the inotify
limits:

```bash
sudo sysctl -w fs.inotify.max_user_watches=524288
sudo sysctl -w fs.inotify.max_user_instances=1024
```

To make it persistent:

```bash
sudo tee /etc/sysctl.d/99-inotify.conf > /dev/null <<'EOF'
fs.inotify.max_user_watches=524288
fs.inotify.max_user_instances=1024
EOF
sudo sysctl --system
```

Individual package development:

```bash
cd packages/ormi-core
bun run dev
```

### Building

Build all packages:

```bash
bun run build
```

Build specific package:

```bash
cd packages/ormi-core
bun run build
```

### Database Management

Generate Prisma client:

```bash
cd apps/web
bun run db-generate
```

Run migrations:

```bash
cd apps/web
bun run db-migrate
```

Open Prisma Studio for database inspection:

```bash
cd apps/web
bun run db-studio
```

Reset database:

```bash
cd apps/web
bun run db-reset
```

## Creating Custom Plugins

The plugin system allows extension of datasources and widgets. Create a new plugin using:

```bash
bun run create
```

A basic plugin structure includes:

- Datasource provider for connecting to external systems
- Widget definitions for UI components
- Export configuration for registration

Plugins are automatically discovered and loaded into the plugin manager at runtime.

## Code Quality

Lint code across all packages:

```bash
bun run lint
```

Format code with Prettier:

```bash
bun run format
```

## Configuration

### Environment Variables

Critical variables for `apps/web/.env.local`:

- `DATABASE_URL`: PostgreSQL connection string
- `NEXTAUTH_SECRET`: Authentication secret
- `NEXTAUTH_URL`: Application URL for OAuth callbacks
- `NEXT_PUBLIC_APP_URL`: Public application URL

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
