import type { FastifyInstance, FastifyServerOptions } from "fastify";
import z from "zod";
import { eq } from "drizzle-orm";
import { vimeoAccounts } from "../../../database/schema";
import axios from "axios";

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	const redirectUrl = `${fastify.config.APP_URL}/accounts/vimeo/callback`;

	const getToken = async (code: string): Promise<string> => {
		const { data } = await axios.post(
			"https://api.vimeo.com/oauth/access_token",
			{
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUrl,
			},
			{
				headers: {
					Accept: "application/vnd.vimeo.*+json;version=3.4",
					"Content-Type": "application/json",
				},
				auth: {
					username: fastify.config.VIMEO_CLIENT_ID,
					password: fastify.config.VIMEO_CLIENT_SECRET,
				},
			},
		);

		return data.access_token;
	};

	fastify.post<{ Body: { code: string; state: string } }>(
		"/verify",
		{
			schema: {
				body: z.object({
					code: z.string(),
					state: z.string(),
				}),
			},
		},
		async (request, reply) => {
			const token = await getToken(request.body.code);

			const accounts = await fastify.db
				.update(vimeoAccounts)
				.set({
					code: request.body.code,
					token,
				})
				.where(eq(vimeoAccounts.state, request.body.state))
				.returning();

			if (!accounts.length) {
				return reply.status(404).send({ error: "Account not found" });
			}

			return reply.status(204).send();
		},
	);
}
