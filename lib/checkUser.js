import { currentUser } from "@clerk/nextjs/server";
import { db } from "./prisma";

export const checkUser = async () => {
  const user = await currentUser();

  if (!user) {
    return null;
  }

  try {
    const loggedInUser = await db.user.findUnique({
      where: {
        clerkUserId: user.id,
      },
    });

    if (loggedInUser) {
      return loggedInUser;
    }

    const name = `${user.firstName || ''} ${user.lastName || ''}`;
    const email = user.emailAddresses?.length > 0 
      ? user.emailAddresses[0].emailAddress 
      : '';
      
    if (!email) {
      console.error('No email address found for user');
      return null;
    }

    // Create user without industry relation initially
    const newUser = await db.user.create({
      data: {
        clerkUserId: user.id,
        clerkId: user.id,
        name: name.trim(),  // Trim to handle case where firstName or lastName might be empty
        imageUrl: user.imageUrl || '',
        email,
      },
    });

    return newUser;
  } catch (error) {
    console.error('Error in checkUser:', error);
    // Return null but don't throw to prevent server component errors
    return null;
  }
};
