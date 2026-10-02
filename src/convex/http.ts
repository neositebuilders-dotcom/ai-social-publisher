import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { internal } from "./_generated/api";

const http = httpRouter();

auth.addHttpRoutes(http);

/**
 * OAuth 2.0 redirect target.
 *
 * The platform sends the user back here with `code` + `state`. The state nonce
 * (validated server-side) binds the callback to the user who started the flow,
 * which is our CSRF defence. On success or failure the user is bounced back to
 * the Connected accounts page with a readable result.
 */
http.route({
  path: "/oauth/callback",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");
    const site = (process.env.SITE_URL ?? "").replace(/\/$/, "");
    const target = `${site}/dashboard/accounts`;

    const redirect = (params: string) =>
      new Response(null, {
        status: 302,
        headers: { Location: `${target}?${params}` },
      });

    if (error) return redirect(`connect=error&reason=${encodeURIComponent(error)}`);
    if (!code || !state) {
      return redirect("connect=error&reason=Missing%20authorization%20code");
    }

    try {
      const result = await ctx.runAction(internal.oauthConnect.complete, {
        code,
        state,
      });
      return redirect(
        `connect=ok&platform=${result.platform}&name=${encodeURIComponent(
          result.displayName ?? result.platform,
        )}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "OAuth failed";
      return redirect(`connect=error&reason=${encodeURIComponent(message)}`);
    }
  }),
});

export default http;
