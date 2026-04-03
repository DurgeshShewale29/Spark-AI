import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import ChatHistory from "@/models/ChatHistory";
import AdminUser from "@/models/AdminUser";
import { currentUser, clerkClient } from "@clerk/nextjs/server";

export async function GET() {
  try {
    const user = await currentUser();
    const userEmail = user?.emailAddresses[0]?.emailAddress?.toLowerCase();
    if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectToDB();
    
    // Verify Admin Status
    const adminRecord = await AdminUser.findOne({ email: userEmail });
    if (!adminRecord) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // 1. 🚀 FIXED: Fetch the MASTER LIST of all registered users from Clerk first!
    const client = await clerkClient();
    const clerkUsersResponse = await client.users.getUserList({
      limit: 100 // Adjust if you expect hundreds of users
    });

    // 2. Fetch all project stats from the database
    const userStats = await ChatHistory.aggregate([
      {
        $group: {
          _id: "$userId",
          projectCount: { $sum: 1 },
          lastActive: { $max: "$timestamp" },
          projects: {
            $push: {
              id: "$id",
              title: "$title",
              framework: "$framework",
              timestamp: "$timestamp",
              isDeleted: "$isDeleted",
              messages: "$messages" 
            }
          }
        }
      }
    ]);

    // Create a fast lookup map for the database stats
    const dbStatsMap = new Map();
    userStats.forEach(stat => {
      dbStatsMap.set(stat._id, stat);
    });

    // 3. 🚀 FIXED: Merge the data! Guarantee EVERY user shows up, even with 0 projects.
    const formattedStats = clerkUsersResponse.data.map(clerkUser => {
      const dbStat = dbStatsMap.get(clerkUser.id);
      const realEmail = clerkUser.emailAddresses[0]?.emailAddress;

      // Determine the most accurate 'last active' time (Clerk login vs DB save)
      const clerkLastActive = clerkUser.lastSignInAt || clerkUser.createdAt;
      const finalLastActive = dbStat?.lastActive ? Math.max(dbStat.lastActive, clerkLastActive) : clerkLastActive;

      return {
        userId: clerkUser.id,
        email: realEmail || null, 
        projectCount: dbStat ? dbStat.projectCount : 0,
        lastActive: finalLastActive,
        projects: dbStat ? dbStat.projects.sort((a: { timestamp: number }, b: { timestamp: number }) => b.timestamp - a.timestamp) : []
      };
    });

    // Sort everyone so the most recently active people are at the top
    formattedStats.sort((a, b) => b.lastActive - a.lastActive);

    return NextResponse.json(formattedStats);
  } catch (error: unknown) {
    console.error("[ADMIN USERS API ERROR]:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

// DELETE: Admin forcefully deletes a user's project
export async function DELETE(req: Request) {
  try {
    const user = await currentUser();
    const userEmail = user?.emailAddresses[0]?.emailAddress?.toLowerCase();
    if (!userEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectToDB();
    
    // Verify Admin Status
    const adminRecord = await AdminUser.findOne({ email: userEmail });
    if (!adminRecord) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { projectId } = await req.json();
    if (!projectId) return NextResponse.json({ error: "Project ID required" }, { status: 400 });

    // Force delete the project directly from the database
    await ChatHistory.findOneAndDelete({ id: projectId });
    
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}