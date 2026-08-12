import { config } from "dotenv";

const injectedMigrationDatabaseUrl =
  process.env.DATABASE_MIGRATION_URL?.trim();

config({ path: ".env.local", quiet: true });
config({ quiet: true });

if (injectedMigrationDatabaseUrl) {
  process.env.DATABASE_URL = injectedMigrationDatabaseUrl;
}

async function main() {
  const [{ closeDatabase, getDatabase }, schema, seedData] = await Promise.all([
    import("../src/db"),
    import("../src/db/schema"),
    import("../src/db/seed-data"),
  ]);
  const db = getDatabase();

  try {
    for (const region of seedData.regionSeed) {
      await db
        .insert(schema.regions)
        .values({ ...region, isActive: true })
        .onConflictDoUpdate({
          target: schema.regions.slug,
          set: {
            parentId: region.parentId,
            type: region.type,
            name: region.name,
            displayOrder: region.displayOrder,
            isActive: true,
            updatedAt: new Date(),
          },
        });
    }

    for (const category of seedData.serviceCategorySeed) {
      await db
        .insert(schema.serviceCategories)
        .values({ ...category, isActive: true })
        .onConflictDoUpdate({
          target: schema.serviceCategories.slug,
          set: {
            name: category.name,
            description: category.description,
            displayOrder: category.displayOrder,
            isActive: true,
            updatedAt: new Date(),
          },
        });
    }

    console.log("Region and service category seed completed.");
  } finally {
    await closeDatabase();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Seed failed.");
  process.exitCode = 1;
});
