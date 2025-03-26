This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
## IMPORTANT CLI IN ORDER TO RUN THE APP

Requirement:
1. Node.JS (at least version 20.18.0)
2. Docker

### Getting started: 

1. Install Node.Js version 20 LTS or above with NVM:

    a. [Node Version Manager](https://github.com/nvm-sh/nvm?tab=readme-ov-file#installing-and-updating)

2. Install bun:

    ```bash
    $ npm install -g bun
    ```

3. Install dependencies:

    ```bash
    $ cd /ormi-core
    $ bun install
    ```
4. Continue Development steps below

### For Development:

1st Terminal to run the servers (Postgres etc.):

    ```bash
    $ sudo docker compose up
    ```

2nd Terminal to set up, migrate and to view the database with Prisma: 

    ```bash
    $ bun db-migrate-dev
    $ bun db-studio
    ```

3rd Terminal to run the App:

    ```bash
    $ bun dev
    ```

### For Production:

1st Terminal to run the servers (Postgres etc.):

    ```bash
    $ sudo docker compose up
    ```

2nd Terminal to generate database schema for production:

    ```bash
    $ bun db-migrate-deploy
    ```

3rd Terminal to install dependencies build and run the app for production:

    ```bash
    $ bun start
    ```	

The above services would be containerized in a docker to simplify the production process (in progress): 

    ```bash
    $ bun start:docker
    ```	