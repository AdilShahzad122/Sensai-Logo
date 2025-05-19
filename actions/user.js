"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { generateAIInsights } from "./dashboard";
import { checkUser } from "@/lib/checkUser";

// Helper function to update user data with transaction handling
async function updateUserData(userId, data) {
  try {
    // Check if we have valid data
    if (!data || !data.industry) {
      console.error("Missing required data for industry");
      throw new Error("Missing required data for profile update");
    }
    
    // Ensure skills is an array
    const skills = typeof data.skills === 'string'
      ? data.skills.split(',').map(skill => skill.trim())
      : Array.isArray(data.skills) ? data.skills : [];
    
    // Parse experience to integer
    const experience = data.experience ? parseInt(data.experience, 10) : 0;
    
    // Start a transaction to handle both operations
    const result = await db.$transaction(
      async (tx) => {
        // First check if industry exists
        let industryInsight = await tx.industryInsight.findUnique({
          where: {
            industry: data.industry,
          },
        });

        // If industry doesn't exist, create it with default values
        if (!industryInsight) {
          try {            const insights = await generateAIInsights(data.industry);
            // Normalize demandLevel and marketOutlook to match enum format
            const normalizedInsights = {
              ...insights,
              demandLevel: insights.demandLevel?.toUpperCase() || "MEDIUM",
              marketOutlook: insights.marketOutlook?.toUpperCase() || "NEUTRAL"
            };
            
            industryInsight = await tx.industryInsight.create({
              data: {
                industry: data.industry,
                salaryRanges: normalizedInsights.salaryRanges || [],
                growthRate: normalizedInsights.growthRate || 0,
                demandLevel: normalizedInsights.demandLevel,
                topSkills: normalizedInsights.topSkills || [],
                marketOutlook: normalizedInsights.marketOutlook,
                keyTrends: normalizedInsights.keyTrends || [],
                recommendedSkills: normalizedInsights.recommendedSkills || [],
                nextUpdated: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              },
            });
          } catch (insightError) {
            console.error("Error generating industry insights:", insightError);
            // Create minimal industry data if AI generation fails
            industryInsight = await tx.industryInsight.create({
              data: {
                industry: data.industry,
                salaryRanges: [],
                growthRate: 0,
                demandLevel: "MEDIUM",
                topSkills: [],
                marketOutlook: "NEUTRAL",
                keyTrends: [],
                recommendedSkills: [],
                nextUpdated: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              },
            });
          }
        }

        // Now update the user
        const updatedUser = await tx.user.update({
          where: {
            id: userId,
          },
          data: {
            industry: data.industry,
            experience: experience,
            bio: data.bio || "",
            skills: skills,
            onboardingCompleted: true,
          },
        });

        return { updatedUser, industryInsight };
      },
      {
        timeout: 15000, // increased timeout for transaction
      }
    );

    revalidatePath("/");
    return {...result.updatedUser, success: true};
  } catch (error) {
    console.error("Error updating user and industry:", error);
    throw new Error("Failed to update profile");
  }
}

export async function updateUser(data) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  // Get the current Clerk user without using checkUser to avoid circular dependencies
  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  // If user doesn't exist, we'll create it here directly rather than using checkUser
  // to avoid circular dependencies
  if (!user) {
    const { currentUser } = await import("@clerk/nextjs/server");
    const clerkUser = await currentUser();
    
    if (!clerkUser) throw new Error("No authenticated user found");
    
    const name = `${clerkUser.firstName} ${clerkUser.lastName}`;
    
    const newUser = await db.user.create({
      data: {
        clerkUserId: clerkUser.id,
        clerkId: clerkUser.id, // Adding clerkId which is required by the schema
        name,
        imageUrl: clerkUser.imageUrl,
        email: clerkUser.emailAddresses[0].emailAddress,
      },
    });
    
    // Use the newly created user
    return await updateUserData(newUser.id, data);
  }
  
  // Use the existing user
  return await updateUserData(user.id, data);
}

export async function getUserOnboardingStatus() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  try {
    // Get user with only the industry field to check onboarding status
    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
      select: {
        industry: true,
      },
    });

    if (!user) {
      console.log(`User with clerkUserId ${userId} not found in database`);
      // Instead of using checkUser and risking circular dependencies,
      // just return not onboarded and let the pages handle user creation
      return {
        isOnboarded: false
      };
    }

    return {
      isOnboarded: !!user.industry,
    };
  } catch (error) {
    console.error("Error checking onboarding status:", error);
    // Return not onboarded instead of throwing an error
    return {
      isOnboarded: false
    };
  }
}
