import { pgView } from "drizzle-orm/pg-core";
import { count, eq, isNull } from "drizzle-orm";
import { hotmartCourseModules, hotmartCourseLessons } from "./hotmart";
import {
	hotmartVideoAssets,
	rssFeedAssets,
	trainingAssets,
	youtubeVideoAssets,
} from "./training";
import { rssFeeds } from "./rss";
import { youtubeChannelsVideos } from "./youtube";

export const hotmartCourseLessonCount = pgView(
	"hotmart_course_lesson_count",
).as((qb) =>
	qb
		.select({
			course: hotmartCourseModules.course,
			count: count(hotmartCourseLessons.id).as("count"),
		})
		.from(hotmartCourseLessons)
		.leftJoin(
			hotmartCourseModules,
			eq(hotmartCourseModules.id, hotmartCourseLessons.module),
		)
		.leftJoin(
			hotmartVideoAssets,
			eq(hotmartVideoAssets.lesson, hotmartCourseLessons.id),
		)
		.leftJoin(trainingAssets, eq(hotmartVideoAssets.asset, trainingAssets.id))
		.where(isNull(trainingAssets.deletedAt))
		.groupBy(hotmartCourseModules.course),
);

export const hotmartCourseVideoCount = pgView("hotmart_course_video_count").as(
	(qb) =>
		qb
			.select({
				course: hotmartCourseModules.course,
				count: count(hotmartVideoAssets.id).as("count"),
			})
			.from(hotmartVideoAssets)
			.leftJoin(
				hotmartCourseLessons,
				eq(hotmartCourseLessons.id, hotmartVideoAssets.lesson),
			)
			.leftJoin(
				hotmartCourseModules,
				eq(hotmartCourseModules.id, hotmartCourseLessons.module),
			)
			.leftJoin(trainingAssets, eq(hotmartVideoAssets.asset, trainingAssets.id))
			.where(isNull(trainingAssets.deletedAt))
			.groupBy(hotmartCourseModules.course),
);

export const rssFeedAssetCount = pgView("rss_feed_asset_count").as((qb) => {
	return qb
		.select({
			channel: rssFeeds.id,
			count: count(rssFeedAssets.id).as("count"),
		})
		.from(rssFeedAssets)
		.leftJoin(rssFeeds, eq(rssFeeds.id, rssFeedAssets.feed))
		.leftJoin(trainingAssets, eq(trainingAssets.id, rssFeedAssets.asset))
		.where(isNull(trainingAssets.deletedAt))
		.groupBy(rssFeeds.id);
});

export const youtubeChannelsVideoCount = pgView(
	"youtube_channels_video_count",
).as((qb) =>
	qb
		.select({
			channel: youtubeChannelsVideos.channel,
			count: count(youtubeChannelsVideos.id).as("count"),
		})
		.from(youtubeChannelsVideos)
		.leftJoin(
			youtubeVideoAssets,
			eq(youtubeChannelsVideos.id, youtubeVideoAssets.channelVideo),
		)
		.leftJoin(trainingAssets, eq(trainingAssets.id, youtubeVideoAssets.asset))
		.where(isNull(trainingAssets.deletedAt))
		.groupBy(youtubeChannelsVideos.channel),
);
