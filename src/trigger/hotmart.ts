import { task, logger } from "@trigger.dev/sdk";
import axios from "axios";
import { createDb } from "../database/db";
import {
	hotmartCourseLessons,
	hotmartCourseModules,
	hotmartCourses,
} from "../database/schema/hotmart";
import { hotmartVideoAssets, trainingAssets } from "../database/schema";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { IngestVideoFile } from "./ingest";

export const HotmartCourseImport = task({
	id: "hotmart-course-import",
	run: async (payload: {
		persona: string;
		token: string;
		hotmartId: string;
		id: string;
		createdBy: string;
	}) => {
		const { data: productInitialData } = await axios.get(
			`https://api-content-platform-space-gateway.cp.hotmart.com/rest/v1/memberships/products/${payload.hotmartId}`,
			{
				headers: {
					Authorization: `Bearer ${payload.token}`,
				},
			},
		);

		const slug = productInitialData.slug;

		logger.log(`slug: ${slug}`);

		const {
			data: { name, description, clubSubdomain },
		} = await axios.get<{
			id: number;
			name: string;
			description: string;
			clubSubdomain: string;
			categoryId: number;
			isDraft: boolean;
			status: string;
			backgroundImageFinal?: string;
		}>(
			`https://api-content-platform-space-gateway.cp.hotmart.com/rest/v1/admin/memberships/${slug}/products/${payload.hotmartId}/basic`,
			{
				headers: {
					Authorization: `Bearer ${payload.token}`,
				},
			},
		);

		logger.log(`${name}: ${description}`);

		const [{ data: normalModules }, { data: extraModules }] = await Promise.all(
			[
				axios.get<
					{
						classes: string[];
						extra: boolean;
						id: string;
						name: string;
						order: number;
						paidModule: boolean;
						publicModule: boolean;
						totalPages: number;
					}[]
				>("https://api-club-content.cb.hotmart.com/v4/modules/?extra=false", {
					headers: {
						Authorization: `Bearer ${payload.token}`,
						club: clubSubdomain,
					},
				}),
				axios.get<
					{
						classes: string[];
						extra: boolean;
						id: string;
						name: string;
						order: number;
						paidModule: boolean;
						publicModule: boolean;
						totalPages: number;
					}[]
				>("https://api-club-content.cb.hotmart.com/v4/modules/?extra=true", {
					headers: {
						Authorization: `Bearer ${payload.token}`,
						club: clubSubdomain,
					},
				}),
			],
		);

		const allModules = [...normalModules, ...extraModules];

		const lessons = await Promise.all(
			allModules.map((ap) =>
				axios
					.get<{ id: string; moduleId: string }[]>(
						`https://api-club-content.cb.hotmart.com/v4/modules/${ap.id}/pages`,
						{
							headers: {
								Authorization: `Bearer ${payload.token}`,
								club: clubSubdomain,
							},
						},
					)
					.then(({ data }) => data),
			),
		).then((r) => r.flatMap((r2) => r2));

		const lessonsContent = await Promise.all(
			lessons.map((l) =>
				axios
					.get<{
						page: {
							id: string;
							content: string;
							name: string;
						};
					}>(`https://api-club-content.cb.hotmart.com/v4/pages/${l.id}`, {
						headers: {
							Authorization: `Bearer ${payload.token}`,
							Club: clubSubdomain,
						},
					})
					.then(async ({ data }) => {
						const { data: medias } = await axios.get<
							{
								fileOrder: number;
								size: number;
								id: string;
								fileSignedUrl: string;
								thumborSignedUrl: string;
								name: string;
								creationDate: string;
								contentType: string;
								virtualName?: string;
								entityId?: string;
								expirationDate?: string;
								countAssociation?: string;
								playerMedia: {
									playerKey: string;
									status: string;
									type: string;
									duration: number;
								};
								useClubBucket?: boolean;
							}[]
						>(
							`https://api-club-content.cb.hotmart.com/v4/files/entity/${l.id}/PAGE_MEDIA`,
							{
								headers: {
									Authorization: `Bearer ${payload.token}`,
									Club: clubSubdomain,
								},
							},
						);

						return {
							...data.page,
							moduleId: l.moduleId,
							medias: medias
								.filter(
									(m) =>
										m.contentType.toLowerCase().includes("video") &&
										m.fileSignedUrl,
								)
								.map((n) => ({
									hotmartId: n.id,
									url: n.fileSignedUrl,
									name: n.name,
								})),
						};
					}),
			),
		);

		const { db } = await createDb({
			connectionString: process.env.DATABASE_URL!,
		});

		await db.transaction(async (trx) => {
			const [course] = await trx
				.insert(hotmartCourses)
				.values({
					persona: payload.persona,
					courseId: payload.hotmartId,
					name: name,
					description: description,
					createdBy: payload.createdBy,
				})
				.onConflictDoUpdate({
					target: [hotmartCourses.persona, hotmartCourses.courseId],
					set: {
						name: name,
						description: description,
					},
				})
				.returning();

			const modules = await trx
				.insert(hotmartCourseModules)
				.values(
					allModules.map((m) => ({
						hotmartId: m.id,
						course: course.id,
						name: m.name,
						paid: m.paidModule,
						public: m.publicModule,
						extra: m.extra,
					})),
				)
				.onConflictDoUpdate({
					target: [hotmartCourseModules.course, hotmartCourseModules.hotmartId],
					set: {
						name: sql`EXCLUDED.name`,
						paid: sql`EXCLUDED.paid`,
						public: sql`EXCLUDED.public`,
						extra: sql`EXCLUDED.extra`,
					},
				})
				.returning();

			const moduleHotmartIdMap = modules.reduce<Record<string, string>>(
				(acc, module) => {
					acc[module.hotmartId] = module.id;

					return acc;
				},
				{},
			);

			const lessons = await trx
				.insert(hotmartCourseLessons)
				.values(
					lessonsContent.map((l) => ({
						module: moduleHotmartIdMap[l.moduleId],
						name: l.name,
						hotmartId: l.id,
					})),
				)
				.onConflictDoUpdate({
					target: [hotmartCourseLessons.module, hotmartCourseLessons.hotmartId],
					set: {
						name: sql`EXCLUDED.name`,
					},
				})
				.returning({
					id: hotmartCourseLessons.id,
					hotmartId: hotmartCourseLessons.id,
				});

			const lessonHotmartIdMap = lessons.reduce<Record<string, string>>(
				(acc, it) => {
					acc[it.hotmartId] = it.id;

					return acc;
				},
				{},
			);

			const mediasToInsert = lessonsContent.flatMap((l) =>
				l.medias.map((media) => ({
					name: media.name,
					url: media.url,
					lesson: lessonHotmartIdMap[l.id],
					hotmartId: media.hotmartId,
				})),
			);

			console.log(lessonsContent);

			const mediasAlreadyProcessed = await trx
				.select({ hotmartId: hotmartVideoAssets.hotmartId })
				.from(trainingAssets)
				.leftJoin(
					hotmartVideoAssets,
					eq(hotmartVideoAssets.asset, trainingAssets.id),
				)
				.where(
					and(
						eq(trainingAssets.persona, payload.persona),
						eq(trainingAssets.type, "hotmart"),
						isNotNull(hotmartVideoAssets.hotmartId),
						inArray(
							hotmartVideoAssets.hotmartId,
							mediasToInsert.map((m) => m.hotmartId),
						),
					),
				);

			const mediasAlreadyProcessedMap = Object.fromEntries(
				mediasAlreadyProcessed.map(({ hotmartId }) => [hotmartId, true]),
			);

			const uniqueMediasToInsert = mediasToInsert.filter(
				(med) => !mediasAlreadyProcessedMap[med.hotmartId],
			);

			if (uniqueMediasToInsert.length) {
				const assets = await trx
					.insert(trainingAssets)
					.values(
						uniqueMediasToInsert.map(() => ({
							type: "hotmart" as const,
							status: "pending" as const,
							enabled: true,
							persona: payload.persona,
							createdBy: payload.createdBy,
						})),
					)
					.returning({ id: trainingAssets.id });

				const videosHotmartIdMap = uniqueMediasToInsert.reduce<
					Record<string, string>
				>((acc, med) => {
					acc[med.hotmartId] = med.url;

					return acc;
				}, {});

				const medias = await trx
					.insert(hotmartVideoAssets)
					.values(
						uniqueMediasToInsert.map((med, index) => ({
							asset: assets[index].id,
							lesson: med.lesson,
							hotmartId: med.hotmartId,
							name: med.name,
						})),
					)
					.returning({
						asset: hotmartVideoAssets.asset,
						hotmartId: hotmartVideoAssets.hotmartId,
					});

				await IngestVideoFile.batchTrigger(
					medias.map((med) => ({
						payload: {
							url: videosHotmartIdMap[med.hotmartId],
							assetID: med.asset,
						},
					})),
				);
			}
		});
	},
});
