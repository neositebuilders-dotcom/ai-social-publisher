"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

const STALE_CLAIM_MS = 10 * 60 * 1000;
const CAMPAIGN_BATCH = 5;
const JOB_BATCH = 5;

/**
 * The heartbeat of the automation engine. Runs every minute from cron:
 *
 *  1. recover jobs abandoned mid-publish
 *  2. generate content for automations whose schedule has fired
 *  3. drain the publish queue through the platform adapters
 *
 * Jobs are claimed atomically before publishing, so a post can only ever be
 * published once even if two ticks overlap.
 */
export const tick = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    recovered: number;
    campaignsFired: number;
    generated: number;
    jobsProcessed: number;
  }> => {
    const now = Date.now();

    // 1. Never lose a job to a crashed worker.
    const recovered = await ctx.runMutation(internal.jobs.requeueStale, {
      now,
      staleAfterMs: STALE_CLAIM_MS,
    });

    // 2. Fire any automations that are due.
    const dueCampaigns = await ctx.runMutation(internal.campaigns.due, {
      now,
      limit: CAMPAIGN_BATCH,
    });
    let generated = 0;
    for (const campaign of dueCampaigns) {
      try {
        await ctx.runAction(internal.ai.generateInternal, {
          campaignId: campaign._id,
          userId: campaign.userId,
        });
        generated++;
      } catch (err) {
        await ctx.runMutation(internal.jobs.record, {
          userId: campaign.userId,
          level: "error",
          message: `Automation "${campaign.name}" failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
      }
      // Advance regardless, so one broken run cannot wedge the schedule.
      await ctx.runMutation(internal.campaigns.markRun, {
        campaignId: campaign._id,
        ranAt: now,
      });
    }

    // 3. Drain due publish jobs.
    const claimed = await ctx.runMutation(internal.jobs.claimDue, {
      now,
      limit: JOB_BATCH,
    });
    for (const job of claimed) {
      try {
        await ctx.runAction(internal.publish.publishJob, {
          jobId: job.jobId,
          postId: job.postId,
          campaignId: job.campaignId,
          userId: job.userId,
          platform: job.platform,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
        });
      } catch (err) {
        await ctx.runMutation(internal.jobs.finishFailure, {
          jobId: job.jobId,
          error: `Worker error: ${err instanceof Error ? err.message : String(err)}`,
          retryable: true,
          now: Date.now(),
        });
      }
    }

    return {
      recovered,
      campaignsFired: dueCampaigns.length,
      generated,
      jobsProcessed: claimed.length,
    };
  },
});
