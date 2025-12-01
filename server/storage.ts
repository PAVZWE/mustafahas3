import { 
  type User, 
  type InsertUser, 
  type Post, 
  type InsertPost,
  type Like,
  type InsertLike,
  type Comment,
  type InsertComment,
  users,
  posts,
  likes,
  comments
} from "@shared/schema";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, desc, sql } from "drizzle-orm";

const client = neon(process.env.DATABASE_URL!);
const db = drizzle(client);

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getPosts(): Promise<(Post & { likeCount: number; commentCount: number })[]>;
  getPost(id: string): Promise<Post | undefined>;
  getPostsByRoom(roomId: string): Promise<Post[]>;
  createPost(post: InsertPost): Promise<Post>;
  
  getLikesByPost(postId: string): Promise<Like[]>;
  getLikesCount(postId: string): Promise<number>;
  checkUserLike(postId: string, userId: string): Promise<boolean>;
  checkLike(postId: string, userId: string): Promise<boolean>;
  addLike(postId: string, userId: string): Promise<void>;
  toggleLike(postId: string, userId: string): Promise<{ liked: boolean }>;
  
  getCommentsByPost(postId: string): Promise<Comment[]>;
  getComments(postId: string): Promise<string[]>;
  addComment(postId: string, text: string): Promise<void>;
  createComment(comment: InsertComment): Promise<Comment>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async getPosts(): Promise<(Post & { likeCount: number; commentCount: number })[]> {
    const result = await db
      .select({
        id: posts.id,
        authorName: posts.authorName,
        authorHandle: posts.authorHandle,
        authorAvatar: posts.authorAvatar,
        content: posts.content,
        image: posts.image,
        createdAt: posts.createdAt,
        likeCount: sql<number>`CAST(COUNT(DISTINCT ${likes.id}) AS INTEGER)`,
        commentCount: sql<number>`CAST(COUNT(DISTINCT ${comments.id}) AS INTEGER)`,
      })
      .from(posts)
      .leftJoin(likes, eq(posts.id, likes.postId))
      .leftJoin(comments, eq(posts.id, comments.postId))
      .groupBy(posts.id)
      .orderBy(desc(posts.createdAt));

    return result;
  }

  async getPost(id: string): Promise<Post | undefined> {
    const result = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    return result[0];
  }

  async getPostsByRoom(roomId: string): Promise<Post[]> {
    // Since posts don't have a roomId field, we'll return all posts
    // You can filter by roomId if needed in schema later
    const result = await db.select().from(posts).orderBy(desc(posts.createdAt));
    return result;
  }

  async createPost(insertPost: InsertPost): Promise<Post> {
    const result = await db.insert(posts).values(insertPost).returning();
    return result[0];
  }

  async getLikesByPost(postId: string): Promise<Like[]> {
    return await db.select().from(likes).where(eq(likes.postId, postId));
  }

  async getLikesCount(postId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(likes)
      .where(eq(likes.postId, postId));
    return result[0]?.count || 0;
  }

  async checkUserLike(postId: string, userId: string): Promise<boolean> {
    const result = await db
      .select()
      .from(likes)
      .where(sql`${likes.postId} = ${postId} AND ${likes.userId} = ${userId}`)
      .limit(1);
    return result.length > 0;
  }

  async checkLike(postId: string, userId: string): Promise<boolean> {
    return this.checkUserLike(postId, userId);
  }

  async addLike(postId: string, userId: string): Promise<void> {
    await db.insert(likes).values({ postId, userId });
  }

  async toggleLike(postId: string, userId: string): Promise<{ liked: boolean }> {
    const existingLike = await db
      .select()
      .from(likes)
      .where(sql`${likes.postId} = ${postId} AND ${likes.userId} = ${userId}`)
      .limit(1);

    if (existingLike.length > 0) {
      await db.delete(likes).where(eq(likes.id, existingLike[0].id));
      return { liked: false };
    } else {
      await db.insert(likes).values({ postId, userId });
      return { liked: true };
    }
  }

  async getCommentsByPost(postId: string): Promise<Comment[]> {
    return await db
      .select()
      .from(comments)
      .where(eq(comments.postId, postId))
      .orderBy(comments.createdAt);
  }

  async getComments(postId: string): Promise<string[]> {
    const result = await db
      .select({ content: comments.content })
      .from(comments)
      .where(eq(comments.postId, postId))
      .orderBy(comments.createdAt);
    return result.map(c => c.content);
  }

  async addComment(postId: string, text: string): Promise<void> {
    await db.insert(comments).values({
      postId,
      content: text,
      author: 'زائر',
      avatar: 'https://via.placeholder.com/60'
    });
  }

  async createComment(insertComment: InsertComment): Promise<Comment> {
    const result = await db.insert(comments).values(insertComment).returning();
    return result[0];
  }
}

export const storage = new DatabaseStorage();
