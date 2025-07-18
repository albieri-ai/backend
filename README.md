# Fastify Backend with Drizzle ORM

This backend uses Fastify as the web framework and Drizzle ORM for database access.

## Setup

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL database
- pnpm package manager

### Installation

```bash
# Install dependencies
pnpm install
```

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
PORT=3000
DATABASE_URL=postgres://user:password@localhost:5432/database_name
```

## Database Management

This project uses Drizzle ORM with PostgreSQL. The database schema is defined in `src/database/schema/index.ts`.

### Available Scripts

- `pnpm db:generate` - Generate SQL migrations based on schema changes
- `pnpm db:push` - Apply schema changes directly to the database (development only)
- `pnpm db:migrate` - Run migrations
- `pnpm db:studio` - Launch Drizzle Studio to visualize and edit data

### Database Plugin

The Fastify plugin that injects the Drizzle database into the Fastify instance is located at `src/plugins/database.ts`. 

Here's how it works:

1. The plugin connects to PostgreSQL using the connection string from environment variables
2. It creates a Drizzle ORM instance with your schema
3. It runs any pending migrations (optional)
4. It decorates the Fastify instance with a `db` property that you can use in your routes
5. It gracefully closes the database connection when the server shuts down

### Using the Database in Routes

You can access the database in your route handlers through `fastify.db`:

```typescript
fastify.get('/users', async (request, reply) => {
  const allUsers = await fastify.db.query.users.findMany();
  return allUsers;
});

fastify.post('/users', async (request, reply) => {
  const { name, email } = request.body;
  const newUser = await fastify.db.insert(users).values({ name, email }).returning();
  return newUser;
});
```

## Development

```bash
# Start development server with hot-reload
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

## Project Structure

```
backend/
├── migrations/        # Database migrations
├── src/
│   ├── database/      # Database schema and utilities
│   │   └── schema/    # Drizzle schema definitions
│   ├── plugins/       # Fastify plugins
│   ├── routes/        # API routes
│   └── index.ts       # Application entry point
├── .env               # Environment variables (not committed to git)
├── drizzle.config.ts  # Drizzle configuration
├── package.json       # Project dependencies and scripts
└── tsconfig.json      # TypeScript configuration
```
