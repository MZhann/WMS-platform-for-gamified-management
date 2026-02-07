import { User } from "../models/User"

const ADMIN_EMAIL = "admin@gmail.com"
const ADMIN_PASSWORD = "Qwerty1234"
const ADMIN_NAME = "Admin"

export const seedAdminUser = async (): Promise<void> => {
  try {
    const existingAdmin = await User.findOne({ email: ADMIN_EMAIL })
    if (existingAdmin) {
      // Ensure existing admin has isAdmin flag
      if (!existingAdmin.isAdmin) {
        existingAdmin.isAdmin = true
        await existingAdmin.save()
        console.log("✅ Admin user updated with isAdmin flag")
      }
      return
    }

    const admin = new User({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      name: ADMIN_NAME,
      isAdmin: true,
    })
    await admin.save()
    console.log("✅ Admin user created (admin@gmail.com / Qwerty1234)")
  } catch (error) {
    console.error("❌ Failed to seed admin user:", error)
  }
}
