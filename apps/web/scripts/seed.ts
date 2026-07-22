import { config } from "dotenv";

config({ path: ".env.local" });
config();

const [{ getDatabase }, { regions, serviceCategories }, seedData] =
  await Promise.all([
    import("../src/db"),
    import("../src/db/schema"),
    import("../src/db/seed-data"),
  ]);

const db = getDatabase();

for (const region of seedData.regionSeed) {
  await db
    .insert(regions)
    .values({ ...region, isActive: true })
    .onConflictDoUpdate({
      target: regions.slug,
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
    .insert(serviceCategories)
    .values({ ...category, isActive: true })
    .onConflictDoUpdate({
      target: serviceCategories.slug,
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
