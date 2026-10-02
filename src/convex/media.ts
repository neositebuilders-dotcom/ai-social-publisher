import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/ctx";
import { contentTypeValidator } from "./schema";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("mediaAssets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200);
  },
});

/** Step 1 of an upload: get a short-lived storage URL for the browser. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Step 2: register the uploaded file in the media library. */
export const createFromUpload = mutation({
  args: {
    storageId: v.id("_storage"),
    name: v.string(),
    kind: contentTypeValidator,
  },
  handler: async (ctx, { storageId, name, kind }) => {
    const userId = await requireUserId(ctx);
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Uploaded file could not be resolved.");
    return await ctx.db.insert("mediaAssets", {
      userId,
      name: name.trim() || "Untitled asset",
      kind,
      url,
      source: "upload",
      createdAt: Date.now(),
    });
  },
});

export const createFromUrl = mutation({
  args: {
    name: v.string(),
    url: v.string(),
    kind: contentTypeValidator,
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    let parsed: URL;
    try {
      parsed = new URL(args.url);
    } catch {
      throw new Error("Enter a valid http(s) URL.");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Only http(s) URLs are supported.");
    }
    return await ctx.db.insert("mediaAssets", {
      userId,
      name: args.name.trim() || parsed.hostname,
      kind: args.kind,
      url: args.url,
      width: args.width,
      height: args.height,
      source: "url",
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { assetId: v.id("mediaAssets") },
  handler: async (ctx, { assetId }) => {
    const userId = await requireUserId(ctx);
    const asset = await ctx.db.get(assetId);
    if (!asset || asset.userId !== userId) throw new Error("Asset not found");
    await ctx.db.delete(assetId);
  },
});
