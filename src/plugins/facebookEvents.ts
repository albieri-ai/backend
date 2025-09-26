import fp from "fastify-plugin";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
	trackPurchase,
	trackInitiateCheckout,
	trackAddToCart,
	trackViewContent,
} from "../services/facebookEvents";

const facebookEventsPlugin: FastifyPluginAsync = async (
	fastify: FastifyInstance,
) => {
	const accessToken = fastify.config.FACEBOOK_ACCESS_TOKEN;
	const pixelId = fastify.config.FACEBOOK_PIXEL_ID;

	if (!accessToken || !pixelId) {
		console.warn("Facebook access token or pixel ID not configured");
		return;
	}

	fastify.decorate("facebookTracker", {
		trackPurchase: (options: Parameters<typeof trackPurchase>[2]) =>
			trackPurchase(accessToken, pixelId, options),
		trackInitiateCheckout: (
			options: Parameters<typeof trackInitiateCheckout>[2],
		) => trackInitiateCheckout(accessToken, pixelId, options),
		trackAddToCart: (options: Parameters<typeof trackAddToCart>[2]) =>
			trackAddToCart(accessToken, pixelId, options),
		trackViewContent: (options: Parameters<typeof trackViewContent>[2]) =>
			trackViewContent(accessToken, pixelId, options),
	});
};

export default fp(facebookEventsPlugin, {
	name: "facebook-events",
});
