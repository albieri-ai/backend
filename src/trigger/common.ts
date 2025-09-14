import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { withTracing } from "@posthog/ai";
import { PostHog } from "posthog-node";
import { embed as embedFn } from "ai";

const posthogKey = "phc_YbJS5RdDYAH54LF6Rig4Cc4DOb9wITZgN6pmf2l69R1";

export const posthog = new PostHog(posthogKey, {
	host: "https://us.i.posthog.com",
	disabled: process.env.TRIGGER_ENV === "production" ? true : false,
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

export const embed = async (
	query: string,
	{
		traceId,
		distinctId,
		spanId,
		parentId,
		spanName = "index_document",
		persona,
	}: {
		traceId: string;
		distinctId: string;
		spanId: string;
		parentId?: string;
		spanName?: string;
		persona: string;
	},
) => {
	const startTime = Date.now();

	const result = await embedFn({
		model: openai.embedding("text-embedding-3-small"),
		value: query,
	});

	const duration = Date.now() - startTime;

	posthog.capture({
		event: "$ai_embedding",
		distinctId: distinctId,
		properties: {
			$ai_trace_id: traceId,
			$ai_model: "text-embedding-3-small",
			$ai_provider: "openai",
			$ai_input: query,
			$ai_input_tokens: result.usage.tokens,
			$ai_latency: duration,
			$ai_http_status: 200,
			$ai_is_error: false,
			$ai_embedding_dimension: result.embedding.length,
			$ai_span_name: spanName,
			$ai_span_id: spanId,
			$ai_parent_id: parentId,
			persona,
		},
	});

	return result;
};
