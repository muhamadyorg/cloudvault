import { storage } from "./storage";

export async function seedDatabase() {
  const existingAdmin = await storage.getUserByUsername("muhamadyorg");
  if (!existingAdmin) {
    await storage.createUser({
      username: "muhamadyorg",
      password: "1234",
      role: "admin",
    });
    console.log("Admin user created: muhamadyorg");
  }

  const existingUser = await storage.getUserByUsername("user");
  if (!existingUser) {
    await storage.createUser({
      username: "user",
      password: "user123",
      role: "user",
    });
    console.log("Regular user created: user");
  }
}
