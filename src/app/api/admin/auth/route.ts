import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import AdminUser from "@/models/AdminUser";
import { currentUser } from "@clerk/nextjs/server";

export async function GET() {
  try {
    await connectToDB();
    const user = await currentUser();
    const userEmail = user?.emailAddresses[0]?.emailAddress?.toLowerCase() || null;

    const admins = await AdminUser.find({}).sort({ createdAt: 1 });
    const isSystemClaimed = admins.length > 0;
    
    let isCurrentUserAdmin = false;
    let isCurrentUserPrimary = false;

    if (userEmail) {
      const myRecord = admins.find(a => a.email === userEmail);
      if (myRecord) {
        isCurrentUserAdmin = true;
        isCurrentUserPrimary = myRecord.isPrimary;
      }
    }

    return NextResponse.json({
      isSystemClaimed,
      isCurrentUserAdmin,
      isCurrentUserPrimary,
      admins: isCurrentUserPrimary ? admins : [] // Only send the list to the Primary Admin
    });
  } catch (error) {
    return NextResponse.json({ error: "Auth Check Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectToDB();
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    const userEmail = user.emailAddresses[0]?.emailAddress?.toLowerCase();
    if (!userEmail) return NextResponse.json({ error: "No email found" }, { status: 400 });

    const { action, emailToAdd } = await req.json();
    const admins = await AdminUser.find({});

    // CLAIM PRIMARY SYSTEM
    if (action === "claim") {
      if (admins.length > 0) return NextResponse.json({ error: "System already claimed" }, { status: 403 });
      const newAdmin = await AdminUser.create({ email: userEmail, isPrimary: true });
      return NextResponse.json({ success: true, admin: newAdmin });
    }

    // ADD SECONDARY ADMIN
    if (action === "add") {
      const myRecord = admins.find(a => a.email === userEmail);
      if (!myRecord || !myRecord.isPrimary) return NextResponse.json({ error: "Only the Primary Admin can add users" }, { status: 403 });
      
      if (!emailToAdd) return NextResponse.json({ error: "Email to add is required" }, { status: 400 });
      
      const existing = await AdminUser.findOne({ email: emailToAdd.toLowerCase().trim() });
      if (existing) return NextResponse.json({ error: "Admin already exists" }, { status: 400 });

      const newAdmin = await AdminUser.create({ email: emailToAdd.toLowerCase().trim(), isPrimary: false });
      return NextResponse.json({ success: true, admin: newAdmin });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: "Request Failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await connectToDB();
    const user = await currentUser();
    const userEmail = user?.emailAddresses[0]?.emailAddress?.toLowerCase();
    
    const myRecord = await AdminUser.findOne({ email: userEmail });
    if (!myRecord || !myRecord.isPrimary) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { id } = await req.json();
    
    const targetAdmin = await AdminUser.findById(id);
    if (!targetAdmin) return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    if (targetAdmin.isPrimary) return NextResponse.json({ error: "Cannot delete the primary admin" }, { status: 403 });

    await AdminUser.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Deletion failed" }, { status: 500 });
  }
}