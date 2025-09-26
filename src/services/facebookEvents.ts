import FacebookSDK, { ServerEvent } from "facebook-nodejs-business-sdk";

export interface FacebookEventOptions {
	email: string;
	phone?: string;
	ipAddress?: string;
	userAgent?: string;
	currency?: string;
	amount?: number;
	timestamp?: number;
	successUrl?: string;
}

export function createEventRequest(
	accessToken: string,
	pixelId: string,
	userData: FacebookSDK.UserData,
	customData: FacebookSDK.CustomData,
	eventName: string,
	timestamp?: number,
	successUrl?: string,
) {
	const serverEvent = new ServerEvent()
		.setEventName(eventName)
		.setUserData(userData)
		.setCustomData(customData)
		.setActionSource("website");

	if (timestamp) {
		serverEvent.setEventTime(timestamp);
	}

	if (successUrl) {
		serverEvent.setEventSourceUrl(successUrl);
	}

	return new FacebookSDK.EventRequest(accessToken, pixelId).setEvents([
		serverEvent,
	]);
}

export function createUserData(options: FacebookEventOptions) {
	const userData = new FacebookSDK.UserData();

	if (options.email) {
		userData.setEmail(options.email);
	}

	if (options.phone) {
		userData.setPhone(options.phone);
	}

	if (options.ipAddress) {
		userData.setClientIpAddress(options.ipAddress);
	}

	if (options.userAgent) {
		userData.setClientUserAgent(options.userAgent);
	}

	return userData;
}

export function createCustomData(options: FacebookEventOptions) {
	const customData = new FacebookSDK.CustomData();

	if (options.currency) {
		customData.setCurrency(options.currency);
	}

	if (options.amount) {
		customData.setValue(options.amount);
	}

	return customData;
}

export function trackEvent(
	accessToken: string,
	pixelId: string,
	eventName: string,
	options: FacebookEventOptions,
) {
	try {
		const userData = createUserData(options);
		const customData = createCustomData(options);
		const eventRequest = createEventRequest(
			accessToken,
			pixelId,
			userData,
			customData,
			eventName,
			options.timestamp,
			options.successUrl,
		);

		return eventRequest.execute();
	} catch (error) {
		console.error("Failed to track Facebook event:", error);
		throw error;
	}
}

export function trackPurchase(
	accessToken: string,
	pixelId: string,
	options: FacebookEventOptions,
) {
	return trackEvent(accessToken, pixelId, "Purchase", options);
}

export function trackInitiateCheckout(
	accessToken: string,
	pixelId: string,
	options: FacebookEventOptions,
) {
	return trackEvent(accessToken, pixelId, "InitiateCheckout", options);
}

export function trackAddToCart(
	accessToken: string,
	pixelId: string,
	options: FacebookEventOptions,
) {
	return trackEvent(accessToken, pixelId, "AddToCart", options);
}

export function trackViewContent(
	accessToken: string,
	pixelId: string,
	options: FacebookEventOptions,
) {
	return trackEvent(accessToken, pixelId, "ViewContent", options);
}
