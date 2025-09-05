import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { withTracing } from "@posthog/ai";
import { PostHog } from "posthog-node";

const posthogKey = "phc_YbJS5RdDYAH54LF6Rig4Cc4DOb9wITZgN6pmf2l69R1";

export const posthog = new PostHog(posthogKey, {
	host: "https://us.i.posthog.com",
});

export const openai = createOpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

export const groq = createGroq({
	apiKey: process.env.GROQ_API_KEY,
});

export const gptOss120 = (properties?: { persona: string }) =>
	withTracing(groq("openai/gpt-oss-120b"), posthog, {
		posthogProperties: properties,
	});
